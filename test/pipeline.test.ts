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

  it('ends in the gate named check, which passes only when the pipeline and the shared services passed', () => {
    const gate = job('check');
    expect(gate).toContain('name: check\n');
    expect(gate).toContain('needs: [pipeline, stack, infra-plan]\n');
    expect(gate).toContain('if: always()\n');
    expect(gate).toContain('test "$PIPELINE" = "success"\n');
    expect(gate).toContain('test "$STACK" = "success"\n');
    expect(gate).toContain('test "$INFRA" = "success"\n');
  });

  it('names the Ubuntu of each job it runs itself, so that only a pull request moves it', () => {
    const machines = [...caller.matchAll(/^ {4}runs-on: (.+)$/gm)].map((match) => match[1]);
    expect(machines).toEqual([
      'ubuntu-26.04-arm',
      'ubuntu-26.04',
      'ubuntu-26.04',
      'ubuntu-26.04',
      'ubuntu-26.04',
      'ubuntu-26.04',
    ]);
  });

  it('runs on every pull request and on every merge to main', () => {
    expect(caller).toContain('  pull_request:\n');
    expect(caller).toContain('  push:\n    branches: [main]\n');
  });
});

describe('the job that starts the shared services', () => {
  const stack = job('stack');

  it('runs on the kind of machine the host is, and may only read the repo', () => {
    expect(stack).toContain('runs-on: ubuntu-26.04-arm\n');
    expect(stack).toContain('    permissions:\n      contents: read\n');
    expect(stack).not.toContain('write');
  });

  it('starts them with the command a person uses, so it waits for every health check and pushes the dashboards', () => {
    expect(stack).toContain('          pnpm local:up\n');
  });

  it('gives the Docker proxy the group that owns the socket on that machine', () => {
    expect(stack).toContain('DOCKER_SOCKET_GROUP="$(stat -c %g /var/run/docker.sock)"\n');
    expect(stack).toContain('          export DOCKER_SOCKET_GROUP\n');
  });

  it('opens each of the four local addresses', () => {
    expect(stack).toContain(
      'for address in grafana.localhost/api/health mail.localhost/readyz traefik.localhost/api/overview alloy.localhost/-/ready; do'
    );
    expect(stack).toContain('curl --fail --silent --show-error');
  });

  it('sends a trace to the port an app outside a container uses, and finds it in Grafana', () => {
    expect(stack).toContain('http://127.0.0.1:4318/v1/traces\n');
    expect(stack).toContain(
      'http://grafana.localhost/api/datasources/proxy/uid/tempo/api/traces/$trace_id'
    );
  });

  it('shows the containers when a step failed, and stops them whatever happened', () => {
    expect(stack).toContain('        if: failure()\n');
    expect(stack).toContain('        if: always()\n        run: pnpm local:down\n');
  });

  it('pins its two actions to a commit, like the pipeline it runs beside', () => {
    const pins = [...stack.matchAll(/uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\n/g)];
    expect(pins).toHaveLength(2);
  });
});

