import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../host/root/usr/local/sbin/platform-deploy', import.meta.url)
);
const fakes = fileURLToPath(new URL('./fixtures/deploy', import.meta.url));

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@invalid',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@invalid',
};

function digest(seed: string): string {
  return `sha256:${seed.repeat(64)}`;
}

const api = `ghcr.io/zigordev/hello-api@${digest('a')}`;
const web = `ghcr.io/zigordev/hello-web@${digest('b')}`;
const ours = `${api} ${web}`;
const postgres = `postgres:18.7-alpine3.24@${digest('c')}`;
const secret = 'key-that-must-never-show';
const unknown = '0'.repeat(40);

let work: string;
let revision = 0;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function repo(name: string): void {
  mkdirSync(join(work, 'remote'), { recursive: true });
  mkdirSync(join(work, 'clones'), { recursive: true });
  git(join(work, 'remote'), 'init', '--quiet', '--bare', '--initial-branch=main', `${name}.git`);
  git(join(work, 'clones'), 'clone', '--quiet', join(work, 'remote', `${name}.git`), name);
}

function commit(name: string, folder: string, secrets: readonly string[], branch = 'main'): string {
  revision += 1;
  const clone = join(work, 'clones', name);
  const base = folder === '.' ? clone : join(clone, folder);
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'compose.yaml'), `name: ${name}\nx-revision: "${revision}"\n`);
  writeFileSync(join(base, 'compose.production.yaml'), 'services: {}\n');
  writeFileSync(
    join(base, '.env.production.example'),
    secrets.map((item) => `${item}=\n`).join('')
  );
  git(clone, 'add', '--all');
  git(clone, 'commit', '--quiet', '--message', `revision ${revision}`);
  git(clone, 'push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`);
  return git(clone, 'rev-parse', 'HEAD');
}

function configure(sha: string, config: unknown): void {
  mkdirSync(join(work, 'fake', 'config'), { recursive: true });
  writeFileSync(join(work, 'fake', 'config', `${sha}.json`), JSON.stringify(config));
}

function product(sha: string, options: { web?: boolean; postgres?: string } = {}): void {
  const services: Record<string, unknown> = {
    'hello-postgres': {
      image: options.postgres ?? postgres,
      labels: { 'com.zigordev.backup': 'postgres' },
    },
    'hello-api-migrate': {
      image: `ghcr.io/zigordev/hello-api:${sha}`,
      labels: { 'com.zigordev.job': 'migrate' },
    },
    'hello-api': {
      image: `ghcr.io/zigordev/hello-api:${sha}`,
      labels: { 'traefik.enable': 'true' },
    },
  };
  if (options.web !== false) {
    services['hello-web'] = {
      image: `ghcr.io/zigordev/hello-web:${sha}`,
      labels: { 'traefik.enable': 'true' },
    };
  }
  configure(sha, { name: 'hello', services });
}

function release(): string {
  const sha = commit('hello', '.', ['HELLO_API_KEYS', 'POSTGRES_PASSWORD']);
  product(sha);
  return sha;
}

