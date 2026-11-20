import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { App } from './registry.ts';

export const flagsSchemaUrl = 'https://flagd.dev/schema/v0/flags.json';
export const flagsFileName = 'flags.json';
export const flagdEnvFile = '.env';

const flagKey = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const variantSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.record(z.string(), z.json()),
]);

const flagSchema = z
  .strictObject({
    state: z.enum(['ENABLED', 'DISABLED']),
    variants: z
      .record(z.string().min(1), variantSchema)
      .refine((variants) => Object.keys(variants).length > 0, 'must list at least one variant'),
    defaultVariant: z.string().min(1),
    targeting: z.record(z.string(), z.json()).optional(),
    metadata: z.strictObject({ removeBy: z.iso.date() }),
  })
  .refine((flag) => Object.hasOwn(flag.variants, flag.defaultVariant), {
    message: 'defaultVariant must name one of the variants',
    path: ['defaultVariant'],
  });

const flagsFileSchema = z.strictObject({
  $schema: z.literal(flagsSchemaUrl),
  metadata: z.strictObject({ flagSetId: z.string().min(1) }),
  $evaluators: z.record(z.string(), z.json()).optional(),
  flags: z
    .record(z.string(), flagSchema)
    .refine((flags) => Object.keys(flags).every((key) => flagKey.test(key)), {
      message: 'flag keys must be kebab-case, such as new-checkout',
    }),
});

export type FlagsFile = z.output<typeof flagsFileSchema>;

export interface AppFlags {
  readonly app: string;
  readonly file: string;
  readonly flags: FlagsFile;
}

export interface ExpiredFlag {
  readonly app: string;
  readonly flag: string;
  readonly removeBy: string;
}

export class FlagsError extends Error {
  override readonly name = 'FlagsError';
}

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function readFlags(
  appsDir: string,
  apps: readonly Pick<App, 'name'>[]
): Promise<AppFlags[]> {
  const found: AppFlags[] = [];
  for (const app of apps) {
    const file = join(appsDir, app.name, flagsFileName);
    const text = await readOptional(file);
    if (text === undefined) {
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new FlagsError(`${file} is not valid JSON`);
    }
    const parsed = flagsFileSchema.safeParse(json);
    if (!parsed.success) {
      throw new FlagsError(`${file} is invalid: ${z.prettifyError(parsed.error)}`);
    }
    if (parsed.data.metadata.flagSetId !== app.name) {
      throw new FlagsError(
        `${file} sets flagSetId ${parsed.data.metadata.flagSetId}, but its app is ${app.name}`
      );
    }
    found.push({ app: app.name, file, flags: parsed.data });
  }
  return found;
}

export function expiredFlags(appFlags: readonly AppFlags[], on: string): ExpiredFlag[] {
  return appFlags.flatMap(({ app, flags }) =>
    Object.entries(flags.flags)
      .filter(([, flag]) => flag.metadata.removeBy < on)
      .map(([flag, { metadata }]) => ({ app, flag, removeBy: metadata.removeBy }))
  );
}

export function flagdSources(appFlags: readonly AppFlags[]): string {
  return JSON.stringify(
    appFlags.map(({ app }) => ({ uri: `/apps/${app}/${flagsFileName}`, provider: 'file' }))
  );
}

export function flagdEnv(appFlags: readonly AppFlags[]): string {
  return `FLAGD_SOURCES='${flagdSources(appFlags)}'\n`;
}

export async function provisionFlags(
  appsDir: string,
  localDir: string,
  apps: readonly Pick<App, 'name'>[],
  on: string = today()
): Promise<{ apps: string[]; expired: ExpiredFlag[] }> {
  const appFlags = await readFlags(appsDir, apps);
  await writeFile(join(localDir, flagdEnvFile), flagdEnv(appFlags));
  return { apps: appFlags.map(({ app }) => app), expired: expiredFlags(appFlags, on) };
}
