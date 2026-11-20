import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';

const producerSchema = z.strictObject({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'must be a kebab-case name such as cv-web'),
  key: z.string().min(32, 'must be at least 32 characters'),
  senders: z.array(z.email()).min(1, 'must list at least one sender'),
});

const producersSchema = z
  .array(producerSchema)
  .refine(
    (producers) => new Set(producers.map((producer) => producer.name)).size === producers.length,
    {
      message: 'producer names must be unique',
    }
  );

export type LocalProducer = z.output<typeof producerSchema>;

export interface ProducerRequest {
  readonly name: string;
  readonly senders: readonly string[];
}

export const producersFile = 'notifications-producers.json';
export const notificationsEnvFile = 'notifications-api.env';
export const defaultProducer: ProducerRequest = {
  name: 'local-dev',
  senders: ['dev@zigordev.test'],
};

export class ProducersError extends Error {
  override readonly name = 'ProducersError';
}

export function createProducerKey(): string {
  return randomBytes(32).toString('base64url');
}

export function hashProducerKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

function parseProducer(candidate: unknown): LocalProducer {
  const parsed = producerSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ProducersError(`the producer is invalid: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function upsertProducer(
  producers: readonly LocalProducer[],
  request: ProducerRequest,
  createKey: () => string = createProducerKey
): { producers: LocalProducer[]; producer: LocalProducer; created: boolean } {
  const existing = producers.find((producer) => producer.name === request.name);
  const producer = parseProducer({
    name: request.name,
    key: existing?.key ?? createKey(),
    senders: [...request.senders],
  });
  return {
    producers:
      existing === undefined
        ? [...producers, producer]
        : producers.map((candidate) => (candidate.name === producer.name ? producer : candidate)),
    producer,
    created: existing === undefined,
  };
}

export function withDefaultProducer(producers: readonly LocalProducer[]): {
  producers: LocalProducer[];
  created: boolean;
} {
  if (producers.some((producer) => producer.name === defaultProducer.name)) {
    return { producers: [...producers], created: false };
  }
  const { producers: next } = upsertProducer(producers, defaultProducer);
  return { producers: next, created: true };
}

export function notificationsEnv(producers: readonly LocalProducer[]): string {
  const entries = producers.map(({ name, key, senders }) => ({
    name,
    keySha256: hashProducerKey(key),
    senders,
  }));
  return `PRODUCERS=${JSON.stringify(entries)}\n`;
}

export async function readProducers(localDir: string): Promise<LocalProducer[]> {
  const file = join(localDir, producersFile);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProducersError(`${file} is not valid JSON`);
  }
  const parsed = producersSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProducersError(`${file} is invalid: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

async function writeProducers(
  localDir: string,
  producers: readonly LocalProducer[]
): Promise<void> {
  await writeFile(join(localDir, producersFile), `${JSON.stringify(producers, null, 2)}\n`, {
    mode: 0o600,
  });
  await writeFile(join(localDir, notificationsEnvFile), notificationsEnv(producers), {
    mode: 0o600,
  });
}

export async function provisionProducers(
  localDir: string
): Promise<{ created: boolean; names: string[] }> {
  const { producers, created } = withDefaultProducer(await readProducers(localDir));
  await writeProducers(localDir, producers);
  return { created, names: producers.map((producer) => producer.name) };
}

export async function addProducer(
  localDir: string,
  request: ProducerRequest
): Promise<LocalProducer> {
  const { producers: current } = withDefaultProducer(await readProducers(localDir));
  const { producers, producer } = upsertProducer(current, request);
  await writeProducers(localDir, producers);
  return producer;
}
