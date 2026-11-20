import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppFlags,
  expiredFlags,
  FlagsError,
  type FlagsFile,
  flagdEnv,
  flagdSources,
  flagsSchemaUrl,
  provisionFlags,
  readFlags,
  today,
} from './flags.ts';
import { readApps } from './registry.ts';

let root: string;
let appsDir: string;
let localDir: string;

function flagsFile(flagSetId: string, flags: Record<string, unknown>): Record<string, unknown> {
  return { $schema: flagsSchemaUrl, metadata: { flagSetId }, flags };
}

const greeting = {
  state: 'ENABLED',
  variants: { plain: 'Hello', friendly: 'Hi there' },
  defaultVariant: 'plain',
  metadata: { removeBy: '2027-06-30' },
};

async function addFlags(app: string, content: unknown): Promise<void> {
  await mkdir(join(appsDir, app), { recursive: true });
  await writeFile(
    join(appsDir, app, 'flags.json'),
    typeof content === 'string' ? content : JSON.stringify(content)
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'platform-flags-'));
  appsDir = join(root, 'apps');
  localDir = join(root, 'local');
  await mkdir(appsDir);
  await mkdir(localDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('readFlags', () => {
  it('reads the flags of the apps that have a flags file and skips the others', async () => {
    await addFlags('cv-web', flagsFile('cv-web', { greeting }));

    const found = await readFlags(appsDir, [{ name: 'cv-web' }, { name: 'gpool-api' }]);

    expect(found).toEqual([
      {
        app: 'cv-web',
        file: join(appsDir, 'cv-web', 'flags.json'),
        flags: flagsFile('cv-web', { greeting }),
      },
    ]);
  });

  it('accepts targeting rules, shared evaluators and object variants', async () => {
    const content = {
      ...flagsFile('cv-web', {
        theme: {
          state: 'DISABLED',
          variants: { dark: { background: '#000' }, light: { background: '#fff' } },
          defaultVariant: 'dark',
          targeting: { if: [{ $ref: 'staff' }, 'light', null] },
          metadata: { removeBy: '2027-01-31' },
        },
      }),
      $evaluators: { staff: { ends_with: [{ var: 'email' }, '@zigordev.test'] } },
    };
    await addFlags('cv-web', content);

    const [found] = await readFlags(appsDir, [{ name: 'cv-web' }]);

    expect(found?.flags).toEqual(content);
  });

  it('rejects a file that is not JSON', async () => {
    await addFlags('cv-web', '{ not json');

    await expect(readFlags(appsDir, [{ name: 'cv-web' }])).rejects.toThrow(
      new FlagsError(`${join(appsDir, 'cv-web', 'flags.json')} is not valid JSON`)
    );
  });

  it.each([
    ['a flag without a removal date', { ...greeting, metadata: {} }, /removeBy/],
    [
      'a removal date that is not a date',
      { ...greeting, metadata: { removeBy: 'soon' } },
      /removeBy/,
    ],
    ['a default that names no variant', { ...greeting, defaultVariant: 'loud' }, /defaultVariant/],
    ['a flag with no variants', { ...greeting, variants: {} }, /at least one variant/],
    ['an unknown state', { ...greeting, state: 'ON' }, /state/],
    ['an unknown field', { ...greeting, owner: 'cv' }, /owner/],
  ])('rejects %s', async (_case, flag, message) => {
    await addFlags('cv-web', flagsFile('cv-web', { greeting: flag }));

    await expect(readFlags(appsDir, [{ name: 'cv-web' }])).rejects.toThrow(message);
  });

  it('rejects a flag key that is not kebab-case', async () => {
    await addFlags('cv-web', flagsFile('cv-web', { NewCheckout: greeting }));

    await expect(readFlags(appsDir, [{ name: 'cv-web' }])).rejects.toThrow(/kebab-case/);
  });

  it('rejects a file without the flagd schema', async () => {
    await addFlags('cv-web', { metadata: { flagSetId: 'cv-web' }, flags: { greeting } });

    await expect(readFlags(appsDir, [{ name: 'cv-web' }])).rejects.toThrow(/\$schema/);
  });

  it('rejects a flag set that names another app', async () => {
    await addFlags('cv-web', flagsFile('gpool-api', { greeting }));

    await expect(readFlags(appsDir, [{ name: 'cv-web' }])).rejects.toThrow(
      new FlagsError(
        `${join(appsDir, 'cv-web', 'flags.json')} sets flagSetId gpool-api, but its app is cv-web`
      )
    );
  });

  it('passes on errors other than a missing file', async () => {
    await mkdir(join(appsDir, 'cv-web', 'flags.json'), { recursive: true });

    await expect(readFlags(appsDir, [{ name: 'cv-web' }])).rejects.toThrow(/EISDIR/);
  });
});

function appFlags(app: string, flags: FlagsFile['flags'] = {}): AppFlags {
  return {
    app,
    file: `apps/${app}/flags.json`,
    flags: { $schema: flagsSchemaUrl, metadata: { flagSetId: app }, flags },
  };
}

function flagUntil(removeBy: string): FlagsFile['flags'][string] {
  return {
    state: 'ENABLED',
    variants: { plain: 'Hello' },
    defaultVariant: 'plain',
    metadata: { removeBy },
  };
}

describe('expiredFlags', () => {
  it('lists the flags whose removal date has passed, and keeps a flag on its last day', () => {
    const flags = [
      appFlags('cv-web', { old: flagUntil('2026-11-19'), due: flagUntil('2026-11-20') }),
    ];

    expect(expiredFlags(flags, '2026-11-20')).toEqual([
      { app: 'cv-web', flag: 'old', removeBy: '2026-11-19' },
    ]);
  });
});

describe('flagd sources', () => {
  it('gives flagd one file source per app, at the path the container mounts', () => {
    const flags = [appFlags('cv-web'), appFlags('gpool-api')];

    expect(JSON.parse(flagdSources(flags))).toEqual([
      { uri: '/apps/cv-web/flags.json', provider: 'file' },
      { uri: '/apps/gpool-api/flags.json', provider: 'file' },
    ]);
    expect(flagdEnv(flags)).toBe(`FLAGD_SOURCES='${flagdSources(flags)}'\n`);
  });
});

describe('provisionFlags', () => {
  it('writes the sources for compose and reports the expired flags', async () => {
    await addFlags(
      'cv-web',
      flagsFile('cv-web', { greeting: { ...greeting, metadata: { removeBy: '2026-01-31' } } })
    );

    const result = await provisionFlags(appsDir, localDir, [{ name: 'cv-web' }], '2026-11-20');

    expect(result).toEqual({
      apps: ['cv-web'],
      expired: [{ app: 'cv-web', flag: 'greeting', removeBy: '2026-01-31' }],
    });
    expect(await readFile(join(localDir, '.env'), 'utf8')).toBe(
      `FLAGD_SOURCES='[{"uri":"/apps/cv-web/flags.json","provider":"file"}]'\n`
    );
  });

  it('writes an empty source list when no app has flags', async () => {
    const result = await provisionFlags(appsDir, localDir, [], '2026-11-20');

    expect(result).toEqual({ apps: [], expired: [] });
    expect(await readFile(join(localDir, '.env'), 'utf8')).toBe("FLAGD_SOURCES='[]'\n");
  });
});

describe('today', () => {
  it('is the UTC date', () => {
    expect(today(new Date('2026-11-20T23:30:00-02:00'))).toBe('2026-11-21');
  });
});

describe('the flags in this repo', () => {
  it('are valid, and none is past its removal date', async () => {
    const flags = await readFlags('apps', await readApps('apps'));

    expect(flags.length).toBeGreaterThan(0);
    expect(expiredFlags(flags, today())).toEqual([]);
  });
});
