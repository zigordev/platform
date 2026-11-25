import {
  appPanels,
  brokerAnswers,
  lastRestoreTestAge,
  newestDumpAge,
  platformPanels,
} from './dashboards.ts';
import type { Alert } from './resources.ts';

const apps = 'service_name!="traefik"';
const requests = 'http_server_request_duration_seconds_count';
const buckets = 'http_server_request_duration_seconds_bucket';
const consumer = 'service_name, messaging_destination_name, messaging_consumer_group_name';

export const slowestAllowed = 1;
export const oldestDumpAllowed = 2 * 60 * 60;
export const oldestRestoreTestAllowed = 35 * 24 * 60 * 60;

export const alerts: readonly Alert[] = [
  {
    uid: 'app-answers-with-errors',
    title: 'An app answers with errors',
    summary:
      'More than 5% of the requests to {{ $labels.service_name }} have failed with a server error for 5 minutes',
    expr: `(sum by (service_name) (rate(${requests}{${apps}, http_response_status_code=~"5.."}[5m])) / sum by (service_name) (rate(${requests}{${apps}}[5m]))) > 0.05`,
    lookBack: '10m',
    for: '5m',
    reaches: 'phone',
    runbook: 'app-answers-with-errors.md',
    dashboard: 'app',
    panel: appPanels.failing,
  },
  {
    uid: 'app-is-slow',
    title: 'An app is slow',
    summary: `The slowest 5% of the requests to {{ $labels.service_name }} have taken longer than ${slowestAllowed} second for 10 minutes`,
    expr: `histogram_quantile(0.95, sum by (service_name, le) (rate(${buckets}{${apps}}[5m]))) > ${slowestAllowed}`,
    lookBack: '10m',
    for: '10m',
    reaches: 'phone',
    runbook: 'app-is-slow.md',
    dashboard: 'app',
    panel: appPanels.slowest,
  },
  {
    uid: 'host-is-filling-up',
    title: 'The host is filling up',
    summary: 'The memory of the host is more than 85% in use, or one of its disks more than 80%',
    expr: '(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) > 0.85 or (1 - max by (device) (node_filesystem_avail_bytes) / max by (device) (node_filesystem_size_bytes)) > 0.8',
    lookBack: '10m',
    for: '5m',
    reaches: 'phone',
    runbook: 'host-is-filling-up.md',
    dashboard: 'platform',
    panel: platformPanels.machineOverTime,
  },
  {
    uid: 'backup-is-too-old',
    title: 'A backup is too old',
    summary:
      'The newest dump of {{ $labels.compose_project }} is more than 2 hours old, so more than an hour of its data could be lost',
    expr: `(${newestDumpAge}) > ${oldestDumpAllowed}`,
    lookBack: '10m',
    for: '5m',
    reaches: 'email',
    runbook: 'backup-is-too-old.md',
    dashboard: 'platform',
    panel: platformPanels.dumpAge,
  },
  {
    uid: 'restore-test-is-too-old',
    title: 'A restore test is too old',
    summary:
      'The last good restore test of {{ $labels.compose_project }} is more than 35 days old, so nobody knows whether its dumps restore',
    expr: `(${lastRestoreTestAge}) > ${oldestRestoreTestAllowed}`,
    lookBack: '10m',
    for: '0s',
    reaches: 'email',
    runbook: 'restore-test-is-too-old.md',
    dashboard: 'platform',
    panel: platformPanels.restoreTestAge,
  },
  {
    uid: 'telemetry-went-silent',
    title: 'Telemetry went silent',
    summary:
      'The telemetry agent has reported nothing for 10 minutes, so nothing else is known either',
    expr: 'absent_over_time(alloy_build_info[10m])',
    lookBack: '10m',
    for: '0s',
    reaches: 'phone',
    runbook: 'telemetry-went-silent.md',
    dashboard: 'platform',
    panel: platformPanels.agent,
  },
  {
    uid: 'kafka-broker-is-down',
    title: 'The Kafka broker is down',
    summary:
      'The Kafka broker has not answered on its port for 5 minutes, so no app can send or read events',
    expr: `(${brokerAnswers}) < 1`,
    lookBack: '10m',
    for: '5m',
    reaches: 'phone',
    runbook: 'kafka-broker-is-down.md',
    dashboard: 'platform',
    panel: platformPanels.brokerAnswers,
  },
  {
    uid: 'messages-are-stuck',
    title: 'Messages are stuck',
    summary:
      '{{ $labels.service_name }} has had messages waiting on {{ $labels.messaging_destination_name }} for 15 minutes, and has handled none of them',
    expr: `(max by (${consumer}) (zigordev_events_consumer_lag) > 0) unless on (${consumer}) (sum by (${consumer}) (increase(messaging_client_consumed_messages_total[10m])) > 0)`,
    lookBack: '10m',
    for: '5m',
    reaches: 'phone',
    runbook: 'messages-are-stuck.md',
    dashboard: 'app',
    panel: appPanels.waiting,
  },
  {
    uid: 'message-reached-dead-letter-topic',
    title: 'A message reached a dead-letter topic',
    summary:
      '{{ $labels.service_name }} set a message from {{ $labels.messaging_destination_name }} aside on its dead-letter topic, with the reason {{ $labels.zigordev_events_reason }}',
    expr: 'sum by (service_name, messaging_destination_name, zigordev_events_reason) (increase(zigordev_events_dead_letters_total[10m])) > 0',
    lookBack: '10m',
    for: '0s',
    reaches: 'email',
    runbook: 'message-reached-dead-letter-topic.md',
    dashboard: 'app',
    panel: appPanels.setAside,
  },
];
