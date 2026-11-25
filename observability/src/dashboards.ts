import * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import { linesOverTime, logLines, name, number, overTime, type Panel } from './panels.ts';
import { prometheusUid } from './resources.ts';

export interface Row {
  readonly title: string;
  readonly panels: readonly Panel[];
}

export const tag = 'zigordev';

export const appPanels = {
  reporting: 1,
  version: 2,
  requests: 3,
  failing: 4,
  slowest: 5,
  byRoute: 6,
  byStatus: 7,
  times: 8,
  timesByRoute: 9,
  linesByLevel: 10,
  events: 11,
  problems: 12,
  waiting: 13,
  setAside: 14,
} as const;

export const platformPanels = {
  cpu: 1,
  memory: 2,
  disk: 3,
  agent: 4,
  machineOverTime: 5,
  diskOverTime: 6,
  ingressRequests: 7,
  ingressFailing: 8,
  ingressSlowest: 9,
  reporting: 10,
  linesByService: 11,
  dumpAge: 12,
  restoreTestAge: 13,
  brokerAnswers: 14,
} as const;

export const newestDumpAge =
  'time() - max by (compose_project) (platform_backup_last_success_timestamp_seconds)';
export const lastRestoreTestAge =
  'time() - max by (compose_project) (platform_restore_test_last_success_timestamp_seconds)';
export const brokerAnswers = 'max(probe_success{job="kafka"})';

const one = 'service_name="$app"';
const requests = `http_server_request_duration_seconds_count{${one}`;
const buckets = `http_server_request_duration_seconds_bucket{${one}}`;

function quantile(share: number, by = 'le'): string {
  return `histogram_quantile(${share}, sum by (${by}) (rate(${buckets}[$__rate_interval])))`;
}

export function appRows(): Row[] {
  return [
    {
      title: 'Now',
      panels: [
        number(
          appPanels.reporting,
          'Copies reporting',
          'short',
          `count(target_info{${one}}) or vector(0)`
        ),
        name(
          appPanels.version,
          'Version',
          `max by (service_version) (target_info{${one}})`,
          '{{service_version}}'
        ),
        number(
          appPanels.requests,
          'Requests per second',
          'reqps',
          `sum(rate(${requests}}[5m])) or vector(0)`
        ),
        number(
          appPanels.failing,
          'Share of requests that fail',
          'percentunit',
          `(sum(rate(${requests}, http_response_status_code=~"5.."}[5m])) or vector(0)) / (sum(rate(${requests}}[5m])) > 0)`
        ),
        number(
          appPanels.slowest,
          'Response time of the slowest 5%',
          's',
          `histogram_quantile(0.95, sum by (le) (rate(${buckets}[5m])))`
        ),
      ],
    },
    {
      title: 'Requests',
      panels: [
        overTime(appPanels.byRoute, 'Requests by route', 'reqps', [
          {
            expr: `sum by (http_route) (rate(${requests}}[$__rate_interval]))`,
            legend: '{{http_route}}',
          },
        ]),
        overTime(appPanels.byStatus, 'Responses by status', 'reqps', [
          {
            expr: `sum by (http_response_status_code) (rate(${requests}}[$__rate_interval]))`,
            legend: '{{http_response_status_code}}',
          },
        ]),
      ],
    },
    {
      title: 'Response times',
      panels: [
        overTime(appPanels.times, 'Response time', 's', [
          { expr: quantile(0.5), legend: 'half of the requests' },
          { expr: quantile(0.95), legend: 'the slowest 5%' },
          { expr: quantile(0.99), legend: 'the slowest 1%' },
        ]),
        overTime(appPanels.timesByRoute, 'Response time of the slowest 5%, by route', 's', [
          { expr: quantile(0.95, 'le, http_route'), legend: '{{http_route}}' },
        ]),
      ],
    },
    {
      title: 'Logs and events',
      panels: [
        linesOverTime(appPanels.linesByLevel, 'Log lines by level', [
          {
            expr: `sum by (level) (count_over_time({${one}} | json | level != "" [$__auto]))`,
            legend: '{{level}}',
          },
        ]),
        linesOverTime(appPanels.events, 'Events', [
          {
            expr: `sum by (event) (count_over_time({${one}} | json | event != "" [$__auto]))`,
            legend: '{{event}}',
          },
        ]),
        logLines(
          appPanels.problems,
          'Errors and warnings',
          `{${one}} | json | level=~"error|warn"`
        ),
      ],
    },
    {
      title: 'Messages',
      panels: [
        overTime(appPanels.waiting, 'Messages waiting, by topic', 'short', [
          {
            expr: `max by (messaging_destination_name, messaging_consumer_group_name) (zigordev_events_consumer_lag{${one}})`,
            legend: '{{messaging_destination_name}}',
          },
        ]),
        overTime(appPanels.setAside, 'Messages set aside, by topic', 'short', [
          {
            expr: `sum by (messaging_destination_name, zigordev_events_reason) (increase(zigordev_events_dead_letters_total{${one}}[$__rate_interval]))`,
            legend: '{{messaging_destination_name}}, {{zigordev_events_reason}}',
          },
        ]),
      ],
    },
  ];
}

