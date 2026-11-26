import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { alerts, cloudAlerts } from './alerts.ts';
import { appDashboard, platformDashboard, usageDashboard } from './dashboards.ts';
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

export function cloudManifests(): Record<string, Manifest> {
  const files: Record<string, Manifest> = {
    'dashboard-usage.json': dashboardManifest(usageDashboard()),
  };
  for (const alert of cloudAlerts) {
    files[`alert-${alert.uid}.json`] = alertManifest(alert);
  }
  return files;
}

export function write(folder: string, files: Record<string, Manifest> = manifests()): string[] {
  mkdirSync(folder, { recursive: true });
  for (const old of readdirSync(folder)) {
    if (old.endsWith('.json')) {
      rmSync(join(folder, old));
    }
  }
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
  const [folder, cloudFolder, ...rest] = args;
  if (folder === undefined || cloudFolder === undefined || rest.length > 0) {
    output.err('Usage: node src/main.ts <folder> <cloud-folder>\n');
    return 2;
  }
  const files = write(resolve(folder));
  const cloudFiles = write(resolve(cloudFolder), cloudManifests());
  output.out(
    `observability: wrote ${files.length} files to ${folder}, and ${cloudFiles.length} for Grafana Cloud only to ${cloudFolder}\n`
  );
  return 0;
}
