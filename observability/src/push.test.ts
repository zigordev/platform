import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dockerGcx,
  type Gcx,
  type GcxResult,
  gcxImage,
  type Item,
  listed,
  localItems,
  push,
  run,
  stale,
} from './push.ts';

const ok = (stdout = ''): GcxResult => ({ code: 0, stdout, stderr: '' });

function manifest(kind: string, name: string, folder?: string) {
  return {
    apiVersion: 'x/v1',
    kind,
    metadata: {
      name,
      ...(folder === undefined ? {} : { annotations: { 'grafana.app/folder': folder } }),
    },
  };
}

function listing(...items: object[]): string {
  return JSON.stringify({ items });
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    output: {
      out: (text: string) => {
        out.push(text);
      },
      err: (text: string) => {
        err.push(text);
      },
    },
  };
}

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'push-'));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function files(...manifests: { kind: string; metadata: { name: string } }[]): string {
  const folder = join(work, 'observability');
  mkdirSync(folder, { recursive: true });
  for (const entry of manifests) {
    writeFileSync(join(folder, `${entry.kind}-${entry.metadata.name}.json`), JSON.stringify(entry));
  }
  writeFileSync(join(folder, 'notes.txt'), 'not a manifest');
  return folder;
}

describe('stale', () => {
  const local: Item[] = [
    { kind: 'dashboards', name: 'app', folder: 'zigordev' },
    { kind: 'alertrules', name: 'app-is-slow', folder: 'zigordev' },
  ];

  it('picks what the folder zigordev holds and the files no longer do', () => {
    const remote: Item[] = [
      { kind: 'dashboards', name: 'app', folder: 'zigordev' },
      { kind: 'dashboards', name: 'old', folder: 'zigordev' },
      { kind: 'alertrules', name: 'app-is-slow', folder: 'zigordev' },
      { kind: 'alertrules', name: 'gone', folder: 'zigordev' },
    ];
    expect(stale(local, remote).map((item) => `${item.kind}/${item.name}`)).toEqual([
      'dashboards/old',
      'alertrules/gone',
    ]);
  });

  it('never touches anything outside the folder zigordev, such as the dashboards Grafana Cloud brings', () => {
    const remote: Item[] = [
      { kind: 'dashboards', name: 'grafana-cloud-usage', folder: 'dg55kp33ueygwd' },
      { kind: 'dashboards', name: 'loose', folder: undefined },
    ];
    expect(stale(local, remote)).toEqual([]);
  });
});

describe('listed', () => {
  it('reads the dashboards and alert rules of a gcx listing, with their folder', () => {
    const stdout = listing(
      manifest('Dashboard', 'app', 'zigordev'),
      manifest('AlertRule', 'app-is-slow', 'zigordev'),
      manifest('Folder', 'zigordev'),
      { kind: 'Dashboard' }
    );
    expect(listed(stdout)).toEqual([
      { kind: 'dashboards', name: 'app', folder: 'zigordev' },
      { kind: 'alertrules', name: 'app-is-slow', folder: 'zigordev' },
    ]);
  });

  it('takes a listing without items as empty', () => {
    expect(listed('{}')).toEqual([]);
  });
});

describe('localItems', () => {
  it('reads the built files, and leaves the folder itself out', () => {
    const folder = files(
      manifest('Folder', 'zigordev'),
      manifest('Dashboard', 'app', 'zigordev'),
      manifest('AlertRule', 'app-is-slow', 'zigordev')
    );
    expect(localItems(folder).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { kind: 'dashboards', name: 'app', folder: 'zigordev' },
      { kind: 'alertrules', name: 'app-is-slow', folder: 'zigordev' },
    ]);
  });
});

describe('push', () => {
  function recording(answers: Record<string, GcxResult>): { calls: string[]; gcx: Gcx } {
    const calls: string[] = [];
    return {
      calls,
      gcx: (args) => {
        const call = args.join(' ');
        calls.push(call);
        return answers[call] ?? ok(listing());
      },
    };
  }

  it('pushes the files, then deletes what the folder zigordev holds and the files no longer do', () => {
    const folder = files(manifest('Dashboard', 'app', 'zigordev'));
    const { calls, gcx } = recording({
      'resources get dashboards --limit 0 -o json': ok(
        listing(manifest('Dashboard', 'app', 'zigordev'), manifest('Dashboard', 'old', 'zigordev'))
      ),
      'resources get alertrules --limit 0 -o json': ok(
        listing(manifest('AlertRule', 'gone', 'zigordev'), manifest('AlertRule', 'theirs', 'other'))
      ),
    });
    const { out, output } = capture();
    expect(push(folder, gcx, output)).toBe(0);
    expect(calls).toEqual([
      'resources push --path /resources --on-error abort',
      'resources get dashboards --limit 0 -o json',
      'resources delete dashboards/old',
      'resources get alertrules --limit 0 -o json',
      'resources delete alertrules/gone',
    ]);
    expect(out.join('')).toContain('push: pushed 1 files');
    expect(out.join('')).toContain('push: deleted dashboards/old, which the files no longer hold');
  });

  it('lists every item of a kind, because gcx lists only the first 50 by default and Grafana Cloud held 108 alert rules on 2026-11-24', () => {
    const folder = files(manifest('Dashboard', 'app', 'zigordev'));
    const { calls, gcx } = recording({});
    const { output } = capture();
    expect(push(folder, gcx, output)).toBe(0);
    const listings = calls.filter((call) => call.startsWith('resources get '));
    expect(listings).toHaveLength(2);
    for (const call of listings) {
      expect(call).toContain(' --limit 0 ');
    }
  });

  it('stops before deleting anything when the push fails', () => {
    const folder = files(manifest('Dashboard', 'app', 'zigordev'));
    const { calls, gcx } = recording({
      'resources push --path /resources --on-error abort': {
        code: 3,
        stdout: '',
        stderr: 'refused',
      },
    });
    const { err, output } = capture();
    expect(push(folder, gcx, output)).toBe(3);
    expect(calls).toHaveLength(1);
    expect(err.join('')).toContain('could not push the files');
  });

  it('stops when a listing fails', () => {
    const folder = files(manifest('Dashboard', 'app', 'zigordev'));
    const { calls, gcx } = recording({
      'resources get dashboards --limit 0 -o json': { code: 4, stdout: '', stderr: 'no' },
    });
    const { err, output } = capture();
    expect(push(folder, gcx, output)).toBe(4);
    expect(calls).toHaveLength(2);
    expect(err.join('')).toContain('could not list the dashboards');
  });

  it('stops when a delete fails', () => {
    const folder = files(manifest('Dashboard', 'app', 'zigordev'));
    const { calls, gcx } = recording({
      'resources get dashboards --limit 0 -o json': ok(
        listing(manifest('Dashboard', 'old', 'zigordev'))
      ),
      'resources delete dashboards/old': { code: 5, stdout: '', stderr: 'locked' },
    });
    const { err, output } = capture();
    expect(push(folder, gcx, output)).toBe(5);
    expect(calls.at(-1)).toBe('resources delete dashboards/old');
    expect(err.join('')).toContain('could not delete dashboards/old');
  });
});

