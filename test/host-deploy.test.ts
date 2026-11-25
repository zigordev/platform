import { spawn, spawnSync } from 'node:child_process';
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

const api = `ghcr.io/zigordev/playground-api@${digest('a')}`;
const web = `ghcr.io/zigordev/playground-web@${digest('b')}`;
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
    secrets.map((item) => (item.includes('=') ? `${item}\n` : `${item}=\n`)).join('')
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
    'playground-postgres': {
      image: options.postgres ?? postgres,
      labels: { 'com.zigordev.backup': 'postgres' },
    },
    'playground-api-migrate': {
      image: `ghcr.io/zigordev/playground-api:${sha}`,
      labels: { 'com.zigordev.job': 'migrate' },
    },
    'playground-api': {
      image: `ghcr.io/zigordev/playground-api:${sha}`,
      labels: { 'traefik.enable': 'true' },
    },
  };
  if (options.web !== false) {
    services['playground-web'] = {
      image: `ghcr.io/zigordev/playground-web:${sha}`,
      labels: { 'traefik.enable': 'true' },
    };
  }
  configure(sha, { name: 'playground', services });
}

function release(): string {
  const sha = commit('playground', '.', ['PLAYGROUND_API_KEYS', 'POSTGRES_PASSWORD']);
  product(sha);
  return sha;
}

function parameter(name: string, value: string): void {
  const file = join(work, 'aws', name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
}

function recordFile(target = 'playground'): string {
  return join(work, 'aws', 'platform', 'deploy', target);
}

function record(target = 'playground'): Record<string, unknown> {
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
  return runWith({}, ...args);
}

function environment(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...gitEnv,
    PATH: `${fakes}:${process.env.PATH ?? ''}`,
    PLATFORM_DEPLOY_STATE: join(work, 'state'),
    PLATFORM_DEPLOY_RUN: join(work, 'run'),
    PLATFORM_DEPLOY_LOCKS: join(work, 'locks'),
    PLATFORM_GIT_BASE: `file://${join(work, 'remote')}`,
    PLATFORM_DOCKER_SOCKET: join(work, 'docker.sock'),
    FAKE_DIR: join(work, 'fake'),
    FAKE_AWS: join(work, 'aws'),
    FAKE_SECRET_NAME: 'PLAYGROUND_API_KEYS',
    PLATFORM_SETUP_MARKER: join(work, 'setup-done'),
    ...extra,
  };
}

function outcome(code: number | null, stdout: string, stderr: string) {
  const lines = stdout.trimEnd().split('\n');
  return { code, stdout, stderr, lines, last: lines.at(-1) ?? '' };
}

function runWith(extra: Record<string, string>, ...args: string[]) {
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: environment(extra),
  });
  return outcome(result.status, result.stdout, result.stderr);
}

