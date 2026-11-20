import * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import type { AlertSpec } from './alerts.ts';
import { logLines, logSeries, metricSeries, metricStat, type Panel } from './panels.ts';

export interface DashboardRow {
  readonly title: string;
  readonly panels: readonly Panel[];
}

export interface AppObservability {
  readonly rows?: readonly DashboardRow[];
  readonly alerts?: readonly AlertSpec[];
}

export const dashboardTag = 'zigordev';

function requests(app: string, filter = ''): string {
  return `http_server_request_duration_seconds_count{job="${app}"${filter}}`;
}

function latency(app: string, quantile: number, by = 'le'): string {
  return `histogram_quantile(${quantile}, sum by (${by}) (rate(http_server_request_duration_seconds_bucket{job="${app}"}[$__rate_interval])))`;
}

export function appRows(app: string): DashboardRow[] {
  const rows: DashboardRow[] = [
    {
      title: 'Overview',
      panels: [
        metricStat('Reporting', 'short', `count(target_info{job="${app}"}) or vector(0)`),
        metricStat('Requests per second', 'reqps', `sum(rate(${requests(app)}[5m])) or vector(0)`),
        metricStat(
          'Server errors',
          'percentunit',
          `(sum(rate(${requests(app, ', http_response_status_code=~"5.."')}[5m])) or vector(0)) / (sum(rate(${requests(app)}[5m])) > 0)`
        ),
        metricStat(
          'p95 latency',
          's',
          `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket{job="${app}"}[5m])))`
        ),
      ],
    },
    {
      title: 'Traffic',
      panels: [
        metricSeries('Requests by route', 'reqps', [
          {
            expr: `sum by (http_route) (rate(${requests(app)}[$__rate_interval]))`,
            legend: '{{http_route}}',
          },
        ]),
        metricSeries('Responses by status', 'reqps', [
          {
            expr: `sum by (http_response_status_code) (rate(${requests(app)}[$__rate_interval]))`,
            legend: '{{http_response_status_code}}',
          },
        ]),
      ],
    },
    {
      title: 'Latency',
      panels: [
        metricSeries('Latency', 's', [
          { expr: latency(app, 0.5), legend: 'p50' },
          { expr: latency(app, 0.95), legend: 'p95' },
          { expr: latency(app, 0.99), legend: 'p99' },
        ]),
        metricSeries('p95 latency by route', 's', [
          { expr: latency(app, 0.95, 'le, http_route'), legend: '{{http_route}}' },
        ]),
      ],
    },
    {
      title: 'Logs',
      panels: [
        logSeries('Log lines by level', [
          {
            expr: `sum by (detected_level) (count_over_time({service_name="${app}"}[$__auto]))`,
            legend: '{{detected_level}}',
          },
        ]),
        logLines('Errors and warnings', `{service_name="${app}", detected_level=~"error|warn"}`),
      ],
    },
  ];
  if (app.endsWith('-web')) {
    rows.push({
      title: 'Browser',
      panels: [
        logSeries('Browser events by kind', [
          {
            expr: `sum by (kind) (count_over_time({service_name="${app}", source="faro"} | json [$__auto]))`,
            legend: '{{kind}}',
          },
        ]),
        logLines(
          'Browser exceptions',
          `{service_name="${app}", source="faro"} | json | kind="exception"`
        ),
      ],
    });
  }
  return rows;
}

export function platformRows(apps: readonly string[]): DashboardRow[] {
  const jobs = apps.join('|');
  return [
    {
      title: 'Apps',
      panels: [
        metricSeries('Apps reporting', 'short', [
          { expr: `count by (job) (target_info{job=~"${jobs}"})`, legend: '{{job}}' },
        ]),
        metricSeries('Requests per second by app', 'reqps', [
          {
            expr: `sum by (job) (rate(http_server_request_duration_seconds_count{job=~"${jobs}"}[$__rate_interval]))`,
            legend: '{{job}}',
          },
        ]),
      ],
    },
    {
      title: 'Feature flags',
      panels: [
        metricStat(
          'flagd reporting',
          'short',
          'count(target_info{job="platform-flagd"}) or vector(0)'
        ),
        metricSeries('Evaluations by flag and variant', 'ops', [
          {
            expr: 'sum by (feature_flag_set_id, feature_flag_key, feature_flag_result_variant) (rate(feature_flag_flagd_impression_total{job="platform-flagd"}[$__rate_interval]))',
            legend: '{{feature_flag_set_id}} {{feature_flag_key}}={{feature_flag_result_variant}}',
          },
        ]),
        metricSeries('flagd requests by status', 'reqps', [
          {
            expr: 'sum by (http_response_status_code) (rate(http_server_request_duration_seconds_count{job="platform-flagd"}[$__rate_interval]))',
            legend: '{{http_response_status_code}}',
          },
        ]),
      ],
    },
    {
      title: 'Browsers',
      panels: [
        logSeries('Browser events by app', [
          {
            expr: 'sum by (service_name) (count_over_time({source="faro"}[$__auto]))',
            legend: '{{service_name}}',
          },
        ]),
      ],
    },
  ];
}

function build(
  uid: string,
  title: string,
  tag: string,
  rows: readonly DashboardRow[]
): dashboard.Dashboard {
  const builder = new dashboard.DashboardBuilder(title)
    .uid(uid)
    .tags([dashboardTag, tag])
    .refresh('30s')
    .time({ from: 'now-1h', to: 'now' })
    .timezone('browser')
    .readonly();
  for (const row of rows) {
    builder.withRow(new dashboard.RowBuilder(row.title));
    for (const panel of row.panels) {
      builder.withPanel(panel);
    }
  }
  return builder.build();
}

export function appDashboard(app: string, extra: AppObservability = {}): dashboard.Dashboard {
  return build(`app-${app}`, app, 'app', [...appRows(app), ...(extra.rows ?? [])]);
}

export function platformDashboard(apps: readonly string[]): dashboard.Dashboard {
  return build('platform', 'platform', 'platform', platformRows(apps));
}
