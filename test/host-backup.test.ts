import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../host/root/usr/local/sbin/platform-backup', import.meta.url)
);
const fakes = fileURLToPath(new URL('./fixtures/backup', import.meta.url));
const image = `postgres:18.7-alpine3.24@sha256:${'c'.repeat(64)}`;
const counts = 'public.notes\t3\npublic.tags\t5\n';

let work: string;

function fake(...parts: string[]): string {
  return join(work, 'fake', ...parts);
}

function run(...args: string[]) {
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakes}:${process.env.PATH ?? ''}`,
      FAKE_DIR: fake(),
      FAKE_IMAGE: image,
      PLATFORM_BACKUP_STATE: join(work, 'state'),
      PLATFORM_METRICS_DIR: join(work, 'metrics'),
    },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function calls(): string[] {
  return readFileSync(fake('calls'), 'utf8').trim().split('\n');
}

function keys(): string[] {
  const root = fake('bucket');
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .sort();
}

function metric(mode: string, name: string, project = 'playground'): number | undefined {
  const file = join(work, 'metrics', `backup-${mode}.prom`);
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${name}{compose_project="${project}"} `));
  return line === undefined ? undefined : Number(line.split(' ')[1]);
}

function storedSet(prefix: string, complete: boolean): void {
  const dir = fake('bucket', prefix);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'globals.sql'), 'CREATE ROLE postgres;\nCREATE ROLE app;\n');
  writeFileSync(join(dir, 'databases'), 'playground_api\n');
  writeFileSync(join(dir, 'playground_api.dump'), `PGDMP ${prefix}\n`);
  writeFileSync(join(dir, 'playground_api.counts'), counts);
  if (complete) {
    writeFileSync(join(dir, 'complete'), 'playground_api\n');
  }
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'host-backup-'));
  mkdirSync(fake(), { recursive: true });
  writeFileSync(fake('calls'), '');
  writeFileSync(fake('stores'), 'abc123 playground\n');
  writeFileSync(fake('databases'), 'playground_api\n');
  writeFileSync(fake('counts'), counts);
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('platform-backup', () => {
  it('says how to use it without a mode', () => {
    const result = run();
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Usage: platform-backup dump|restore-test');
  });
});

describe('platform-backup dump', () => {
  it('uploads the roles, each database with its row counts, and marks the set complete last', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = run('dump');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('dump: playground passed');

    const uploaded = keys();
    expect(uploaded).toHaveLength(5);
    const prefix = uploaded[0]?.split('/').slice(0, 3).join('/') ?? '';
    expect(prefix).toMatch(/^playground\/\d{4}-\d{2}-\d{2}\/\d{6}Z$/);
    expect(uploaded).toEqual(
      ['complete', 'databases', 'globals.sql', 'playground_api.counts', 'playground_api.dump'].map(
        (name) => `${prefix}/${name}`
      )
    );
    expect(readFileSync(fake('bucket', prefix, 'playground_api.counts'), 'utf8')).toBe(counts);
    expect(readFileSync(fake('bucket', prefix, 'globals.sql'), 'utf8')).toContain(
      'CREATE ROLE app;'
    );
    expect(calls().at(-1)).toMatch(
      /^aws s3 cp .*\/databases s3:\/\/zigordev-platform-backups\/.*\/complete$/
    );

    expect(metric('dump', 'platform_backup_last_success_timestamp_seconds')).toBeGreaterThanOrEqual(
      before
    );
    expect(metric('dump', 'platform_backup_size_bytes')).toBeGreaterThan(0);
  });

  it('counts the rows inside the same snapshot as the dump, so the counts match it exactly', () => {
    run('dump');
    const session = readFileSync(fake('script-playground_api'), 'utf8');
    expect(session).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    expect(session).toContain('SELECT pg_export_snapshot() AS snapshot \\gset');
    expect(session).toContain(
      '\\! pg_dump --format=custom --snapshot="$PLATFORM_SNAPSHOT" --dbname="$PLATFORM_DB"'
    );
    expect(session).toContain("RAISE EXCEPTION 'pg_dump failed'");
    expect(session.indexOf('query_to_xml')).toBeGreaterThan(session.indexOf('pg_dump --format'));
    expect(session.indexOf('query_to_xml')).toBeLessThan(session.indexOf('COMMIT;'));
  });

  it('leaves out the database postgres, because each app keeps its data in the database its migrate job makes', () => {
    run('dump');
    expect(calls().find((call) => call.includes('FROM pg_database'))).toContain(
      "datname <> 'postgres'"
    );
  });

  it('runs every database command as the user postgres inside the store, with no password', () => {
    run('dump');
    const execs = calls().filter((call) => call.startsWith('docker exec'));
    expect(execs.length).toBeGreaterThan(0);
    for (const call of execs) {
      expect(call).toContain('--user postgres abc123 ');
    }
  });

  it('keeps the time of the last good dump when a later one fails, and exits with an error', () => {
    run('dump');
    const first = metric('dump', 'platform_backup_last_success_timestamp_seconds');
    writeFileSync(fake('aws-fails'), '');

    const result = run('dump');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('dump: playground failed');
    expect(metric('dump', 'platform_backup_last_success_timestamp_seconds')).toBe(first);
  });

  it('reports 0 for a store whose dump never passed, so its alert fires', () => {
    writeFileSync(fake('aws-fails'), '');
    expect(run('dump').code).toBe(1);
    expect(metric('dump', 'platform_backup_last_success_timestamp_seconds')).toBe(0);
  });

  it('refuses a name that could leave its folder, and dumps nothing for it', () => {
    writeFileSync(fake('stores'), 'abc123 ../etc\n');
    const result = run('dump');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refusing the name '../etc'");
    expect(keys()).toEqual([]);
  });

  it('writes an empty report when no store carries the label', () => {
    writeFileSync(fake('stores'), '');
    expect(run('dump').code).toBe(0);
    expect(readFileSync(join(work, 'metrics', 'backup-dump.prom'), 'utf8')).toBe('');
  });
});