function runLater(...args: string[]): Promise<ReturnType<typeof outcome>> {
  return new Promise((resolve) => {
    const child = spawn('bash', [script, ...args], { env: environment({}) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => resolve(outcome(code, stdout, stderr)));
  });
}

function deploy(sha: string, images = ours) {
  return run(
    '--target',
    'playground',
    '--repo',
    'playground',
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
    'playground',
    '--repo',
    'playground',
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
  writeFileSync(join(work, 'setup-done'), '2026-11-24T13:30:00Z\n');
  repo('playground');
  parameter('/playground/PLAYGROUND_API_KEYS', secret);
  parameter('/playground/POSTGRES_PASSWORD', 'another-hidden-value');
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('platform-deploy', { timeout: 30_000 }, () => {
  it('deploys a first version: the data store, then the job, then each routed service, and records it', () => {
    const first = release();
    const result = deploy(first);
    expect(result.last).toBe(
      `platform-deploy: result=deployed target=playground commit=${first} previous=none`
    );
    expect(result.code).toBe(0);
    expect(acts()).toEqual([
      `docker pull --quiet ${api}`,
      `docker tag ${api} ghcr.io/zigordev/playground-api:${first}`,
      `docker pull --quiet ${web}`,
      `docker tag ${web} ghcr.io/zigordev/playground-web:${first}`,
      `compose:playground@${first} pull --quiet playground-postgres`,
      `compose:playground@${first} up --detach --no-deps --wait --wait-timeout 180 playground-postgres`,
      `compose:playground@${first} up --no-deps --force-recreate --exit-code-from playground-api-migrate playground-api-migrate`,
      `compose:playground@${first} up --detach --no-deps --force-recreate --wait --wait-timeout 180 playground-api`,
      `compose:playground@${first} up --detach --no-deps --force-recreate --wait --wait-timeout 180 playground-web`,
    ]);
    expect(record()).toMatchObject({
      commit: first,
      images: ours,
      repo: 'playground',
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
      `platform-deploy: result=deployed target=playground commit=${second} previous=${first}`
    );
    expect(acts().filter((call) => call.startsWith('rollout:'))).toEqual([
      `rollout:playground@${second} --timeout 180 playground-api`,
      `rollout:playground@${second} --timeout 180 playground-web`,
    ]);
    const rollouts = calls().filter((call) => call.startsWith('docker rollout'));
    expect(rollouts).toHaveLength(2);
    for (const call of rollouts) {
      expect(call.match(/ --file /g)).toHaveLength(1);
      expect(call).toContain(`${join(work, 'run')}/platform-deploy.`);
      expect(call).toContain(`/rendered-playground-${second}.yaml --timeout 180`);
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
      `platform-deploy: result=deployed target=playground commit=${second} previous=${second}`
    );
    expect(record()).toMatchObject({ commit: second, previous: { commit: first } });
  });

  it('refuses a commit that is not on main, before anything changes', () => {
    release();
    const side = commit('playground', '.', ['PLAYGROUND_API_KEYS'], 'side');
    git(join(work, 'clones', 'playground'), 'reset', '--quiet', '--hard', 'HEAD~1');
    product(side);
    const result = deploy(side);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=not-on-main target=playground commit=${side}`
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
      `platform-deploy: result=skipped reason=overtaken target=playground commit=${first} current=${second}`
    );
    expect(acts()).toEqual([]);
    expect(record()).toMatchObject({ commit: second });
  });

  it('refuses missing secrets by their names, before anything changes', () => {
    rmSync(join(work, 'aws', 'playground', 'POSTGRES_PASSWORD'));
    const first = release();
    const result = deploy(first);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=missing-secrets target=playground commit=${first}`
    );
    expect(result.stdout).toContain(
      'These secrets are missing in Parameter Store: POSTGRES_PASSWORD'
    );
    expect(acts()).toEqual([]);
    expect(existsSync(recordFile())).toBe(false);
  });

  it("lets the shared services read a product's Kafka password from that product's own parameter, so it lives once", () => {
    repo('platform');
    const shared = commit('platform', 'stack', [
      'CLOUDFLARE_TUNNEL_TOKEN',
      'KAFKA_PASSWORD_NOTIFICATIONS_API=/notifications/KAFKA_PASSWORD',
    ]);
    configure(shared, {
      name: 'platform',
      services: { traefik: { image: `traefik:v3.7.19@${digest('e')}` } },
    });
    parameter('/platform/CLOUDFLARE_TUNNEL_TOKEN', 'tunnel-token-value');
    parameter('/notifications/KAFKA_PASSWORD', 'kafka-password-value');
    const result = runWith(
      { FAKE_SECRET_NAME: 'KAFKA_PASSWORD_NOTIFICATIONS_API' },
      ...['--target', 'platform', '--repo', 'platform', '--dir', 'stack'],
      ...['--action', 'deploy', '--commit', shared, '--images', '']
    );
    expect(result.code).toBe(0);
    expect(result.last).toBe(
      `platform-deploy: result=deployed target=platform commit=${shared} previous=none`
    );
    const seen = readFileSync(join(work, 'fake', 'secrets-seen'), 'utf8');
    expect(seen).toContain('config-render kafka-password-value');
    const asked = readFileSync(join(work, 'fake', 'aws-calls'), 'utf8');
    expect(asked).toContain('/notifications/KAFKA_PASSWORD');
    expect(asked).not.toContain('/platform/KAFKA_PASSWORD_NOTIFICATIONS_API');
    expect(`${result.stdout}${result.stderr}`).not.toContain('kafka-password-value');
  });

  it("refuses a product that names another product's password, before anything changes", () => {
    const first = commit('playground', '.', [
      'PLAYGROUND_API_KEYS',
      'BORROWED=/notifications/KAFKA_PASSWORD',
    ]);
    product(first);
    const result = deploy(first);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=bad-input target=playground commit=${first}`
    );
    expect(result.stdout).toContain('only the shared services may name');
    expect(acts()).toEqual([]);
  });

  it("refuses the shared services a value that is not a product's Kafka password", () => {
    repo('platform');
    const shared = commit('platform', 'stack', ['GITHUB_KEY=/github-app/private-key']);
    configure(shared, {
      name: 'platform',
      services: { traefik: { image: `traefik:v3.7.19@${digest('e')}` } },
    });
    const result = run(
      ...['--target', 'platform', '--repo', 'platform', '--dir', 'stack'],
      ...['--action', 'deploy', '--commit', shared, '--images', '']
    );
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=bad-input target=platform commit=${shared}`
    );
    expect(acts()).toEqual([]);
  });

  it('names a missing borrowed password by the name it has in the shared services', () => {
    repo('platform');
    const shared = commit('platform', 'stack', [
      'KAFKA_PASSWORD_NOTIFICATIONS_API=/notifications/KAFKA_PASSWORD',
    ]);
    configure(shared, {
      name: 'platform',
      services: { traefik: { image: `traefik:v3.7.19@${digest('e')}` } },
    });
    const result = run(
      ...['--target', 'platform', '--repo', 'platform', '--dir', 'stack'],
      ...['--action', 'deploy', '--commit', shared, '--images', '']
    );
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=missing-secrets target=platform commit=${shared}`
    );
    expect(result.stdout).toContain(
      'These secrets are missing in Parameter Store: KAFKA_PASSWORD_NOTIFICATIONS_API'
    );
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
      `platform-deploy: result=refused reason=unverified-image target=playground commit=${first}`
    );
    expect(missing.stdout).toContain(
      `playground-web runs ghcr.io/zigordev/playground-web:${first}, and no verified digest of ghcr.io/zigordev/playground-web:${first} came with the command`
    );
    product(first, { postgres: 'postgres:18.7-alpine3.24' });
    const loose = deploy(first);
    expect(loose.code).toBe(2);
    expect(loose.last).toBe(
      `platform-deploy: result=refused reason=unpinned-image target=playground commit=${first}`
    );
    expect(loose.stdout).toContain(
      'playground-postgres runs postgres:18.7-alpine3.24, which is not pinned by its digest'
    );
    expect(acts()).toEqual([]);
  });

  it('stops when the job fails, and puts the previous version back without rolling anything', () => {
    const first = release();
    deploy(first);
    const second = release();
    fail('job-playground-api-migrate');
    forget();
    const result = deploy(second);
    expect(result.code).toBe(1);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=job target=playground commit=${second} restored=${first}`
    );
    expect(result.stdout).toContain('the migration failed');
    const after = acts();
    expect(after.some((call) => call.startsWith('rollout:'))).toBe(false);
    expect(after.at(-1)).toBe(
      `compose:playground@${first} up --detach --no-deps --wait --wait-timeout 180 playground-postgres`
    );
    expect(record()).toMatchObject({ commit: first });
  });

  it('rolls back only what switched when a later service fails its health gate, with a short output', () => {
    const first = release();
    deploy(first);
    const second = release();
    fail('rollout-playground-web');
    forget();
    const result = deploy(second);
    expect(result.code).toBe(1);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=health target=playground commit=${second} restored=${first}`
    );
    expect(acts().filter((call) => call.startsWith('rollout:'))).toEqual([
      `rollout:playground@${second} --timeout 180 playground-api`,
      `rollout:playground@${second} --timeout 180 playground-web`,
      `rollout:playground@${first} --timeout 180 playground-api`,
    ]);
    expect(result.lines.length).toBeLessThan(80);
    expect(result.stdout).toContain('log line 499 of the new container');
    expect(result.stdout).not.toContain('log line 100 of');
    expect(record()).toMatchObject({ commit: first });
  });

  it('removes what a failed first deploy started', () => {
    const first = release();
    fail('up-playground-web');
    const result = deploy(first);
    expect(result.code).toBe(1);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=health target=playground commit=${first} restored=none`
    );
    expect(acts().filter((call) => call.includes(' rm '))).toEqual([
      `compose:playground@${first} rm --stop --force playground-api`,
      `compose:playground@${first} rm --stop --force playground-web`,
    ]);
    expect(existsSync(recordFile())).toBe(false);
  });

  it('removes a service that the compose files no longer hold', () => {
    const first = release();
    deploy(first);
    const second = commit('playground', '.', ['PLAYGROUND_API_KEYS', 'POSTGRES_PASSWORD']);
    product(second, { web: false });
    forget();
    const result = deploy(second);
    expect(result.code).toBe(0);
    const old = `id-playground-web-${first.slice(0, 7)}`;
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
      `platform-deploy: result=rolled-back target=playground commit=${first} from=${second}`
    );
    const after = acts();
    expect(after.filter((call) => call.startsWith('rollout:'))).toEqual([
      `rollout:playground@${first} --timeout 180 playground-api`,
      `rollout:playground@${first} --timeout 180 playground-web`,
    ]);
    expect(after.some((call) => call.includes('--exit-code-from'))).toBe(false);
    expect(record()).toMatchObject({ commit: first, images: ours, previous: null });
  });

  it('refuses a rollback of a version that does not run, or that has nothing before it', () => {
    const first = release();
    deploy(first);
    const other = release();
    expect(rollback(other).last).toBe(
      `platform-deploy: result=refused reason=not-current target=playground commit=${other}`
    );
    const none = rollback(first);
    expect(none.code).toBe(2);
    expect(none.last).toBe(
      `platform-deploy: result=refused reason=no-previous target=playground commit=${first}`
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
      '/platform/deploy/playground',
      JSON.stringify({ commit: first, images: ours, repo: 'playground', dir: '.', previous: null })
    );
    parameter(
      '/platform/deploy/platform',
      JSON.stringify({ commit: shared, images: '', repo: 'platform', dir: 'stack', previous: null })
    );
    const result = run('--redeploy-recorded');
    expect(result.code).toBe(0);
    expect(results(result.lines)).toEqual([
      `platform-deploy: result=redeployed target=platform commit=${shared}`,
      `platform-deploy: result=redeployed target=playground commit=${first}`,
    ]);
    expect(acts()).toContain(
      `compose:platform@${shared} up --detach --no-deps --wait --wait-timeout 180 docker-proxy traefik`
    );
    const again = run('--redeploy-recorded');
    expect(again.code).toBe(0);
    expect(results(again.lines)).toEqual([
      `platform-deploy: result=skipped reason=present target=platform commit=${shared}`,
      `platform-deploy: result=skipped reason=present target=playground commit=${first}`,
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
    const result = run('--target', 'playground', '--repo', 'playground', '--dir', '.', ...args);
    expect(result.code).toBe(2);
    expect(result.last).toMatch(
      /^platform-deploy: result=refused reason=bad-input target=playground /
    );
    expect(calls()).toEqual([]);
    expect(existsSync(join(work, 'fake', 'aws-calls'))).toBe(false);
  });

  it.each([
    [
      'a folder outside the repo',
      ['--target', 'playground', '--repo', 'playground', '--dir', '../etc'],
    ],
    [
      'a target that is not a name',
      ['--target', 'Play Ground', '--repo', 'playground', '--dir', '.'],
    ],
    ['an unknown argument', ['--force']],
  ])('refuses %s', (_, args) => {
    const result = run(...args, '--action', 'deploy', '--commit', unknown);
    expect(result.code).toBe(2);
    expect(result.last).toMatch(/^platform-deploy: result=refused reason=bad-input /);
    expect(calls()).toEqual([]);
  });

  it('reads the record with a listing, which answers alike whether or not a record exists', () => {
    const first = release();
    deploy(first);
    const awsCalls = readFileSync(join(work, 'fake', 'aws-calls'), 'utf8');
    expect(awsCalls).toContain('ssm get-parameters-by-path --path /platform/deploy');
    expect(awsCalls).not.toMatch(/ssm get-parameter /);
  });

  it("waits for the host's first-boot setup, and refuses when it does not finish in time", () => {
    const first = release();
    rmSync(join(work, 'setup-done'));
    const result = runWith(
      { PLATFORM_DEPLOY_SETUP_WAIT: '0' },
      '--target',
      'playground',
      '--repo',
      'playground',
      '--dir',
      '.',
      '--action',
      'deploy',
      '--commit',
      first,
      '--images',
      ours
    );
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=busy target=playground commit=${first}`
    );
    expect(result.stdout).toContain("The host's first-boot setup did not finish within 0 seconds");
    expect(existsSync(join(work, 'fake', 'aws-calls'))).toBe(false);
  });

  it("reads the group of Docker's socket only once a new host's setup is done", async () => {
    const first = release();
    rmSync(join(work, 'setup-done'));
    writeFileSync(join(work, 'fake', 'no-socket'), '');
    const later = runLater(
      '--target',
      'playground',
      '--repo',
      'playground',
      '--dir',
      '.',
      '--action',
      'deploy',
      '--commit',
      first,
      '--images',
      ours
    );
    setTimeout(() => {
      rmSync(join(work, 'fake', 'no-socket'));
      writeFileSync(join(work, 'setup-done'), '2026-11-24T14:12:00Z\n');
    }, 1000);
    const result = await later;
    expect(result.last).toBe(
      `platform-deploy: result=deployed target=playground commit=${first} previous=none`
    );
    expect(result.stdout).toContain("Waiting for the host's first-boot setup to finish");
    const configs = calls().filter((call) =>
      /^docker compose .* config( |$)/.test(call.split(' | ')[0] ?? '')
    );
    expect(configs.length).toBeGreaterThan(0);
    for (const call of configs) {
      expect(call).toMatch(/ GROUP=988$/);
    }
  });

  it("refuses rather than guess a group when Docker's socket is missing after the setup", () => {
    const first = release();
    writeFileSync(join(work, 'fake', 'no-socket'), '');
    const result = deploy(first);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=busy target=playground commit=${first}`
    );
    expect(result.stdout).toContain("Docker's socket");
    expect(calls()).toEqual([]);
  });

  it('refuses while another deploy of the same target holds the lock', () => {
    const first = release();
    fail('flock');
    const result = deploy(first);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=busy target=playground commit=${first}`
    );
  });

  it('refuses when GitHub or Parameter Store does not answer', () => {
    const first = release();
    rmSync(join(work, 'remote', 'playground.git'), { recursive: true });
    const github = deploy(first);
    expect(github.code).toBe(2);
    expect(github.last).toBe(
      `platform-deploy: result=refused reason=unreachable target=playground commit=${first}`
    );
    fail('aws');
    const store = deploy(first);
    expect(store.code).toBe(2);
    expect(store.last).toBe(
      `platform-deploy: result=refused reason=unreachable target=playground commit=${first}`
    );
  });

  it('refuses when Parameter Store answers nothing, instead of deploying with empty secrets', () => {
    const first = release();
    fail('silent-aws');
    const result = deploy(first);
    expect(result.code).toBe(2);
    expect(result.last).toBe(
      `platform-deploy: result=refused reason=unreachable target=playground commit=${first}`
    );
    expect(acts()).toEqual([]);
  });

  it('still ends with a result when something unexpected stops it', () => {
    const first = release();
    parameter('/platform/deploy/playground', 'not json');
    const result = deploy(first);
    expect(result.code).not.toBe(0);
    expect(result.last).toBe(
      `platform-deploy: result=failed reason=unexpected target=playground commit=${first}`
    );
  });
});
