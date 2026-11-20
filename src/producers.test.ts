import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addProducer,
  createProducerKey,
  defaultProducer,
  hashProducerKey,
  type LocalProducer,
  notificationsEnv,
  notificationsEnvFile,
  ProducersError,
  producersFile,
  provisionProducers,
  readProducers,
  upsertProducer,
  withDefaultProducer,
} from './producers.ts';

let localDir: string;

const playground: LocalProducer = {
  name: 'playground-api',
  key: 'k'.repeat(43),
  senders: ['noreply@playground.test'],
};

async function readEnvProducers(): Promise<unknown> {
  const text = await readFile(join(localDir, notificationsEnvFile), 'utf8');
  expect(text).toMatch(/^PRODUCERS=\S+\n$/);
  return JSON.parse(text.slice('PRODUCERS='.length));
}

async function storedProducers(): Promise<LocalProducer[]> {
  return JSON.parse(await readFile(join(localDir, producersFile), 'utf8')) as LocalProducer[];
}

beforeEach(async () => {
  localDir = await mkdtemp(join(tmpdir(), 'platform-local-'));
});

afterEach(async () => {
  await rm(localDir, { recursive: true, force: true });
});

describe('createProducerKey', () => {
  it('makes a different 32-byte base64url key each time', () => {
    const first = createProducerKey();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createProducerKey()).not.toBe(first);
  });
});

describe('hashProducerKey', () => {
  it('returns the SHA-256 of the key in hex', () => {
    expect(hashProducerKey('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('upsertProducer', () => {
  it('adds a new producer with a new key', () => {
    const result = upsertProducer([], { name: 'cv-web', senders: ['hello@cv.test'] }, () =>
      'n'.repeat(43)
    );

    expect(result).toEqual({
      producers: [{ name: 'cv-web', key: 'n'.repeat(43), senders: ['hello@cv.test'] }],
      producer: { name: 'cv-web', key: 'n'.repeat(43), senders: ['hello@cv.test'] },
      created: true,
    });
  });

  it('keeps the key of a producer it already has and replaces its senders', () => {
    const result = upsertProducer(
      [playground],
      { name: 'playground-api', senders: ['team@playground.test'] },
      () => {
        throw new Error('no new key should be made');
      }
    );

    expect(result.created).toBe(false);
    expect(result.producers).toEqual([{ ...playground, senders: ['team@playground.test'] }]);
  });

  it.each([
    ['a name that is not kebab-case', { name: 'Playground', senders: ['a@b.test'] }, /kebab-case/],
    ['a sender that is not an email', { name: 'cv-web', senders: ['cv-web'] }, /senders/],
    ['no sender', { name: 'cv-web', senders: [] }, /at least one sender/],
  ])('rejects %s', (_case, request, message) => {
    expect(() => upsertProducer([], request)).toThrow(ProducersError);
    expect(() => upsertProducer([], request)).toThrow(message);
  });
});

describe('withDefaultProducer', () => {
  it('adds local-dev when it is missing', () => {
    const { producers, created } = withDefaultProducer([playground]);

    expect(created).toBe(true);
    expect(producers.map((producer) => producer.name)).toEqual(['playground-api', 'local-dev']);
    expect(producers[1]?.senders).toEqual(defaultProducer.senders);
  });

  it('leaves an existing local-dev as it is', () => {
    const localDev = { name: 'local-dev', key: 'd'.repeat(43), senders: ['me@zigordev.test'] };

    expect(withDefaultProducer([localDev])).toEqual({ producers: [localDev], created: false });
  });
});

describe('notificationsEnv', () => {
  it('lists each producer with the hash of its key, never the key', () => {
    const env = notificationsEnv([playground]);

    expect(env).toBe(
      `PRODUCERS=${JSON.stringify([
        {
          name: 'playground-api',
          keySha256: hashProducerKey(playground.key),
          senders: ['noreply@playground.test'],
        },
      ])}\n`
    );
    expect(env).not.toContain(playground.key);
  });
});

describe('readProducers', () => {
  it('treats a missing file as no producers', async () => {
    expect(await readProducers(localDir)).toEqual([]);
  });

  it('passes on errors other than a missing file', async () => {
    await mkdir(join(localDir, producersFile));

    await expect(readProducers(localDir)).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it.each([
    ['text that is not JSON', '{', /is not valid JSON/],
    ['a producer without a key', '[{"name":"cv-web","senders":["a@b.test"]}]', /is invalid/],
    [
      'two producers with one name',
      JSON.stringify([playground, playground]),
      /producer names must be unique/,
    ],
  ])('rejects %s', async (_case, text, message) => {
    await writeFile(join(localDir, producersFile), text);

    await expect(readProducers(localDir)).rejects.toThrow(ProducersError);
    await expect(readProducers(localDir)).rejects.toThrow(message);
  });
});

describe('provisionProducers', () => {
  it('creates local-dev on the first run and writes its hash for notifications-api', async () => {
    const result = await provisionProducers(localDir);
    const [localDev] = await storedProducers();

    expect(result).toEqual({ created: true, names: ['local-dev'] });
    expect(localDev).toMatchObject({ name: 'local-dev', senders: ['dev@zigordev.test'] });
    expect(await readEnvProducers()).toEqual([
      {
        name: 'local-dev',
        keySha256: hashProducerKey(localDev?.key ?? ''),
        senders: ['dev@zigordev.test'],
      },
    ]);
    expect((await stat(join(localDir, producersFile))).mode & 0o777).toBe(0o600);
  });

  it('keeps the keys it already has on later runs', async () => {
    await provisionProducers(localDir);
    const before = await storedProducers();

    expect(await provisionProducers(localDir)).toEqual({ created: false, names: ['local-dev'] });
    expect(await storedProducers()).toEqual(before);
  });
});

describe('addProducer', () => {
  it('adds a producer beside local-dev and returns its key', async () => {
    const producer = await addProducer(localDir, {
      name: 'playground-api',
      senders: ['noreply@playground.test'],
    });

    expect(producer).toMatchObject({
      name: 'playground-api',
      senders: ['noreply@playground.test'],
    });
    expect((await storedProducers()).map((stored) => stored.name)).toEqual([
      'local-dev',
      'playground-api',
    ]);
    expect(await readEnvProducers()).toContainEqual({
      name: 'playground-api',
      keySha256: hashProducerKey(producer.key),
      senders: ['noreply@playground.test'],
    });
  });

  it('keeps the key when the same producer is added again', async () => {
    const first = await addProducer(localDir, { name: 'cv-web', senders: ['hello@cv.test'] });
    const again = await addProducer(localDir, {
      name: 'cv-web',
      senders: ['hello@cv.test', 'team@cv.test'],
    });

    expect(again).toEqual({ ...first, senders: ['hello@cv.test', 'team@cv.test'] });
  });
});
