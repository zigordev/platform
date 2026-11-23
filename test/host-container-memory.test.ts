import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../host/root/usr/local/sbin/platform-container-memory', import.meta.url)
);

const api = 'a'.repeat(64);
const gone = 'b'.repeat(64);
const loose = 'c'.repeat(64);

let work: string;

function scope(id: string, current: number, max: string, inactiveFile: number): void {
  const dir = join(work, 'cgroup', 'system.slice', `docker-${id}.scope`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'memory.current'), `${current}\n`);
  writeFileSync(join(dir, 'memory.max'), `${max}\n`);
  writeFileSync(
    join(dir, 'memory.stat'),
    `anon 1000\nfile 2000\nactive_file 300\ninactive_file ${inactiveFile}\n`
  );
}

function run(containers: readonly string[], dockerExit = 0) {
  writeFileSync(join(work, 'containers.txt'), containers.map((line) => `${line}\n`).join(''));
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(work, 'bin')}:${process.env.PATH ?? ''}`,
      PLATFORM_METRICS_DIR: join(work, 'metrics'),
      PLATFORM_CGROUP_ROOT: join(work, 'cgroup'),
      FAKE_CONTAINERS: join(work, 'containers.txt'),
      FAKE_DOCKER_EXIT: String(dockerExit),
    },
  });
  return { code: result.status, stderr: result.stderr };
}

function written(): string {
  return readFileSync(join(work, 'metrics', 'containers.prom'), 'utf8');
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'host-container-memory-'));
  mkdirSync(join(work, 'bin'));
  writeFileSync(
    join(work, 'bin', 'docker'),
    '#!/usr/bin/env bash\ncat "$FAKE_CONTAINERS"\nexit "$FAKE_DOCKER_EXIT"\n'
  );
  chmodSync(join(work, 'bin', 'docker'), 0o755);
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('platform-container-memory', () => {
  it("writes each container's working set and limit, named as the logs name it", () => {
    scope(api, 50_000_000, '268435456', 10_000_000);
    expect(run([`${api}|gpool-api-1|gpool|gpool-api`]).code).toBe(0);
    expect(written()).toBe(
      'container_memory_working_set_bytes{container="gpool-api-1",service_name="gpool-api",compose_project="gpool"} 40000000\n' +
        'container_spec_memory_limit_bytes{container="gpool-api-1",service_name="gpool-api",compose_project="gpool"} 268435456\n'
    );
  });

  it('writes no limit for a container that has none, and never a negative working set', () => {
    scope(loose, 1_000, 'max', 5_000);
    expect(run([`${loose}|probe||`]).code).toBe(0);
    expect(written()).toBe(
      'container_memory_working_set_bytes{container="probe",service_name="",compose_project=""} 0\n'
    );
  });

  it('skips a container that stopped while it was being read', () => {
    scope(api, 50_000_000, '268435456', 10_000_000);
    expect(run([`${gone}|gone-1|gone|gone`, `${api}|gpool-api-1|gpool|gpool-api`]).code).toBe(0);
    expect(written()).not.toContain('gone');
    expect(written()).toContain('container="gpool-api-1"');
  });

  it('replaces the file in one step, readable by the agent, and leaves no draft behind', () => {
    scope(api, 50_000_000, '268435456', 10_000_000);
    run([`${api}|gpool-api-1|gpool|gpool-api`]);
    expect(readdirSync(join(work, 'metrics'))).toEqual(['containers.prom']);
    expect(statSync(join(work, 'metrics', 'containers.prom')).mode & 0o777).toBe(0o644);
  });

  it('keeps the last good file, and fails, when Docker does not answer', () => {
    scope(api, 50_000_000, '268435456', 10_000_000);
    run([`${api}|gpool-api-1|gpool|gpool-api`]);
    const before = written();
    const result = run([], 1);
    expect(result.code).not.toBe(0);
    expect(written()).toBe(before);
    expect(readdirSync(join(work, 'metrics'))).toEqual(['containers.prom']);
  });
});