function parameter(name: string, value: string): void {
  const file = join(work, 'aws', name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
}

function recordFile(target = 'hello'): string {
  return join(work, 'aws', 'platform', 'deploy', target);
}

function record(target = 'hello'): Record<string, unknown> {
  return JSON.parse(readFileSync(recordFile(target), 'utf8'));
}

function fail(what: string): void {
  mkdirSync(join(work, 'fake', 'fail'), { recursive: true });
  writeFileSync(join(work, 'fake', 'fail', what), '');
}

function calls(): string[] {
  const file = join(work, 'fake', 'calls');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

function acts(): string[] {
  return calls()
    .map((call) =>
      call
        .replace(/ \| VERSION=.*$/, '')
        .replace(
          /^docker (compose|rollout) --project-name (\S+) --file \S+\/rendered-\S+-([0-9a-f]{40})\.yaml /,
          '$1:$2@$3 '
        )
        .replace(
          /^docker compose --project-name (\S+) --file \S+\/releases\/([0-9a-f]{40})\/compose\.yaml --file \S+ /,
          'compose:$1@$2 '
        )
    )
    .filter((call) => !/^(compose:\S+ (ps|config)( |$)|docker ps )/.test(call));
}

function forget(): void {
  rmSync(join(work, 'fake', 'calls'), { force: true });
}

function run(...args: string[]) {
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...gitEnv,
      PATH: `${fakes}:${process.env.PATH ?? ''}`,
      PLATFORM_DEPLOY_STATE: join(work, 'state'),
      PLATFORM_DEPLOY_RUN: join(work, 'run'),
      PLATFORM_DEPLOY_LOCKS: join(work, 'locks'),
      PLATFORM_GIT_BASE: `file://${join(work, 'remote')}`,
      PLATFORM_DOCKER_SOCKET: join(work, 'docker.sock'),
      FAKE_DIR: join(work, 'fake'),
      FAKE_AWS: join(work, 'aws'),
      FAKE_SECRET_NAME: 'HELLO_API_KEYS',
    },
  });
  const lines = result.stdout.trimEnd().split('\n');
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    lines,
    last: lines.at(-1) ?? '',
  };
}

function deploy(sha: string, images = ours) {
  return run(
    '--target',
    'hello',
    '--repo',
    'hello',
    '--dir',
    '.',
    '--action',
    'deploy',
    '--commit',
    sha,
    '--images',
    images
  );
}

function rollback(sha: string) {
  return run(
    '--target',
    'hello',
    '--repo',
    'hello',
    '--dir',
    '.',
    '--action',
    'rollback',
    '--commit',
    sha
  );
}

