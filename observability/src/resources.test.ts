import * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import { describe, expect, it } from 'vitest';
import { alerts, cloudAlerts } from './alerts.ts';
import { appDashboard } from './dashboards.ts';
import { alertManifest, dashboardManifest, folderManifest } from './resources.ts';

interface RuleSpec {
  readonly title: string;
  readonly for: string;
  readonly noDataState: string;
  readonly execErrState: string;
  readonly trigger: { readonly interval: string };
  readonly labels: Record<string, string>;
  readonly annotations: Record<string, string>;
  readonly expressions: Record<
    string,
    { readonly source?: boolean; readonly datasourceUID?: string; readonly model: unknown }
  >;
}

describe('the folder', () => {
  it('is one folder in Grafana, which holds everything the platform pushes', () => {
    expect(folderManifest()).toEqual({
      apiVersion: 'folder.grafana.app/v1',
      kind: 'Folder',
      metadata: { name: 'zigordev' },
      spec: { title: 'zigordev' },
    });
  });
});

describe('the file of a dashboard', () => {
  const manifest = dashboardManifest(appDashboard());

  it('is a resource that gcx can push, named by the dashboard and placed in the folder', () => {
    expect(manifest.apiVersion).toBe('dashboard.grafana.app/v1');
    expect(manifest.kind).toBe('Dashboard');
    expect(manifest.metadata).toEqual({
      name: 'app',
      annotations: { 'grafana.app/folder': 'zigordev' },
    });
  });

  it('holds plain data only, so it reads the same after it was written to a file', () => {
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
    expect((manifest.spec as { title: string }).title).toBe('App');
  });

  it('refuses a dashboard without a fixed name', () => {
    const nameless = new dashboard.DashboardBuilder('Nameless').build();
    expect(() => dashboardManifest(nameless)).toThrow('the dashboard "Nameless" has no uid');
  });
});

describe.each(alerts)('the file of the alert $uid', (alert) => {
  const manifest = alertManifest(alert);
  const spec = manifest.spec as RuleSpec;

  it('is a rule that gcx can push, named by the alert and placed in the folder', () => {
    expect(manifest.apiVersion).toBe('rules.alerting.grafana.app/v1beta1');
    expect(manifest.kind).toBe('AlertRule');
    expect(manifest.metadata).toEqual({
      name: alert.uid,
      annotations: { 'grafana.app/folder': 'zigordev' },
    });
  });

  it('carries no group, which Grafana refuses on a rule it has not seen', () => {
    expect(manifest.metadata.labels).toBeUndefined();
  });

  it('is checked every minute, and stays quiet while there is nothing to say', () => {
    expect(spec.trigger).toEqual({ interval: '1m' });
    expect(spec.noDataState).toBe('Ok');
    expect(spec.execErrState).toBe('Error');
    expect(spec.for).toBe(alert.for);
  });

  it('asks the metrics one question, and fires while that question has an answer', () => {
    expect(Object.keys(spec.expressions)).toEqual(['A', 'B']);
    expect(spec.expressions.A).toEqual({
      datasourceUID: 'prometheus',
      relativeTimeRange: { from: '10m', to: '0s' },
      model: { refId: 'A', expr: alert.expr, instant: true },
    });
    expect(spec.expressions.B).toEqual({
      source: true,
      model: {
        refId: 'B',
        type: 'threshold',
        expression: 'A',
        conditions: [{ evaluator: { type: 'gt', params: [0] } }],
      },
    });
  });

  it('says whom it reaches, links its runbook, and opens its panel', () => {
    expect(spec.labels).toEqual({ severity: alert.reaches });
    expect(spec.annotations).toEqual({
      summary: alert.summary,
      runbook_url: `https://github.com/zigordev/platform/blob/main/docs/runbooks/${alert.uid}.md`,
      __dashboardUid__: alert.dashboard,
      __panelId__: String(alert.panel),
    });
  });
});

describe.each(cloudAlerts)('the file of the alert $uid, which only Grafana Cloud gets', (alert) => {
  it("asks the data source the alert names: Grafana Cloud's usage numbers", () => {
    const spec = alertManifest(alert).spec as RuleSpec;
    expect(spec.expressions.A?.datasourceUID).toBe('grafanacloud-usage');
    expect(spec.annotations.runbook_url).toBe(
      `https://github.com/zigordev/platform/blob/main/docs/runbooks/${alert.uid}.md`
    );
  });
});
