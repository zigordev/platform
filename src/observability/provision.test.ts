import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dashboardsProvider, provisionDashboards, readAppObservability } from './provision.ts';

let root: string;
let appsDir: string;
let localDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'platform-observability-'));
  appsDir = join(root, 'apps');
  localDir = join(root, 'local');
  await mkdir(appsDir);
  await mkdir(localDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function addObservability(app: string, source: string): Promise<void> {
  await mkdir(join(appsDir, app), { recursive: true });
  await writeFile(join(appsDir, app, 'observability.ts'), source);
}

describe('readAppObservability', () => {
  it('gives nothing extra to an app without an observability file', async () => {
    expect(await readAppObservability(appsDir, { name: 'cv-web' })).toEqual({});
  });

  it("reads the rows an app's observability file exports", async () => {
    await addObservability(
      'cv-web',
      "export const observability = { rows: [{ title: 'Questions', panels: [] }] };\n"
    );

    expect(await readAppObservability(appsDir, { name: 'cv-web' })).toEqual({
      rows: [{ title: 'Questions', panels: [] }],
    });
  });

  it('treats a file that exports nothing as nothing extra', async () => {
    await addObservability('cv-web', 'export const unrelated = 1;\n');

    expect(await readAppObservability(appsDir, { name: 'cv-web' })).toEqual({});
  });

  it('passes on errors other than a missing file', async () => {
    await writeFile(join(appsDir, 'cv-web'), '');

    await expect(readAppObservability(appsDir, { name: 'cv-web' })).rejects.toMatchObject({
      code: 'ENOTDIR',
    });
  });
});

describe('provisionDashboards', () => {
  it('writes the provider and one dashboard per app and the platform, and drops stale ones', async () => {
    const dashboardsDir = join(localDir, 'grafana', 'dashboards');
    await mkdir(dashboardsDir, { recursive: true });
    await writeFile(join(dashboardsDir, 'app-retired-web.json'), '{}');

    const result = await provisionDashboards(appsDir, localDir, [
      { name: 'cv-web' },
      { name: 'gpool-api' },
    ]);

    expect(result).toEqual({ dashboards: ['platform', 'app-cv-web', 'app-gpool-api'] });
    expect((await readdir(dashboardsDir)).sort()).toEqual([
      'app-cv-web.json',
      'app-gpool-api.json',
      'platform.json',
    ]);
    expect(
      JSON.parse(await readFile(join(dashboardsDir, 'app-cv-web.json'), 'utf8'))
    ).toMatchObject({
      uid: 'app-cv-web',
      title: 'cv-web',
    });
    expect(
      await readFile(
        join(localDir, 'grafana', 'provisioning', 'dashboards', 'zigordev.yaml'),
        'utf8'
      )
    ).toBe(dashboardsProvider);
  });
});
