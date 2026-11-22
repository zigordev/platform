import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { alerts } from './alerts.ts';
import { appDashboard, platformDashboard } from './dashboards.ts';
import { alertManifest, dashboardManifest, folderManifest, type Manifest } from './resources.ts';

export function manifests(): Record<string, Manifest> {
  const files: Record<string, Manifest> = {
    'folder.json': folderManifest(),
    'dashboard-app.json': dashboardManifest(appDashboard()),
    'dashboard-platform.json': dashboardManifest(platformDashboard()),
  };
  for (const alert of alerts) {
    files[`alert-${alert.uid}.json`] = alertManifest(alert);
  }
  return files;
}

export function write(folder: string): string[] {
  mkdirSync(folder, { recursive: true });
  for (const old of readdirSync(folder)) {
    if (old.endsWith('.json')) {
      rmSync(join(folder, old));
    }
  }
  const files = manifests();
  for (const [file, manifest] of Object.entries(files)) {
    writeFileSync(join(folder, file), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return Object.keys(files);
}

export interface Output {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export function run(args: readonly string[], output: Output): number {
  const [folder, ...rest] = args;
  if (folder === undefined || rest.length > 0) {
    output.err('Usage: node src/main.ts <folder>\n');
    return 2;
  }
  const files = write(resolve(folder));
  output.out(`observability: wrote ${files.length} files to ${folder}\n`);
  return 0;
}
