import * as alerting from '@grafana/grafana-foundation-sdk/alerting';
import * as expr from '@grafana/grafana-foundation-sdk/expr';
import * as prometheus from '@grafana/grafana-foundation-sdk/prometheus';

export interface AlertSpec {
  readonly name: string;
  readonly summary: string;
  readonly expr: string;
  readonly for: string;
  readonly severity: 'page' | 'ticket';
  readonly runbook: string;
  readonly dashboard: string;
  readonly windowSeconds?: number;
}

export interface AlertGroup {
  readonly name: string;
  readonly alerts: readonly AlertSpec[];
}

export const platformRunbooks = 'https://github.com/zigordev/platform/blob/main/docs/runbooks';
export const contactPoint = 'platform-email';
export const alertAddress = 'alerts@platform.test';

export function alertUid(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .slice(0, 40);
}

function pascal(app: string): string {
  return app
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function appAlerts(app: string): AlertSpec[] {
  const requests = `http_server_request_duration_seconds_count{job="${app}"`;
  return [
    {
      name: `${pascal(app)}ErrorRatio`,
      summary: `More than 5% of ${app}'s requests have failed with a server error for 5 minutes`,
      expr: `(sum(rate(${requests}, http_response_status_code=~"5.."}[5m])) / sum(rate(${requests}}[5m]))) > 0.05`,
      for: '5m',
      severity: 'page',
      runbook: `${platformRunbooks}/app-error-ratio.md`,
      dashboard: `app-${app}`,
      windowSeconds: 600,
    },
  ];
}

export const platformAlerts: readonly AlertSpec[] = [
  {
    name: 'PlatformFlagdDown',
    summary: 'flagd has sent no telemetry for 5 minutes, so apps are reading their flag defaults',
    expr: 'absent_over_time(target_info{job="platform-flagd"}[5m])',
    for: '0m',
    severity: 'page',
    runbook: `${platformRunbooks}/flagd-down.md`,
    dashboard: 'platform',
    windowSeconds: 600,
  },
];

export function alertRule(spec: AlertSpec, grafanaUrl: string): alerting.Rule {
  return new alerting.RuleBuilder(spec.name)
    .uid(alertUid(spec.name))
    .condition('B')
    .withQuery(
      new alerting.QueryBuilder('A')
        .datasourceUid('prometheus')
        .relativeTimeRange({ from: spec.windowSeconds ?? 3600, to: 0 })
        .model(new prometheus.DataqueryBuilder().expr(spec.expr).instant().refId('A'))
    )
    .withQuery(
      new alerting.QueryBuilder('B').datasourceUid('__expr__').model(
        new expr.TypeThresholdBuilder()
          .expression('A')
          .conditions([{ evaluator: { type: 'gt', params: [0] } }])
          .refId('B')
      )
    )
    .forDuration(spec.for)
    .noDataState('OK')
    .execErrState('Error')
    .labels({ severity: spec.severity })
    .annotations({
      summary: spec.summary,
      runbook_url: spec.runbook,
      dashboard_url: `${grafanaUrl}/d/${spec.dashboard}`,
    })
    .build();
}

function fileRule(rule: alerting.Rule): Record<string, unknown> {
  return {
    uid: rule.uid,
    title: rule.title,
    condition: rule.condition,
    data: rule.data.map((query) => ({
      refId: query.refId,
      relativeTimeRange: query.relativeTimeRange ?? { from: 0, to: 0 },
      datasourceUid: query.datasourceUid,
      model: query.model,
    })),
    noDataState: rule.noDataState,
    execErrState: rule.execErrState,
    for: rule.for,
    labels: rule.labels,
    annotations: rule.annotations,
    isPaused: false,
  };
}

export function alertingProvisioning(
  groups: readonly AlertGroup[],
  grafanaUrl: string
): Record<string, unknown> {
  return {
    apiVersion: 1,
    contactPoints: [
      {
        orgId: 1,
        name: contactPoint,
        receivers: [
          {
            uid: contactPoint,
            type: 'email',
            settings: { addresses: alertAddress, singleEmail: true },
          },
        ],
      },
    ],
    policies: [
      {
        orgId: 1,
        receiver: contactPoint,
        group_by: ['grafana_folder', 'alertname'],
        group_wait: '30s',
        group_interval: '5m',
        repeat_interval: '4h',
      },
    ],
    groups: groups
      .filter((group) => group.alerts.length > 0)
      .map((group) => ({
        orgId: 1,
        name: group.name,
        folder: 'zigordev',
        interval: '1m',
        rules: group.alerts.map((spec) => fileRule(alertRule(spec, grafanaUrl))),
      })),
  };
}
