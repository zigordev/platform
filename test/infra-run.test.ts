import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../infra/run.sh', import.meta.url));
const account = '111122223333';

const fakeTofu = `#!/usr/bin/env bash
dir="\${1#-chdir=}"
stack="$(basename "$dir")"
command="$2"
var="FAKE_$(echo "$stack" | tr 'a-z-' 'A-Z_')"
case "$command" in
  init)
    initvar="\${var}_INIT"
    exit "\${!initvar:-0}"
    ;;
  plan)
    echo "planning $stack in account ${account}"
    for arg in "$@"; do
      case "$arg" in -out=*) : > "\${arg#-out=}" ;; esac
    done
    exit "\${!var:-0}"
    ;;
  show)
    echo "the plan of $stack in account ${account}"
    ;;
  apply)
    echo "apply $stack" >> "$FAKE_LOG"
    ;;
esac
`;

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly summary: string;
  readonly outputs: string;
  readonly applied: string;
}

let work: string;

function run(mode: string, fakes: Record<string, string> = {}): Run {
  const summary = join(work, 'summary.md');
  const outputs = join(work, 'outputs.txt');
  const applied = join(work, 'applied.log');
  for (const file of [summary, outputs, applied]) {
    writeFileSync(file, '');
  }
  const result = spawnSync('bash', [script, mode], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(work, 'bin')}:${process.env.PATH ?? ''}`,
      INFRA_ROOT: join(work, 'infra'),
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_OUTPUT: outputs,
      AWS_ACCOUNT_ID: account,
      FAKE_LOG: applied,
      ...fakes,
    },
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: readFileSync(summary, 'utf8'),
    outputs: readFileSync(outputs, 'utf8'),
    applied: readFileSync(applied, 'utf8'),
  };
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'infra-run-'));
  mkdirSync(join(work, 'bin'));
  writeFileSync(join(work, 'bin', 'tofu'), fakeTofu);
  chmodSync(join(work, 'bin', 'tofu'), 0o755);
  for (const stack of ['bootstrap', 'host']) {
    mkdirSync(join(work, 'infra', stack), { recursive: true });
    writeFileSync(join(work, 'infra', stack, 'providers.tf'), '');
  }
  mkdirSync(join(work, 'infra', 'notes'));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('infra/run.sh plan', () => {
  it('plans every stack, and hands only the changed stacks the pipeline applies to the apply job', () => {
    const result = run('plan', { FAKE_BOOTSTRAP: '0', FAKE_HOST: '2' });
    expect(result.code).toBe(0);
    expect(result.outputs).toBe('apply=host\n');
    expect(result.summary).toContain('### bootstrap: no changes');
    expect(result.summary).toContain(
      '### host: changes, applied after the owner approves the run on main'
    );
    expect(result.summary).not.toContain('### notes');
  });

  it('never hands the bootstrap to the apply job, and says where it is applied', () => {
    const result = run('plan', { FAKE_BOOTSTRAP: '2', FAKE_HOST: '0' });
    expect(result.code).toBe(0);
    expect(result.outputs).toBe('apply=\n');
    expect(result.summary).toContain(
      '### bootstrap: changes, applied from the laptop only, with the commands in docs/cloud-first-deploy.md'
    );
  });

  it('hides the account number in the summary, which a public pull request shows', () => {
    const result = run('plan', { FAKE_HOST: '2' });
    expect(result.summary).toContain('the plan of host in account <account>');
    expect(result.summary).not.toContain(account);
  });

  it('fails when a plan fails, and names the stack', () => {
    const result = run('plan', { FAKE_HOST: '1' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The plan failed for: host');
    expect(result.summary).toContain('### host: the plan failed');
  });

  it('fails when a stack cannot even start, and shows why', () => {
    const result = run('plan', { FAKE_BOOTSTRAP_INIT: '1' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The plan failed for: bootstrap');
  });

  it('leaves no plan file behind, because a plan holds secret values in plain text', () => {
    run('plan', { FAKE_HOST: '2' });
    const left = spawnSync('find', [join(work, 'infra'), '-name', '*.tfplan'], {
      encoding: 'utf8',
    });
    expect(left.stdout).toBe('');
  });
});

describe('infra/run.sh drift', () => {
  it('passes when every stack matches its code', () => {
    expect(run('drift').code).toBe(0);
  });

  it('fails when a stack differs from its code, the bootstrap included, so GitHub emails the owner', () => {
    const result = run('drift', { FAKE_BOOTSTRAP: '2' });
    expect(result.code).toBe(1);
    expect(result.summary).toContain('### bootstrap: differs from the code');
    expect(result.stderr).toContain('differs from the code for: bootstrap');
  });
});

describe('infra/run.sh apply', () => {
  it('applies every stack but the bootstrap', () => {
    const result = run('apply');
    expect(result.code).toBe(0);
    expect(result.applied).toBe('apply host\n');
    expect(result.stdout).toContain(
      'bootstrap: applied from the laptop only, so the pipeline leaves it'
    );
  });
});

describe('infra/run.sh with no mode', () => {
  it('prints how to use it and changes nothing', () => {
    const result = run('');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Usage: infra/run.sh plan|drift|apply');
    expect(result.applied).toBe('');
  });
});
