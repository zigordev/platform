import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { manifests, run, write } from './build.ts';

const expected = [
  'alert-app-answers-with-errors.json',
  'alert-app-is-slow.json',
  'alert-host-is-filling-up.json',
  'alert-telemetry-went-silent.json',
  'dashboard-app.json',
  'dashboard-platform.json',
  'folder.json',
];

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
  it('are one folder, two dashboards and four alert rules', () => {
    expect(Object.keys(manifests()).sort()).toEqual(expected);
  });

  it('each hold one resource with a name', () => {
    for (const manifest of Object.values(manifests())) {
      expect(manifest.apiVersion).toMatch(/\.grafana\.app\/v\d/);
      expect(manifest.metadata.name).not.toBe('');
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

  it('writes the files into the folder it is given, and says how many', () => {
    const target = join(scratch(), 'out');
    expect(attempt([target])).toEqual({
      code: 0,
      out: `observability: wrote 7 files to ${target}\n`,
      err: '',
    });
    expect(readdirSync(target).sort()).toEqual(expected);
  });

  it.each([[[]], [['one', 'two']]])('explains itself and writes nothing for %j', (args) => {
    expect(attempt(args)).toEqual({ code: 2, out: '', err: 'Usage: node src/main.ts <folder>\n' });
  });

  it('runs as a script, the way the build calls it', () => {
    const script = fileURLToPath(new URL('./main.ts', import.meta.url));
    const target = join(scratch(), 'from-script');
    const output = execFileSync(process.execPath, [script, target], { encoding: 'utf8' });
    expect(output).toBe(`observability: wrote 7 files to ${target}\n`);
    expect(readdirSync(target).sort()).toEqual(expected);
  });
});
