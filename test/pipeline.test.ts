import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const caller = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

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
