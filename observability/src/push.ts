import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
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
    const listing = gcx(['resources', 'get', kind, '-o', 'json']);
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
      { encoding: 'utf8' }
    );
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  };
}

export function run(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  output: Output,
  gcxFor: (folder: string) => Gcx
): number {
  const [folder, ...rest] = args;
  if (folder === undefined || rest.length > 0) {
    output.err('Usage: node src/push-main.ts <folder>\n');
    return 2;
  }
  const missing = ['GRAFANA_SERVER', 'GRAFANA_TOKEN'].filter((name) => !env[name]);
  if (missing.length > 0) {
    output.err(`push: ${missing.join(' and ')} must be set\n`);
    return 2;
  }
  return push(folder, gcxFor(folder), output);
}
