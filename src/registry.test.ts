import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appsFor, RegistryError, readApps } from './registry.ts';

let appsDir: string;

async function addApp(folder: string, yaml: string | undefined): Promise<void> {
  await mkdir(join(appsDir, folder), { recursive: true });
  if (yaml !== undefined) {
    await writeFile(join(appsDir, folder, 'app.yaml'), yaml);
  }
}

beforeEach(async () => {
  appsDir = await mkdtemp(join(tmpdir(), 'platform-apps-'));
});

afterEach(async () => {
  await rm(appsDir, { recursive: true, force: true });
});

describe('readApps', () => {
  it('reads every app folder in name order, with database off unless asked', async () => {
    await addApp('gpool-api', 'name: gpool-api\ndatabase: true\n');
    await addApp('cv-web', 'name: cv-web\n');

    expect(await readApps(appsDir)).toEqual([
      { name: 'cv-web', database: false, local: false },
      { name: 'gpool-api', database: true, local: false },
    ]);
  });

  it('reads an app that runs only on laptops', async () => {
    await addApp('playground-api', 'name: playground-api\ndatabase: true\nlocal: true\n');

    expect(await readApps(appsDir)).toEqual([
      { name: 'playground-api', database: true, local: true },
    ]);
  });

  it('treats a missing apps folder as an empty registry', async () => {
    expect(await readApps(join(appsDir, 'absent'))).toEqual([]);
  });

  it('passes on errors other than a missing file', async () => {
    const file = join(appsDir, 'not-a-folder');
    await writeFile(file, '');
    await mkdir(join(appsDir, 'apps', 'cv-web', 'app.yaml'), { recursive: true });

    await expect(readApps(file)).rejects.toMatchObject({ code: 'ENOTDIR' });
    await expect(readApps(join(appsDir, 'apps'))).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it.each([
    ['a name that is not <repo>-<app>', 'Web', 'name: Web\n', /must be <repo>-<app>/],
    ['an unknown field', 'cv-web', 'name: cv-web\nport: 3000\n', /is invalid/],
    [
      'a name that differs from its folder',
      'cv-web',
      'name: cv-api\n',
      /names cv-api, but its folder is cv-web/,
    ],
    ['a folder without app.yaml', 'cv-web', undefined, /app\.yaml is missing/],
    [
      'a local flag that is not a boolean',
      'cv-web',
      'name: cv-web\nlocal: yes please\n',
      /is invalid/,
    ],
  ])('rejects %s', async (_case, folder, yaml, message) => {
    await addApp(folder, yaml);

    await expect(readApps(appsDir)).rejects.toThrow(RegistryError);
    await expect(readApps(appsDir)).rejects.toThrow(message);
  });
});

describe('appsFor', () => {
  const apps = [
    { name: 'cv-web', database: false, local: false },
    { name: 'playground-api', database: true, local: true },
  ];

  it('gives the laptop every app, local-only ones included', () => {
    expect(appsFor('local', apps)).toEqual(apps);
  });

  it('leaves local-only apps out of production', () => {
    expect(appsFor('production', apps)).toEqual([
      { name: 'cv-web', database: false, local: false },
    ]);
  });
});