function results(lines: readonly string[]): string[] {
  return lines.filter((line) => line.startsWith('platform-deploy:'));
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'host-deploy-'));
  mkdirSync(join(work, 'run'));
  mkdirSync(join(work, 'fake'));
  repo('hello');
  parameter('/hello/HELLO_API_KEYS', secret);
  parameter('/hello/POSTGRES_PASSWORD', 'another-hidden-value');
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('platform-deploy', { timeout: 30_000 }, () => {
  it('deploys a first version: the data store, then the job, then each routed service, and records it', () => {
    const first = release();
    const result = deploy(first);
    expect(result.last).toBe(
      `platform-deploy: result=deployed target=hello commit=${first} previous=none`
    );
    expect(result.code).toBe(0);
    expect(acts()).toEqual([
      `docker pull --quiet ${api}`,
      `docker tag ${api} ghcr.io/zigordev/hello-api:${first}`,
      `docker pull --quiet ${web}`,
      `docker tag ${web} ghcr.io/zigordev/hello-web:${first}`,
      `compose:hello@${first} pull --quiet hello-postgres`,
      `compose:hello@${first} up --detach --no-deps --wait --wait-timeout 180 hello-postgres`,
      `compose:hello@${first} up --no-deps --force-recreate --exit-code-from hello-api-migrate hello-api-migrate`,
      `compose:hello@${first} up --detach --no-deps --force-recreate --wait --wait-timeout 180 hello-api`,
      `compose:hello@${first} up --detach --no-deps --force-recreate --wait --wait-timeout 180 hello-web`,
    ]);
    expect(record()).toMatchObject({
      commit: first,
      images: ours,
      repo: 'hello',
      dir: '.',
      previous: null,
    });
  });

  it('rolls each routed service out beside the old one from the second deploy on, and records the previous version', () => {
    const first = release();
    deploy(first);
    const second = release();
    forget();
    const result = deploy(second);
    expect(result.last).toBe(
      `platform-deploy: result=deployed target=hello commit=${second} previous=${first}`
    );
    expect(acts().filter((call) => call.startsWith('rollout:'))).toEqual([
      `rollout:hello@${second} --timeout 180 hello-api`,
      `rollout:hello@${second} --timeout 180 hello-web`,
    ]);
    const rollouts = calls().filter((call) => call.startsWith('docker rollout'));
    expect(rollouts).toHaveLength(2);
    for (const call of rollouts) {
      expect(call.match(/ --file /g)).toHaveLength(1);
      expect(call).toContain(`${join(work, 'run')}/platform-deploy.`);
      expect(call).toContain(`/rendered-hello-${second}.yaml --timeout 180`);
    }
    expect(record()).toMatchObject({ commit: second, previous: { commit: first, images: ours } });
  });

  it('keeps the previous version when the same commit is deployed again', () => {
    const first = release();
    deploy(first);
    const second = release();
    deploy(second);
    const again = deploy(second);
    expect(again.last).toBe(
      `platform-deploy: result=deployed target=hello commit=${second} previous=${second}`
    );
    expect(record()).toMatchObject({ commit: second, previous: { commit: first } });
  });

  it('refuses a commit that is not on main, before anything changes', () => {
    release();
    const side = commit('hello', '.', ['HELLO_API_KEYS'], 'side');
    git(join(work, 'clones', 'hello'), 'reset', '--quiet', '--hard', 'HEAD~1');
    product(side);
    const result = deploy(side);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=not-on-main target=hello commit=${side}`
    );
    expect(acts()).toEqual([]);
    expect(existsSync(recordFile())).toBe(false);
  });

  it('skips a commit that a newer deploy overtook', () => {
    const first = release();
    deploy(first);
    const second = release();
    deploy(second);
    forget();
    const result = deploy(first);
    expect(result.code).toBe(0);
    expect(result.last).toBe(
      `platform-deploy: result=skipped reason=overtaken target=hello commit=${first} current=${second}`
    );
    expect(acts()).toEqual([]);
    expect(record()).toMatchObject({ commit: second });
  });

  it('refuses missing secrets by their names, before anything changes', () => {
    rmSync(join(work, 'aws', 'hello', 'POSTGRES_PASSWORD'));
    const first = release();
    const result = deploy(first);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=missing-secrets target=hello commit=${first}`
    );
    expect(result.stdout).toContain(
      'These secrets are missing in Parameter Store: POSTGRES_PASSWORD'
    );
    expect(acts()).toEqual([]);
    expect(existsSync(recordFile())).toBe(false);
  });

  it('renders the files once with the secrets, and runs nothing with a secret in its environment', () => {
    const first = release();
    const result = deploy(first);
    const seen = readFileSync(join(work, 'fake', 'secrets-seen'), 'utf8')
      .split('\n')
      .filter(Boolean);
    expect(seen.filter((line) => line.startsWith('config-json '))).toEqual([
      'config-json placeholder',
    ]);
    expect(seen).toContain(`config-render ${secret}`);
    const running = seen.filter((line) => /^(up|rollout) /.test(line));
    expect(running).not.toHaveLength(0);
    expect(running.every((line) => line === 'up ' || line === 'rollout ')).toBe(true);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    expect(`${result.stdout}${result.stderr}`).not.toContain('another-hidden-value');
    expect(readdirSync(join(work, 'run'))).toEqual([]);
  });

  it('refuses an image of ours without a verified digest, and an outside image without its digest', () => {
    const first = release();
    const missing = deploy(first, api);
    expect(missing.code).toBe(2);
    expect(missing.last).toBe(
      `platform-deploy: result=refused reason=unverified-image target=hello commit=${first}`
    );
    expect(missing.stdout).toContain(
      `hello-web runs ghcr.io/zigordev/hello-web:${first}, and no verified digest of ghcr.io/zigordev/hello-web:${first} came with the command`
    );
    product(first, { postgres: 'postgres:18.7-alpine3.24' });
    const loose = deploy(first);
    expect(loose.code).toBe(2);
    expect(loose.last).toBe(
      `platform-deploy: result=refused reason=unpinned-image target=hello commit=${first}`
    );
    expect(loose.stdout).toContain(
      'hello-postgres runs postgres:18.7-alpine3.24, which is not pinned by its digest'
    );
    expect(acts()).toEqual([]);
  });

  it('stops when the job fails, and puts the previous version back without rolling anything', () => {
    const first = release();
    deploy(first);
    const second = release();
    fail('job-hello-api-migrate');
    forget();
    const result = deploy(second);
    expect(result.code).toBe(1);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=job target=hello commit=${second} restored=${first}`
    );
    expect(result.stdout).toContain('the migration failed');
    const after = acts();
    expect(after.some((call) => call.startsWith('rollout:'))).toBe(false);
    expect(after.at(-1)).toBe(
      `compose:hello@${first} up --detach --no-deps --wait --wait-timeout 180 hello-postgres`
    );
    expect(record()).toMatchObject({ commit: first });
  });

  it('rolls back only what switched when a later service fails its health gate, with a short output', () => {
    const first = release();
    deploy(first);
    const second = release();
    fail('rollout-hello-web');
    forget();
    const result = deploy(second);
    expect(result.code).toBe(1);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=health target=hello commit=${second} restored=${first}`
    );
    expect(acts().filter((call) => call.startsWith('rollout:'))).toEqual([
      `rollout:hello@${second} --timeout 180 hello-api`,
      `rollout:hello@${second} --timeout 180 hello-web`,
      `rollout:hello@${first} --timeout 180 hello-api`,
    ]);
    expect(result.lines.length).toBeLessThan(80);
    expect(result.stdout).toContain('log line 499 of the new container');
    expect(result.stdout).not.toContain('log line 100 of');
    expect(record()).toMatchObject({ commit: first });
  });

  it('removes what a failed first deploy started', () => {
    const first = release();
    fail('up-hello-web');
    const result = deploy(first);
    expect(result.code).toBe(1);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=health target=hello commit=${first} restored=none`
    );
    expect(acts().filter((call) => call.includes(' rm '))).toEqual([
      `compose:hello@${first} rm --stop --force hello-api`,
      `compose:hello@${first} rm --stop --force hello-web`,
    ]);
    expect(existsSync(recordFile())).toBe(false);
  });

  it('removes a service that the compose files no longer hold', () => {
    const first = release();
    deploy(first);
    const second = commit('hello', '.', ['HELLO_API_KEYS', 'POSTGRES_PASSWORD']);
    product(second, { web: false });
    forget();
    const result = deploy(second);
    expect(result.code).toBe(0);
    const old = `id-hello-web-${first.slice(0, 7)}`;
    expect(acts().filter((call) => /^docker (stop|rm) /.test(call))).toEqual([
      `docker stop ${old}`,
      `docker rm ${old}`,
    ]);
  });

  it('rolls back to the previous version without its job, and records it', () => {
    const first = release();
    deploy(first);
    const second = release();
    deploy(second);
    forget();
    const result = rollback(second);
    expect(result.code).toBe(0);
    expect(result.last).toBe(
      `platform-deploy: result=rolled-back target=hello commit=${first} from=${second}`
    );
    const after = acts();
    expect(after.filter((call) => call.startsWith('rollout:'))).toEqual([
      `rollout:hello@${first} --timeout 180 hello-api`,
      `rollout:hello@${first} --timeout 180 hello-web`,
    ]);
    expect(after.some((call) => call.includes('--exit-code-from'))).toBe(false);
    expect(record()).toMatchObject({ commit: first, images: ours, previous: null });
  });

  it('refuses a rollback of a version that does not run, or that has nothing before it', () => {
    const first = release();
    deploy(first);
    const other = release();
    expect(rollback(other).last).toBe(
      `platform-deploy: result=refused reason=not-current target=hello commit=${other}`
    );
    const none = rollback(first);
    expect(none.code).toBe(2);
    expect(none.last).toBe(
      `platform-deploy: result=refused reason=no-previous target=hello commit=${first}`
    );
  });

  it('brings back every recorded version on a host that runs none, the shared services first', () => {
    repo('platform');
    const shared = commit('platform', 'stack', ['CLOUDFLARE_TUNNEL_TOKEN']);
    configure(shared, {
      name: 'platform',
      services: {
        'docker-proxy': { image: `wollomatic/socket-proxy:1.14.0@${digest('d')}` },
        traefik: { image: `traefik:v3.7.19@${digest('e')}` },
      },
    });
    parameter('/platform/CLOUDFLARE_TUNNEL_TOKEN', 'tunnel-token-value');
    const first = release();
    parameter(
      '/platform/deploy/hello',
      JSON.stringify({ commit: first, images: ours, repo: 'hello', dir: '.', previous: null })
    );
    parameter(
      '/platform/deploy/platform',
      JSON.stringify({ commit: shared, images: '', repo: 'platform', dir: 'stack', previous: null })
    );
    const result = run('--redeploy-recorded');
    expect(result.code).toBe(0);
    expect(results(result.lines)).toEqual([
      `platform-deploy: result=redeployed target=platform commit=${shared}`,
      `platform-deploy: result=redeployed target=hello commit=${first}`,
    ]);
    expect(acts()).toContain(
      `compose:platform@${shared} up --detach --no-deps --wait --wait-timeout 180 docker-proxy traefik`
    );
    const again = run('--redeploy-recorded');
    expect(again.code).toBe(0);
    expect(results(again.lines)).toEqual([
      `platform-deploy: result=skipped reason=present target=platform commit=${shared}`,
      `platform-deploy: result=skipped reason=present target=hello commit=${first}`,
    ]);
  });

  it('does nothing at boot when nothing is recorded', () => {
    const result = run('--redeploy-recorded');
    expect(result.code).toBe(0);
    expect(result.last).toBe(
      'platform-deploy: result=skipped reason=nothing-recorded target=none commit=none'
    );
    expect(calls()).toEqual([]);
  });

  it.each([
    ['a short commit', ['--action', 'deploy', '--commit', 'abc123']],
    [
      'an image that is not ours',
      ['--action', 'deploy', '--commit', unknown, '--images', `docker.io/x/app@${digest('f')}`],
    ],
    ['an unknown action', ['--action', 'destroy', '--commit', unknown]],
    ['a rollback with images', ['--action', 'rollback', '--commit', unknown, '--images', api]],
  ])('refuses %s before it takes the lock or calls anything', (_, args) => {
    const result = run('--target', 'hello', '--repo', 'hello', '--dir', '.', ...args);
    expect(result.code).toBe(2);
    expect(result.last).toMatch(/^platform-deploy: result=refused reason=bad-input target=hello /);
    expect(calls()).toEqual([]);
    expect(existsSync(join(work, 'fake', 'aws-calls'))).toBe(false);
  });

  it.each([
    ['a folder outside the repo', ['--target', 'hello', '--repo', 'hello', '--dir', '../etc']],
    ['a target that is not a name', ['--target', 'Hello World', '--repo', 'hello', '--dir', '.']],
    ['an unknown argument', ['--force']],
  ])('refuses %s', (_, args) => {
    const result = run(...args, '--action', 'deploy', '--commit', unknown);
    expect(result.code).toBe(2);
    expect(result.last).toMatch(/^platform-deploy: result=refused reason=bad-input /);
    expect(calls()).toEqual([]);
  });

  it('refuses while another deploy of the same target holds the lock', () => {
    const first = release();
    fail('flock');
    const result = deploy(first);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=busy target=hello commit=${first}`
    );
  });

  it('refuses when GitHub or Parameter Store does not answer', () => {
    const first = release();
    rmSync(join(work, 'remote', 'hello.git'), { recursive: true });
    const github = deploy(first);
    expect(github.code).toBe(2);
    expect(github.last).toBe(
      `platform-deploy: result=refused reason=unreachable target=hello commit=${first}`
    );
    fail('aws');
    const store = deploy(first);
    expect(store.code).toBe(2);
    expect(store.last).toBe(
      `platform-deploy: result=refused reason=unreachable target=hello commit=${first}`
    );
  });

  it('still ends with a result when something unexpected stops it', () => {
    const first = release();
    parameter('/platform/deploy/hello', 'not json');
    const result = deploy(first);
    expect(result.code).not.toBe(0);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=unexpected target=hello commit=${first}`
    );
  });
});
