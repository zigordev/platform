import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { databaseName, provisionDatabases } from './database.ts';

const run = promisify(execFile);
let serverBase: string;
let adminUrl: string;

function serverUrl(database: string, user?: string): string {
  const url = new URL(serverBase);
  url.pathname = `/${database}`;
  if (user !== undefined) {
    url.username = user;
    url.password = '';
  }
  return url.toString();
}

async function query(
  url: string,
  text: string,
  values: unknown[] = []
): Promise<Record<string, unknown>[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
  }
}

function uniqueApp(): string {
  return `test-${randomUUID().slice(0, 8)}`;
}

beforeAll(() => {
  serverBase = inject('postgresTemplateUrl');
  adminUrl = serverUrl('postgres');
});

describe('provisionDatabases', () => {
  it('gives each app with a database its own role and database, closed to everyone else', async () => {
    const app = uniqueApp();
    const other = uniqueApp();

    const results = await provisionDatabases(adminUrl, [
      { name: app, database: true },
      { name: other, database: true },
    ]);

    expect(results).toEqual([
      { app, database: databaseName(app), created: true },
      { app: other, database: databaseName(other), created: true },
    ]);
    const [owner] = await query(
      adminUrl,
      'SELECT pg_get_userbyid(datdba) AS owner, has_database_privilege($2, datname, $3) AS public_can_connect FROM pg_database WHERE datname = $1',
      [databaseName(app), 'public', 'CONNECT']
    );
    expect(owner).toEqual({ owner: databaseName(app), public_can_connect: false });
  });

  it('lets the app create tables in its database and keeps other apps out', async () => {
    const app = uniqueApp();
    const other = uniqueApp();
    await provisionDatabases(adminUrl, [
      { name: app, database: true },
      { name: other, database: true },
    ]);
    await query(adminUrl, `ALTER ROLE "${databaseName(app)}" PASSWORD 'local'`);
    await query(adminUrl, `ALTER ROLE "${databaseName(other)}" PASSWORD 'local'`);
    const asApp = (database: string, role: string) => {
      const url = new URL(serverUrl(database, role));
      url.password = 'local';
      return url.toString();
    };

    await query(
      asApp(databaseName(app), databaseName(app)),
      'CREATE TABLE notes (id integer PRIMARY KEY)'
    );
    await expect(
      query(asApp(databaseName(app), databaseName(other)), 'SELECT 1')
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('changes nothing on a second run and skips apps without a database', async () => {
    const app = uniqueApp();
    const stateless = uniqueApp();
    await provisionDatabases(adminUrl, [{ name: app, database: true }]);

    const results = await provisionDatabases(adminUrl, [
      { name: app, database: true },
      { name: stateless, database: false },
    ]);

    expect(results).toEqual([{ app, database: databaseName(app), created: false }]);
    expect(
      await query(adminUrl, 'SELECT 1 FROM pg_roles WHERE rolname = $1', [databaseName(stateless)])
    ).toEqual([]);
  });
});

describe('the provision-local script', () => {
  it('provisions the registry, the producers and the flags it is pointed at, and logs what it did', async () => {
    const app = uniqueApp();
    const appsDir = await mkdtemp(join(tmpdir(), 'platform-apps-'));
    const localDir = await mkdtemp(join(tmpdir(), 'platform-local-'));
    await mkdir(join(appsDir, app));
    await writeFile(join(appsDir, app, 'app.yaml'), `name: ${app}\ndatabase: true\n`);
    await writeFile(
      join(appsDir, app, 'flags.json'),
      JSON.stringify({
        $schema: 'https://flagd.dev/schema/v0/flags.json',
        metadata: { flagSetId: app },
        flags: {
          'old-banner': {
            state: 'ENABLED',
            variants: { on: true, off: false },
            defaultVariant: 'off',
            metadata: { removeBy: '2026-01-31' },
          },
        },
      })
    );
    try {
      const { stdout } = await run(process.execPath, ['scripts/provision-local.ts'], {
        env: {
          PATH: process.env.PATH ?? '',
          PLATFORM_DATABASE_URL: adminUrl,
          PLATFORM_APPS_DIR: appsDir,
          PLATFORM_LOCAL_DIR: localDir,
        },
      });
      const events = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(events).toEqual([
        expect.objectContaining({
          event: 'platform.database_created',
          app,
          database: databaseName(app),
          service: 'platform-provision',
        }),
        expect.objectContaining({
          event: 'platform.producer_created',
          producers: ['local-dev'],
          service: 'platform-provision',
        }),
        expect.objectContaining({
          event: 'platform.flags_served',
          apps: [app],
          service: 'platform-provision',
        }),
        expect.objectContaining({
          event: 'platform.flag_expired',
          level: 'warn',
          app,
          flag: 'old-banner',
          removeBy: '2026-01-31',
        }),
        expect.objectContaining({
          event: 'platform.dashboards_written',
          dashboards: ['platform', `app-${app}`],
        }),
      ]);
      expect((await readdir(localDir)).sort()).toEqual([
        '.env',
        'grafana',
        'notifications-api.env',
        'notifications-producers.json',
      ]);
      expect(await readFile(join(localDir, '.env'), 'utf8')).toMatch(
        new RegExp(
          `^FLAGD_SOURCES='\\[\\{"uri":"/apps/${app}/flags\\.json","provider":"file"\\}\\]'\nALLOY_CONFIG_SHA='[0-9a-f]{64}'\n$`
        )
      );
    } finally {
      await rm(appsDir, { recursive: true, force: true });
      await rm(localDir, { recursive: true, force: true });
    }
  }, 60_000);
});