describe('the release of this repo', () => {
  it('is the one toolkit holds too, at the same commit and version as the pipeline', () => {
    const calls = [...caller.matchAll(pinned)].map((match) => match.slice(1));
    expect(calls.map(([workflow]) => workflow)).toEqual(['check', 'release', 'deploy']);
    expect(calls[1]?.slice(1)).toEqual(calls[0]?.slice(1));
    expect(calls[2]?.slice(1)).toEqual(calls[0]?.slice(1));
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
    expect(job('stack')).not.toContain('id-token');
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

const drift = read('../.github/workflows/drift.yml');
const signIn =
  /uses: aws-actions\/configure-aws-credentials@[0-9a-f]{40} # v\d+\.\d+\.\d+\n {8}with:\n {10}role-to-assume: arn:aws:iam::\$\{\{ secrets\.AWS_ACCOUNT_ID \}\}:role\/(platform-opentofu-\w+)\n/;

describe('the infrastructure plan', () => {
  const plan = job('infra-plan');

  it('signs in with the read-only role, the account number taken from a secret, which GitHub hides in every log', () => {
    expect(signIn.exec(plan)?.[1]).toBe('platform-opentofu-plan');
    expect(plan).toContain('mask-aws-account-id: true\n');
  });

  it('may read the repo and ask GitHub for the proof AWS trusts, and nothing more', () => {
    expect(plan).toContain('    permissions:\n      contents: read\n      id-token: write\n');
  });

  it('runs on every pull request of this repo and on main, but not for a fork, which gets no sign-in', () => {
    expect(plan).toContain(
      "if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository\n"
    );
  });

  it('plans with the script that the apply and the drift check use too', () => {
    expect(plan).toContain('run: infra/run.sh plan\n');
    expect(plan).toMatch(/^ {6}apply: \$\{\{ steps\.plan\.outputs\.apply \}\}$/m);
  });
});

describe('the infrastructure apply', () => {
  const apply = job('infra-apply');

  it('waits for the owner in the environment that the apply role trusts', () => {
    expect(apply).toContain('environment: infrastructure\n');
    expect(signIn.exec(apply)?.[1]).toBe('platform-opentofu-apply');
  });

  it('runs after the gate, on main only, and only when a stack the pipeline applies has changes', () => {
    expect(apply).toContain('needs: [check, infra-plan]\n');
    expect(apply).toContain(
      "if: github.event_name == 'push' && needs.infra-plan.outputs.apply != ''\n"
    );
  });

  it('applies with the script, which leaves the bootstrap to the laptop', () => {
    expect(apply).toContain('run: infra/run.sh apply\n');
  });
});

describe('the push of dashboards and alerts to Grafana Cloud', () => {
  const decide = job('observability-changes');
  const push = job('observability-push');
  const toggle = JSON.parse(read('../observability/push.json')) as {
    grafanaCloud: boolean;
    removeBy: string;
  };

  it('decides on main only, from the switch and from whether the files gcx pushes changed', () => {
    expect(decide).toContain("if: github.event_name == 'push'\n");
    expect(decide).toContain('enabled="$(jq -r .grafanaCloud observability/push.json)"\n');
    expect(decide).toContain('pnpm --filter platform-observability run build > /dev/null &&\n');
    expect(decide).toContain('build "$RUNNER_TEMP/after"\n');
    expect(decide).toContain(
      'if git checkout --quiet HEAD~1 && build "$RUNNER_TEMP/before"; then\n'
    );
    expect(decide).toContain(
      'changed="$(diff -rq "$RUNNER_TEMP/before" "$RUNNER_TEMP/after" || true)"\n'
    );
    expect(decide).not.toContain('git diff --name-only');
    expect(decide).toContain('    permissions:\n      contents: read\n    outputs:\n');
  });

  it('asks for a push when the files of the commit before cannot be built, so a doubt never skips one', () => {
    expect(decide).toContain('changed="the files of the commit before could not be built"\n');
  });

  it('waits for the owner in the environment that the apply role trusts, after the gate and the apply', () => {
    expect(push).toContain('environment: infrastructure\n');
    expect(push).toContain('needs: [check, infra-apply, observability-changes]\n');
    expect(push).toContain("needs.observability-changes.outputs.push == 'true'");
    expect(push).toContain("needs.check.result == 'success'");
    expect(push).toContain('role/platform-opentofu-apply\n');
  });

  it('hides the token in the log, and pushes with the package that builds the files', () => {
    expect(push).toContain('echo "::add-mask::$GRAFANA_TOKEN"\n');
    expect(push).toContain('pnpm --filter platform-observability run build\n');
    expect(push).toContain('pnpm --filter platform-observability run push\n');
  });

  it('is switched off until the agent sends data, by a switch that must go before its date', () => {
    expect(typeof toggle.grafanaCloud).toBe('boolean');
    expect(Date.parse(toggle.removeBy)).toBeGreaterThan(Date.now());
  });
});

describe('the drift check', () => {
  it('runs once a week, and can be started by hand', () => {
    expect(drift).toContain('  schedule:\n    - cron: "17 6 * * 1"\n');
    expect(drift).toContain('  workflow_dispatch:\n');
  });

  it('signs in with the read-only role, and fails when a stack differs from its code', () => {
    expect(signIn.exec(drift)?.[1]).toBe('platform-opentofu-plan');
    expect(drift).toContain('run: infra/run.sh drift\n');
    expect(drift).not.toContain('platform-opentofu-apply');
  });

  it('names its machine exactly, and asks for no right beyond reading and the proof AWS trusts', () => {
    expect(drift).toContain('runs-on: ubuntu-26.04\n');
    expect(drift).toContain('\npermissions: {}\n');
    expect(drift).toContain('    permissions:\n      contents: read\n      id-token: write\n');
  });
});

describe('the account number', () => {
  it('is read from a secret everywhere, never from a variable, because GitHub prints a variable in public logs', () => {
    for (const workflow of [caller, drift]) {
      expect(workflow).not.toContain('vars.AWS_ACCOUNT_ID');
      expect(workflow).toMatch(/arn:aws:iam::\$\{\{ secrets\.AWS_ACCOUNT_ID \}\}:role\//);
    }
  });
});

describe('the deploy of the shared services', () => {
  const deploy = job('deploy');

  it('is the deploy workflow toolkit holds, at the same commit and version as the pipeline', () => {
    expect(deploy).toMatch(
      /uses: zigordev\/toolkit\/\.github\/workflows\/deploy\.yml@[0-9a-f]{40} # v\d+\.\d+\.\d+\n/
    );
  });

  it('runs on main only, after the gate, and after the apply when a stack changed', () => {
    expect(deploy).toContain('needs: [check, infra-apply]\n');
    expect(deploy).toContain(
      "if: always() && github.event_name == 'push' && needs.check.result == 'success' && (needs.infra-apply.result == 'success' || needs.infra-apply.result == 'skipped')\n"
    );
  });

  it('grants exactly what the deploy workflow asks for, or GitHub would stop the run when it starts', () => {
    expect(deploy).toContain(
      '    permissions:\n      contents: read\n      id-token: write\n      attestations: read\n'
    );
  });

  it('deploys the target platform from the folder stack, with no public address to ask', () => {
    expect(deploy).toContain('    with:\n      target: platform\n      compose-dir: stack\n');
    expect(deploy).not.toContain('health-url');
  });

  it('hands over the account number as a secret, which GitHub hides in every log', () => {
    expect(deploy).toContain('    secrets:\n      AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID }}\n');
  });
});
