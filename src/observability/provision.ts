import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dump } from 'js-yaml';
import type { App } from '../registry.ts';
import { type AlertGroup, alertingProvisioning, appAlerts, platformAlerts } from './alerts.ts';
import { type AppObservability, appDashboard, platformDashboard } from './dashboards.ts';

export const observabilityFile = 'observability.ts';

export const dashboardsProvider = `apiVersion: 1

providers:
  - name: zigordev
    folder: zigordev
    type: file
    disableDeletion: false
    allowUiUpdates: false
    updateIntervalSeconds: 10
    options:
      path: /etc/zigordev/dashboards
`;

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function readAppObservability(
  appsDir: string,
  app: Pick<App, 'name'>
): Promise<AppObservability> {
  const file = resolve(appsDir, app.name, observabilityFile);
  if (!(await exists(file))) {
    return {};
  }
  const module = (await import(pathToFileURL(file).href)) as { observability?: AppObservability };
  return module.observability ?? {};
}

export async function provisionDashboards(
  appsDir: string,
  localDir: string,
  apps: readonly Pick<App, 'name'>[]
): Promise<{ dashboards: string[] }> {
  const dashboardsDir = join(localDir, 'grafana', 'dashboards');
  const providerDir = join(localDir, 'grafana', 'provisioning', 'dashboards');
  await mkdir(dashboardsDir, { recursive: true });
  await mkdir(providerDir, { recursive: true });
  const built = [
    platformDashboard(apps.map((app) => app.name)),
    ...(await Promise.all(
      apps.map(async (app) => appDashboard(app.name, await readAppObservability(appsDir, app)))
    )),
  ];
  const files = new Set(built.map((board) => `${board.uid}.json`));
  for (const stale of (await readdir(dashboardsDir)).filter((file) => !files.has(file))) {
    await rm(join(dashboardsDir, stale), { force: true });
  }
  for (const board of built) {
    await writeFile(
      join(dashboardsDir, `${board.uid}.json`),
      `${JSON.stringify(board, null, 2)}\n`
    );
  }
  await writeFile(join(providerDir, 'zigordev.yaml'), dashboardsProvider);
  return { dashboards: built.map((board) => String(board.uid)) };
}

export async function provisionAlerting(
  appsDir: string,
  localDir: string,
  apps: readonly Pick<App, 'name'>[],
  grafanaUrl: string
): Promise<{ file: string; alerts: string[] }> {
  const alertingDir = join(localDir, 'grafana', 'provisioning', 'alerting');
  await mkdir(alertingDir, { recursive: true });
  const groups: AlertGroup[] = [
    { name: 'platform', alerts: platformAlerts },
    ...(await Promise.all(
      apps.map(async (app) => ({
        name: app.name,
        alerts: [
          ...appAlerts(app.name),
          ...((await readAppObservability(appsDir, app)).alerts ?? []),
        ],
      }))
    )),
  ];
  const file = join(alertingDir, 'zigordev.yaml');
  const document: unknown = JSON.parse(JSON.stringify(alertingProvisioning(groups, grafanaUrl)));
  await writeFile(file, dump(document, { lineWidth: -1, noRefs: true }));
  return { file, alerts: groups.flatMap((group) => group.alerts.map((alert) => alert.name)) };
}
