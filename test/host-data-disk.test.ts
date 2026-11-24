import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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

const script = fileURLToPath(
  new URL('../host/root/usr/local/sbin/platform-data-disk', import.meta.url)
);

const fakes: Record<string, string> = {
  blkid: 'echo "blkid $*" >> "$FAKE_LOG"\nexit "$FAKE_BLKID_EXIT"\n',
  'mkfs.ext4': 'echo "mkfs.ext4 $*" >> "$FAKE_LOG"\n',
  mount: 'echo "mount $1" >> "$FAKE_LOG"\n',
  umount: 'echo "umount" >> "$FAKE_LOG"\nrm -rf "$1/docker-volumes"\n',
  udevadm: 'echo "udevadm $*" >> "$FAKE_LOG"\n',
  sleep: ':\n',
};

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly calls: readonly string[];
}

let work: string;
let device: string;
let log: string;

function run(env: Record<string, string> = {}): Run {
  writeFileSync(log, '');
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(work, 'bin')}:${process.env.PATH ?? ''}`,
      PLATFORM_DATA_DEVICE: device,
      PLATFORM_DATA_WAIT_SECONDS: '15',
      FAKE_LOG: log,
      FAKE_BLKID_EXIT: '0',
      ...env,
    },
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'host-data-disk-'));
  device = join(work, 'disk');
  log = join(work, 'calls.log');
  mkdirSync(join(work, 'bin'));
  for (const [name, body] of Object.entries(fakes)) {
    writeFileSync(join(work, 'bin', name), `#!/usr/bin/env bash\n${body}`);
    chmodSync(join(work, 'bin', name), 0o755);
  }
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('platform-data-disk', () => {
  it('leaves a disk with a file system as it is, so a rebuilt host keeps its data', () => {
    writeFileSync(device, Buffer.alloc(1024 * 1024));
    const result = run({ FAKE_BLKID_EXIT: '0' });
    expect(result.code).toBe(0);
    expect(result.calls).toEqual([`blkid -p ${device}`]);
    expect(result.stdout).toContain('used as it is');
  });

  it('gives a new, empty disk an ext4 file system with its label and the folder for the volumes', () => {
    writeFileSync(device, Buffer.alloc(1024 * 1024));
    const result = run({ FAKE_BLKID_EXIT: '2' });
    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      `blkid -p ${device}`,
      `mkfs.ext4 -q -L platform-data ${device}`,
      `mount ${device}`,
      'umount',
      'udevadm settle',
    ]);
  });

  it('formats a new encrypted EBS disk, whose blocks read as noise after its first 4 KB', () => {
    writeFileSync(device, Buffer.concat([Buffer.alloc(4096), randomBytes(1024 * 1024 - 4096)]));
    const result = run({ FAKE_BLKID_EXIT: '2' });
    expect(result.code).toBe(0);
    expect(result.calls).toContain(`mkfs.ext4 -q -L platform-data ${device}`);
    expect(result.stdout).toContain('carries no signature');
  });

  it('stops without touching the disk when blkid cannot read it', () => {
    writeFileSync(device, Buffer.alloc(1024 * 1024));
    const result = run({ FAKE_BLKID_EXIT: '4' });
    expect(result.code).toBe(1);
    expect(result.calls).toEqual([`blkid -p ${device}`]);
    expect(result.stderr).toContain('ended with 4');
  });

  it('fails, and says so, when the disk never appears', () => {
    const result = run({ PLATFORM_DATA_WAIT_SECONDS: '10', PLATFORM_DATA_POLL_SECONDS: '5' });
    expect(existsSync(device)).toBe(false);
    expect(result.code).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.stderr).toContain('did not appear within 10 seconds');
  });

  it('refuses to run without the name of the disk', () => {
    const result = run({ PLATFORM_DATA_DEVICE: '' });
    expect(result.code).not.toBe(0);
    expect(result.calls).toEqual([]);
  });
});