describe('gcxImage', () => {
  it('takes the gcx image the laptop stack runs, so both push with one version', () => {
    expect(gcxImage('services:\n  gcx:\n    image: grafana/gcx:v1.8.0\n')).toBe(
      'grafana/gcx:v1.8.0'
    );
  });

  it('fails when the laptop stack names none', () => {
    expect(() => gcxImage('services: {}\n')).toThrow('names no gcx image');
  });

  it('finds the image in the real laptop stack, pinned by its digest', () => {
    const compose = readFileSync(
      new URL('../../stack/compose.local.yaml', import.meta.url),
      'utf8'
    );
    expect(gcxImage(compose)).toMatch(/^grafana\/gcx:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });
});

describe('dockerGcx', () => {
  it('runs gcx in a throwaway container with the settings from the environment and the files read-only', () => {
    const bin = join(work, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), '#!/bin/sh\nprintf "%s\\n" "$@"\nexit 7\n');
    chmodSync(join(bin, 'docker'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path ?? ''}`;
    try {
      const result = dockerGcx('grafana/gcx:v1.8.0', '/tmp/observability')(['resources', 'push']);
      expect(result.code).toBe(7);
      const args = result.stdout.trim().split('\n');
      expect(args.slice(0, 2)).toEqual(['run', '--rm']);
      expect(args).toContain('GRAFANA_SERVER');
      expect(args).toContain('GRAFANA_TOKEN');
      expect(args).toContain('/tmp/observability:/resources:ro');
      expect(args.slice(-3)).toEqual(['grafana/gcx:v1.8.0', 'resources', 'push']);
    } finally {
      process.env.PATH = path;
    }
  });

  it("reads an answer larger than the 1 MiB that Node keeps by default, as Grafana Cloud's 1.6 MB dashboard listing was on 2026-11-24", () => {
    const bin = join(work, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), '#!/bin/sh\nhead -c 4194304 /dev/zero | tr "\\000" x\n');
    chmodSync(join(bin, 'docker'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path ?? ''}`;
    try {
      const result = dockerGcx('grafana/gcx:v1.8.0', '/tmp/observability')(['resources', 'get']);
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(result.stdout).toHaveLength(4194304);
    } finally {
      process.env.PATH = path;
    }
  });

  it('says why when docker cannot run gcx at all, instead of failing without a word', () => {
    const bin = join(work, 'empty');
    mkdirSync(bin);
    const path = process.env.PATH;
    process.env.PATH = bin;
    try {
      const result = dockerGcx('grafana/gcx:v1.8.0', '/tmp/observability')(['resources', 'get']);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('spawnSync docker ENOENT');
    } finally {
      process.env.PATH = path;
    }
  });
});

describe('run', () => {
  const env = { GRAFANA_SERVER: 'https://stand-in.grafana.net', GRAFANA_TOKEN: 'stand-in' };

  it('prints how to use it without a folder', () => {
    const { err, output } = capture();
    expect(run([], env, output, () => () => ok())).toBe(2);
    expect(err.join('')).toContain('Usage: node src/push-main.ts <folder>');
  });

  it('names the settings that are missing, and pushes nothing', () => {
    const { err, output } = capture();
    let called = false;
    const code = run([work], { GRAFANA_SERVER: '' }, output, () => {
      called = true;
      return () => ok();
    });
    expect(code).toBe(2);
    expect(called).toBe(false);
    expect(err.join('')).toContain('GRAFANA_SERVER and GRAFANA_TOKEN must be set');
  });

  it('pushes the folder it was given', () => {
    const folder = files(manifest('Dashboard', 'app', 'zigordev'));
    const { output } = capture();
    let given = '';
    const code = run([folder], env, output, (target) => {
      given = target;
      return () => ok(listing());
    });
    expect(code).toBe(0);
    expect(given).toBe(folder);
  });
});
