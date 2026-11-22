import type * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import * as resource from '@grafana/grafana-foundation-sdk/resource';

export type Manifest = resource.Manifest;

export const folderUid = 'zigordev';
export const prometheusUid = 'prometheus';
export const lokiUid = 'loki';
export const runbooks = 'https://github.com/zigordev/platform/blob/main/docs/runbooks';

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function inFolder(name: string): resource.MetadataBuilder {
  return resource.named(name).annotations({ 'grafana.app/folder': folderUid });
}

export function folderManifest(): Manifest {
  return new resource.ManifestBuilder()
    .apiVersion('folder.grafana.app/v1')
    .kind('Folder')
    .metadata(resource.named(folderUid))
    .spec({ title: 'zigordev' })
    .build();
}

export function dashboardManifest(model: dashboard.Dashboard): Manifest {
  if (model.uid === undefined) {
    throw new Error(`the dashboard "${model.title}" has no uid`);
  }
  return new resource.ManifestBuilder()
    .apiVersion('dashboard.grafana.app/v1')
    .kind('Dashboard')
    .metadata(inFolder(model.uid))
    .spec(plain(model))
    .build();
}

export interface Alert {
  readonly uid: string;
  readonly title: string;
  readonly summary: string;
  readonly expr: string;
  readonly lookBack: string;
  readonly for: string;
  readonly reaches: 'phone' | 'email';
  readonly runbook: string;
  readonly dashboard: string;
  readonly panel: number;
}

export function alertManifest(alert: Alert): Manifest {
  return new resource.ManifestBuilder()
    .apiVersion('rules.alerting.grafana.app/v1beta1')
    .kind('AlertRule')
    .metadata(inFolder(alert.uid))
    .spec({
      title: alert.title,
      trigger: { interval: '1m' },
      for: alert.for,
      noDataState: 'Ok',
      execErrState: 'Error',
      labels: { severity: alert.reaches },
      annotations: {
        summary: alert.summary,
        runbook_url: `${runbooks}/${alert.runbook}`,
        __dashboardUid__: alert.dashboard,
        __panelId__: String(alert.panel),
      },
      expressions: {
        A: {
          datasourceUID: prometheusUid,
          relativeTimeRange: { from: alert.lookBack, to: '0s' },
          model: { refId: 'A', expr: alert.expr, instant: true },
        },
        B: {
          source: true,
          model: {
            refId: 'B',
            type: 'threshold',
            expression: 'A',
            conditions: [{ evaluator: { type: 'gt', params: [0] } }],
          },
        },
      },
    })
    .build();
}
