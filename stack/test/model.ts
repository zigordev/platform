import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface Mount {
  readonly type: string;
  readonly source?: string;
  readonly target: string;
  readonly read_only?: boolean;
}

export interface Port {
  readonly host_ip?: string;
  readonly published?: string;
  readonly target: number;
}

export interface Service {
  readonly image: string;
  readonly user?: string;
  readonly init?: boolean;
  readonly read_only?: boolean;
  readonly cap_drop?: readonly string[];
  readonly security_opt?: readonly string[];
  readonly stop_grace_period?: string;
  readonly mem_limit?: string;
  readonly cpus?: number;
  readonly container_name?: string;
  readonly command?: readonly string[] | null;
  readonly environment?: Readonly<Record<string, string>>;
  readonly labels?: Readonly<Record<string, string>>;
  readonly ports?: readonly Port[];
  readonly volumes?: readonly Mount[];
  readonly networks?: Readonly<Record<string, unknown>>;
  readonly healthcheck?: { readonly test?: readonly string[] };
  readonly restart?: string;
  readonly depends_on?: Readonly<Record<string, { readonly condition?: string }>>;
  readonly profiles?: readonly string[];
  readonly tmpfs?: readonly string[];
}

export interface Model {
  readonly name: string;
  readonly services: Readonly<Record<string, Service>>;
  readonly networks: Readonly<
    Record<string, { readonly name: string; readonly internal?: boolean }>
  >;
}

const folder = fileURLToPath(new URL('../', import.meta.url));

export function model(files: readonly string[], profile?: string): Model {
  const output = execFileSync(
    'docker',
    [
      'compose',
      ...files.flatMap((file) => ['--file', file]),
      ...(profile === undefined ? [] : ['--profile', profile]),
      'config',
      '--format',
      'json',
    ],
    { cwd: folder, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return JSON.parse(output) as Model;
}
