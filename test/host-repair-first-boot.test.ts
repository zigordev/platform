import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../host/repair-first-boot', import.meta.url));
const shell = existsSync('/bin/dash') ? '/bin/dash' : 'sh';

const fakes: Record<string, string> = {
  'cloud-init': 'echo "cloud-init $*" >> "$FAKE_LOG"\n[ "$1" = status ] && exit 2\nexit 0\n',
  shutdown: 'echo "shutdown $*" >> "$FAKE_LOG"\n',
};

let work: string;
let log: string;
let instanceId: string;
let state: string;

function run() {
  writeFileSync(log, '');
  const result = spawnSync(shell, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(work, 'bin')}:${process.env.PATH ?? ''}`,
      PLATFORM_CLOUD_INSTANCE_ID_FILE: instanceId,
      PLATFORM_REPAIR_STATE_DIR: state,
      FAKE_LOG: log,
    },
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

function restarts(): string {
  return readFileSync(join(state, 'restarts'), 'utf8').trim();
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'host-repair-'));
  log = join(work, 'calls.log');
  instanceId = join(work, 'instance-id');
  state = join(work, 'state');
  mkdirSync(join(work, 'bin'));
  for (const [name, body] of Object.entries(fakes)) {
    writeFileSync(join(work, 'bin', name), `#!/bin/sh\n${body}`);
    chmodSync(join(work, 'bin', name), 0o755);
  }
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('repair-first-boot', () => {
  it('leaves a host alone whose first boot found its setup', () => {
    writeFileSync(instanceId, 'i-01373656405e78363\n');
    const result = run();
    expect(result.code).toBe(0);
    expect(result.calls).toEqual(['cloud-init status --wait']);
    expect(result.stdout).toContain('nothing to repair');
  });

  it('leaves a host alone when cloud-init has not written an instance yet', () => {
    const result = run();
    expect(result.code).toBe(0);
    expect(result.calls).toEqual(['cloud-init status --wait']);
  });

  it('clears cloud-init and restarts the host in a minute when the first boot found no setup', () => {
    writeFileSync(instanceId, 'iid-datasource-none\n');
    const result = run();
    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      'cloud-init status --wait',
      'cloud-init clean --logs',
      'shutdown -r +1 cloud-init starts the first boot again',
    ]);
    expect(restarts()).toBe('1');
    expect(result.stdout).toContain('restart 1 of 3');
  });

  it('tries a third time, then stops and says a person has to look', () => {
    writeFileSync(instanceId, 'iid-datasource-none\n');
    mkdirSync(state);
    writeFileSync(join(state, 'restarts'), '2\n');
    expect(run().calls).toContain('cloud-init clean --logs');
    expect(restarts()).toBe('3');

    const stopped = run();
    expect(stopped.code).toBe(1);
    expect(stopped.calls).toEqual(['cloud-init status --wait']);
    expect(stopped.stderr).toContain('a person has to look');
    expect(restarts()).toBe('3');
  });

  it('runs under a plain POSIX shell, as AWS Systems Manager runs it', () => {
    expect(spawnSync(shell, ['-n', script]).status).toBe(0);
    expect(readFileSync(script, 'utf8').startsWith('#!/bin/sh\nset -eu\n')).toBe(true);
  });
});