describe('platform-backup restore-test', () => {
  it('restores the newest complete set into a throwaway PostgreSQL with no network, and compares the rows', () => {
    storedSet('playground/2026-11-25/081700Z', true);
    storedSet('playground/2026-11-25/091700Z', true);
    storedSet('playground/2026-11-25/101700Z', false);
    const before = Math.floor(Date.now() / 1000);

    const result = run('restore-test');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('restore-test: playground passed');
    expect(readFileSync(fake('restored-zigordev-restore-playground.dump'), 'utf8')).toBe(
      'PGDMP playground/2026-11-25/091700Z\n'
    );

    const started = calls().find((call) => call.startsWith('docker run'));
    expect(started).toBe(
      `docker run -d --name zigordev-restore-playground --network none --memory 256m -e POSTGRES_HOST_AUTH_METHOD=trust ${image}`
    );
    expect(calls().filter((call) => call.includes(' pg_restore '))).toEqual([
      'docker exec -i --user postgres zigordev-restore-playground pg_restore --exit-on-error --create --dbname postgres',
    ]);
    expect(
      metric('restore-test', 'platform_restore_test_last_success_timestamp_seconds')
    ).toBeGreaterThanOrEqual(before);
    expect(metric('restore-test', 'platform_restore_test_tables')).toBe(2);
  });

  it('restores the roles first, without the role postgres that a new server already has', () => {
    storedSet('playground/2026-11-25/081700Z', true);
    run('restore-test');
    const globals = readFileSync(fake('globals-zigordev-restore-playground'), 'utf8');
    expect(globals).toContain('CREATE ROLE app;');
    expect(globals).not.toContain('CREATE ROLE postgres;');
  });

  it('fails, and says why, when the restored rows differ from the counts taken with the dump', () => {
    storedSet('playground/2026-11-25/081700Z', true);
    writeFileSync(fake('restored-counts'), 'public.notes\t3\npublic.tags\t4\n');

    const result = run('restore-test');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'the rows of playground/playground_api differ from the counts taken with its dump'
    );
    expect(metric('restore-test', 'platform_restore_test_last_success_timestamp_seconds')).toBe(0);
  });

  it('fails when no complete set exists', () => {
    storedSet('playground/2026-11-25/081700Z', false);
    const result = run('restore-test');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('restore-test: playground has no complete dump');
  });

  it('removes the throwaway PostgreSQL even when the restore fails', () => {
    storedSet('playground/2026-11-25/081700Z', true);
    writeFileSync(fake('restore-fails'), '');

    expect(run('restore-test').code).toBe(1);
    const all = calls();
    const started = all.findIndex((call) => call.startsWith('docker run'));
    expect(started).toBeGreaterThan(-1);
    expect(all.slice(started + 1)).toContain('docker rm -f zigordev-restore-playground');
  });

  it('keeps the time of the last good restore when a later one fails', () => {
    storedSet('playground/2026-11-25/081700Z', true);
    run('restore-test');
    const first = metric('restore-test', 'platform_restore_test_last_success_timestamp_seconds');
    writeFileSync(fake('restore-fails'), '');

    expect(run('restore-test').code).toBe(1);
    expect(metric('restore-test', 'platform_restore_test_last_success_timestamp_seconds')).toBe(
      first
    );
  });
});
