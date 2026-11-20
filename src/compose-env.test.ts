import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComposeEnvError, composeEnv, fileSha256, writeComposeEnv } from './compose-env.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'platform-compose-env-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('composeEnv', () => {
  it('writes one single-quoted line per variable, so JSON values stay literal', () => {
    expect(
      composeEnv({ FLAGD_SOURCES: '[{"uri":"/apps/cv-web/flags.json"}]', ALLOY_CONFIG_SHA: 'abc' })
    ).toBe(`FLAGD_SOURCES='[{"uri":"/apps/cv-web/flags.json"}]'\nALLOY_CONFIG_SHA='abc'\n`);
  });

  it.each([
    ['a quote', "it's"],
    ['a line break', 'one\ntwo'],
  ])('rejects a value with %s', (_case, value) => {
    expect(() => composeEnv({ BROKEN: value })).toThrow(
      new ComposeEnvError('BROKEN holds a quote or a line break, which compose cannot read')
    );
  });
});

describe('fileSha256', () => {
  it("is the file's SHA-256 in hex", async () => {
    const file = join(dir, 'config.alloy');
    await writeFile(file, 'hello\n');

    expect(await fileSha256(file)).toBe(
      '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03'
    );
  });
});

describe('writeComposeEnv', () => {
  it('writes the variables to .env in the local folder', async () => {
    await writeComposeEnv(dir, { ALLOY_CONFIG_SHA: 'abc' });

    expect(await readFile(join(dir, '.env'), 'utf8')).toBe("ALLOY_CONFIG_SHA='abc'\n");
  });
});
