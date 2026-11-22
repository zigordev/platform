import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const caller = read('../.github/workflows/ci.yml');
const pinned =
  /uses: zigordev\/toolkit\/\.github\/workflows\/(\w+)\.yml@([0-9a-f]{40}) # (v\d+\.\d+\.\d+)\n/g;

function job(name: string): string {
  const rest = caller.slice(caller.indexOf(`\n  ${name}:\n`) + 1);
  const next = /\n {2}\w[\w-]*:\n/.exec(rest);
  return next === null ? rest : rest.slice(0, next.index + 1);
}

describe('the pipeline of this repo', () => {
  it('is the one toolkit holds, called at one commit with its version beside it', () => {
    expect(job('pipeline')).toMatch(
      /uses: zigordev\/toolkit\/\.github\/workflows\/check\.yml@[0-9a-f]{40} # v\d+\.\d+\.\d+\n/
    );
  });

  it('may read the repo and report the code scan, and nothing more', () => {
    expect(job('pipeline')).toContain(
      '    permissions:\n      contents: read\n      security-events: write\n'
    );
  });

  it('gives no job a right it did not ask for', () => {
    expect(caller).toContain('\npermissions: {}\n');
  });

  it('ends in the gate named check, which passes only when the pipeline passed', () => {
    const gate = job('check');
    expect(gate).toContain('name: check\n');
    expect(gate).toContain('needs: [pipeline]\n');
    expect(gate).toContain('if: always()\n');
    expect(gate).toContain('test "$RESULT" = "success"\n');
  });

  it('runs on every pull request and on every merge to main', () => {
    expect(caller).toContain('  pull_request:\n');
    expect(caller).toContain('  push:\n    branches: [main]\n');
  });
});

describe('the release of this repo', () => {
  it('is the one toolkit holds too, at the same commit and version as the pipeline', () => {
    const calls = [...caller.matchAll(pinned)].map((match) => match.slice(1));
    expect(calls.map(([workflow]) => workflow)).toEqual(['check', 'release']);
    expect(calls[1]?.slice(1)).toEqual(calls[0]?.slice(1));
  });

  it('runs after the gate, and only on a merge to main', () => {
    expect(job('release')).toContain('needs: [check]\n');
    expect(job('release')).toContain("if: github.event_name == 'push'\n");
  });

  it('may tag a version and ask GitHub for the proof that npm trusts, and nothing more', () => {
    expect(job('release')).toContain(
      '    permissions:\n      contents: write\n      id-token: write\n'
    );
    expect(job('pipeline')).not.toContain('id-token');
    expect(job('check')).not.toContain('write');
  });

  it('takes its settings from the shared ones, through a file that semantic-release can read', () => {
    expect(read('../release.config.js')).toBe(
      "export { default } from '@zigordev/dev/semantic-release';\n"
    );
  });

  it('has the release tool installed, at the version the catalog names', () => {
    const manifest = JSON.parse(read('../package.json')) as {
      devDependencies: Record<string, string>;
    };
    expect(manifest.devDependencies['semantic-release']).toBe('catalog:');
    expect(
      existsSync(new URL('../node_modules/semantic-release/package.json', import.meta.url))
    ).toBe(true);
  });
});
