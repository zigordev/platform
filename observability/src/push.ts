import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Output } from './build.ts';
import { folderUid } from './resources.ts';

export interface Item {
  readonly kind: string;
  readonly name: string;
  readonly folder: string | undefined;
}

export interface GcxResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type Gcx = (args: readonly string[]) => GcxResult;

const managedKinds: Readonly<Record<string, string>> = {
  Dashboard: 'dashboards',
  AlertRule: 'alertrules',
};

interface Listed {
  readonly kind?: string;
  readonly metadata?: {
    readonly name?: string;
    readonly annotations?: Readonly<Record<string, string>>;
  };
}

function toItem(listed: Listed): Item | undefined {
  const kind = listed.kind === undefined ? undefined : managedKinds[listed.kind];
  const name = listed.metadata?.name;
  if (kind === undefined || name === undefined) {
    return undefined;
  }
  return { kind, name, folder: listed.metadata?.annotations?.['grafana.app/folder'] };
}

export function localItems(folder: string): Item[] {
  return readdirSync(folder)
    .filter((file) => file.endsWith('.json'))
    .map((file) => toItem(JSON.parse(readFileSync(join(folder, file), 'utf8')) as Listed))
    .filter((item): item is Item => item !== undefined);
}

export function listed(stdout: string): Item[] {
  const parsed = JSON.parse(stdout) as { readonly items?: readonly Listed[] };
  return (parsed.items ?? [])
    .map((entry) => toItem(entry))
    .filter((item): item is Item => item !== undefined);
}

export function stale(local: readonly Item[], remote: readonly Item[]): Item[] {
  const kept = new Set(local.map((item) => `${item.kind}/${item.name}`));
  return remote.filter(
    (item) => item.folder === folderUid && !kept.has(`${item.kind}/${item.name}`)
  );
}

export function push(folder: string, gcx: Gcx, output: Output): number {
  const local = localItems(folder);
  const pushed = gcx(['resources', 'push', '--path', '/resources', '--on-error', 'abort']);
  if (pushed.code !== 0) {
    output.err(`push: gcx could not push the files\n${pushed.stderr}`);
    return pushed.code;
  }
  output.out(
    `push: pushed ${readdirSync(folder).filter((file) => file.endsWith('.json')).length} files\n`
  );

  for (const kind of Object.values(managedKinds)) {
    const listing = gcx(['resources', 'get', kind, '--limit', '0', '-o', 'json']);
    if (listing.code !== 0) {
      output.err(`push: gcx could not list the ${kind}\n${listing.stderr}`);
      return listing.code;
    }
    for (const item of stale(local, listed(listing.stdout))) {
      const deleted = gcx(['resources', 'delete', `${item.kind}/${item.name}`]);
      if (deleted.code !== 0) {
        output.err(`push: gcx could not delete ${item.kind}/${item.name}\n${deleted.stderr}`);
        return deleted.code;
      }
      output.out(`push: deleted ${item.kind}/${item.name}, which the files no longer hold\n`);
    }
  }
  return 0;
}

export function gcxImage(compose: string): string {
  const image = /^\s+image: (grafana\/gcx:\S+)$/m.exec(compose)?.[1];
  if (image === undefined) {
    throw new Error('the laptop stack names no gcx image');
  }
  return image;
}

const largestAnswer = 64 * 1024 * 1024;

export function dockerGcx(image: string, folder: string): Gcx {
  return (args) => {
    const result = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--env',
        'GRAFANA_SERVER',
        '--env',
        'GRAFANA_TOKEN',
        '--env',
        'GCX_TELEMETRY=disabled',
        '--env',
        'GCX_KEYCHAIN=off',
        '--tmpfs',
        '/home/nonroot/.config',
        '--volume',
        `${folder}:/resources:ro`,
        image,
        ...args,
      ],
      { encoding: 'utf8', maxBuffer: largestAnswer }
    );
    const stdout: string | undefined = result.stdout;
    const stderr: string | undefined = result.stderr;
    const failure = result.error === undefined ? '' : `${result.error.message}\n`;
    return { code: result.status ?? 1, stdout: stdout ?? '', stderr: `${stderr ?? ''}${failure}` };
  };
}

export type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<{ status: number }>;

export const wakeAttempts = 6;
const wakeTimeout = 20_000;
const wakePause = 5_000;

function pauseFor(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

export async function awake(
  server: string,
  output: Output,
  fetcher: Fetch = fetch,
  pause: (ms: number) => Promise<void> = pauseFor
): Promise<boolean> {
  for (let attempt = 1; attempt <= wakeAttempts; attempt += 1) {
    const status = await fetcher(`${server}/api/health`, {
      signal: AbortSignal.timeout(wakeTimeout),
    }).then(
      (answer) => answer.status,
      () => 0
    );
    if (status === 200) {
      return true;
    }
    output.out(
      `push: Grafana answered ${status === 0 ? 'nothing' : status} to attempt ${attempt} of ${wakeAttempts}, so the push waits for it to wake up\n`
    );
    if (attempt < wakeAttempts) {
      await pause(wakePause);
    }
  }
  output.err(
    `push: Grafana did not wake up after ${wakeAttempts} attempts, so nothing was pushed\n`
  );
  return false;
}

export const readableFolder = 0o755;
export const readableByAll = 0o644;

export function gather(folders: readonly string[], into: string): string | undefined {
  const taken = new Set<string>();
  for (const folder of folders) {
    for (const file of readdirSync(folder).filter((name) => name.endsWith('.json'))) {
      if (taken.has(file)) {
        return file;
      }
      taken.add(file);
      copyFileSync(join(folder, file), join(into, file));
      chmodSync(join(into, file), readableByAll);
    }
  }
  return undefined;
}

export async function run(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  output: Output,
  gcxFor: (folder: string) => Gcx,
  wake: (server: string) => Promise<boolean> = (server) => awake(server, output)
): Promise<number> {
  const [folder, ...more] = args;
  if (folder === undefined) {
    output.err('Usage: node src/push-main.ts <folder> [<folder>...]\n');
    return 2;
  }
  const missing = ['GRAFANA_SERVER', 'GRAFANA_TOKEN'].filter((name) => !env[name]);
  if (missing.length > 0) {
    output.err(`push: ${missing.join(' and ')} must be set\n`);
    return 2;
  }
  if (!(await wake(env.GRAFANA_SERVER ?? ''))) {
    return 1;
  }
  if (more.length === 0) {
    return push(folder, gcxFor(folder), output);
  }
  const together = mkdtempSync(join(tmpdir(), 'zigordev-push-'));
  chmodSync(together, readableFolder);
  try {
    const twice = gather(args, together);
    if (twice !== undefined) {
      output.err(`push: two folders hold ${twice}, so nothing was pushed\n`);
      return 2;
    }
    return push(together, gcxFor(together), output);
  } finally {
    rmSync(together, { recursive: true, force: true });
  }
}