const disk = (what: string): string => `max by (device) (node_filesystem_${what}_bytes)`;
const cpuInUse = '1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))';
const memoryInUse = '1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)';
const diskInUse = `1 - ${disk('avail')} / ${disk('size')}`;
const ingress = 'traefik_service_requests_total';

export function platformRows(): Row[] {
  return [
    {
      title: 'The machine',
      panels: [
        number(platformPanels.cpu, 'Processor in use', 'percentunit', cpuInUse),
        number(platformPanels.memory, 'Memory in use', 'percentunit', memoryInUse),
        number(platformPanels.disk, 'Fullest disk', 'percentunit', `max(${diskInUse})`),
        number(
          platformPanels.agent,
          'Telemetry agents reporting',
          'short',
          'count(alloy_build_info) or vector(0)'
        ),
        overTime(platformPanels.machineOverTime, 'Processor and memory in use', 'percentunit', [
          { expr: cpuInUse, legend: 'processor' },
          { expr: memoryInUse, legend: 'memory' },
        ]),
        overTime(platformPanels.diskOverTime, 'Disk in use', 'percentunit', [
          { expr: diskInUse, legend: '{{device}}' },
        ]),
      ],
    },
    {
      title: 'The ingress',
      panels: [
        overTime(platformPanels.ingressRequests, 'Requests by destination', 'reqps', [
          {
            expr: `sum by (service) (rate(${ingress}[$__rate_interval]))`,
            legend: '{{service}}',
          },
        ]),
        overTime(
          platformPanels.ingressFailing,
          'Share of requests that fail, by destination',
          'percentunit',
          [
            {
              expr: `sum by (service) (rate(${ingress}{code=~"5.."}[$__rate_interval])) / sum by (service) (rate(${ingress}[$__rate_interval]))`,
              legend: '{{service}}',
            },
          ]
        ),
        overTime(
          platformPanels.ingressSlowest,
          'Response time of the slowest 5%, by destination',
          's',
          [
            {
              expr: 'histogram_quantile(0.95, sum by (service, le) (rate(traefik_service_request_duration_seconds_bucket[$__rate_interval])))',
              legend: '{{service}}',
            },
          ]
        ),
      ],
    },
    {
      title: 'Telemetry',
      panels: [
        overTime(platformPanels.reporting, 'Who is reporting', 'short', [
          { expr: 'count by (service_name) (target_info)', legend: '{{service_name}}' },
        ]),
        linesOverTime(platformPanels.linesByService, 'Log lines by service', [
          {
            expr: 'sum by (service_name) (count_over_time({service_name=~".+"}[$__auto]))',
            legend: '{{service_name}}',
          },
        ]),
      ],
    },
    {
      title: 'Backups',
      panels: [
        overTime(platformPanels.dumpAge, 'Age of the newest dump, by product', 's', [
          { expr: newestDumpAge, legend: '{{compose_project}}' },
        ]),
        overTime(
          platformPanels.restoreTestAge,
          'Age of the last good restore test, by product',
          's',
          [{ expr: lastRestoreTestAge, legend: '{{compose_project}}' }]
        ),
      ],
    },
    {
      title: 'Kafka',
      panels: [
        overTime(platformPanels.brokerAnswers, 'The broker answers on its port', 'short', [
          { expr: brokerAnswers, legend: 'kafka' },
        ]),
      ],
    },
  ];
}

function build(uid: string, title: string, rows: readonly Row[]): dashboard.DashboardBuilder {
  const builder = new dashboard.DashboardBuilder(title)
    .uid(uid)
    .tags([tag])
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
  return builder;
}

export function appDashboard(): dashboard.Dashboard {
  return build('app', 'App', appRows())
    .withVariable(
      new dashboard.QueryVariableBuilder('app')
        .label('App')
        .datasource({ type: 'prometheus', uid: prometheusUid })
        .query('label_values(http_server_request_duration_seconds_count, service_name)')
        .refresh(dashboard.VariableRefresh.OnTimeRangeChanged)
        .sort(dashboard.VariableSort.AlphabeticalAsc)
    )
    .build();
}

export function platformDashboard(): dashboard.Dashboard {
  return build('platform', 'Platform', platformRows()).build();
}
