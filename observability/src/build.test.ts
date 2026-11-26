import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cloudManifests, manifests, run, write } from './build.ts';

const expected = [
  'alert-app-answers-with-errors.json',
  'alert-app-cannot-be-reached-from-outside.json',
  'alert-app-is-slow.json',
  'alert-backup-is-too-old.json',
  'alert-email-failed-for-good.json',
  'alert-host-is-filling-up.json',
  'alert-jobs-are-waiting.json',
  'alert-kafka-broker-is-down.json',
  'alert-mail-server-cannot-be-reached.json',
  'alert-message-reached-dead-letter-topic.json',
  'alert-messages-are-stuck.json',
  'alert-restore-test-is-too-old.json',
  'alert-telemetry-went-silent.json',
  'dashboard-app.json',
  'dashboard-platform.json',
  'folder.json',
];

const expectedCloud = ['alert-free-limit-is-near.json', 'dashboard-usage.json'];

let folder = '';

function scratch(): string {
  folder = mkdtempSync(join(tmpdir(), 'zigordev-observability-'));
  return folder;
}

afterEach(() => {
  if (folder !== '') {
    rmSync(folder, { recursive: true, force: true });
    folder = '';
  }
});

describe('the files that gcx pushes', () => {
  it('are one folder, two dashboards and thirteen alert rules', () => {
    expect(Object.keys(manifests()).sort()).toEqual(expected);
  });

  it('each hold one resource with a name', () => {
    for (const manifest of Object.values({ ...manifests(), ...cloudManifests() })) {
      expect(manifest.apiVersion).toMatch(/\.grafana\.app\/v\d/);
      expect(manifest.metadata.name).not.toBe('');
    }
  });
});

describe('the files only Grafana Cloud gets', () => {
  it("are the dashboard and the alert rule that read Grafana Cloud's usage, which the laptop does not have", () => {
    expect(Object.keys(cloudManifests()).sort()).toEqual(expectedCloud);
  });

  it('never share a name with the files every Grafana gets, so the push can gather both', () => {
    const everywhere = new Set(Object.keys(manifests()));
    for (const file of Object.keys(cloudManifests())) {
      expect(everywhere.has(file)).toBe(false);
    }
  });
});

describe('writing them', () => {
  it('creates the folder and writes each file as JSON that ends with a new line', () => {
    const target = join(scratch(), 'deep', 'observability');
    expect(write(target).sort()).toEqual(expected);
    expect(readdirSync(target).sort()).toEqual(expected);
    const text = readFileSync(join(target, 'folder.json'), 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(manifests()['folder.json']);
  });

  it('removes the file of a resource that no longer exists, and leaves other files alone', () => {
    const target = scratch();
    writeFileSync(join(target, 'alert-long-gone.json'), '{}\n');
    writeFileSync(join(target, 'notes.txt'), 'kept\n');
    write(target);
    expect(existsSync(join(target, 'alert-long-gone.json'))).toBe(false);
    expect(readFileSync(join(target, 'notes.txt'), 'utf8')).toBe('kept\n');
  });

  it('writes the files it is given, such as the ones only Grafana Cloud gets', () => {
    const target = join(scratch(), 'cloud');
    expect(write(target, cloudManifests()).sort()).toEqual(expectedCloud);
    expect(readdirSync(target).sort()).toEqual(expectedCloud);
  });

  it('writes the same bytes each time, so a rebuild changes nothing', () => {
    const target = scratch();
    write(target);
    const first = readFileSync(join(target, 'dashboard-app.json'), 'utf8');
    write(target);
    expect(readFileSync(join(target, 'dashboard-app.json'), 'utf8')).toBe(first);
  });
});

describe('the build script', () => {
  function attempt(args: readonly string[]): { code: number; out: string; err: string } {
    let out = '';
    let err = '';
    const code = run(args, {
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
    });
    return { code, out, err };
  }

  it('writes the files into the two folders it is given, and says how many', () => {
    const target = join(scratch(), 'out');
    const cloudTarget = join(folder, 'cloud');
    expect(attempt([target, cloudTarget])).toEqual({
      code: 0,
      out: `observability: wrote 16 files to ${target}, and 2 for Grafana Cloud only to ${cloudTarget}\n`,
      err: '',
    });
    expect(readdirSync(target).sort()).toEqual(expected);
    expect(readdirSync(cloudTarget).sort()).toEqual(expectedCloud);
  });

  it.each([[[]], [['one']], [['one', 'two', 'three']]])(
    'explains itself and writes nothing for %j',
    (args) => {
      expect(attempt(args)).toEqual({
        code: 2,
        out: '',
        err: 'Usage: node src/main.ts <folder> <cloud-folder>\n',
      });
    }
  );

  it('runs as a script, the way the build calls it', () => {
    const script = fileURLToPath(new URL('./main.ts', import.meta.url));
    const target = join(scratch(), 'from-script');
    const cloudTarget = join(folder, 'from-script-cloud');
    const output = execFileSync(process.execPath, [script, target, cloudTarget], {
      encoding: 'utf8',
    });
    expect(output).toBe(
      `observability: wrote 16 files to ${target}, and 2 for Grafana Cloud only to ${cloudTarget}\n`
    );
    expect(readdirSync(target).sort()).toEqual(expected);
    expect(readdirSync(cloudTarget).sort()).toEqual(expectedCloud);
  });
});
