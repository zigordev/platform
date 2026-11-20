import type { AppObservability } from '../../src/observability/dashboards.ts';
import { metricSeries } from '../../src/observability/panels.ts';

const job = 'job="notifications-api"';
const runbooks = 'https://github.com/zigordev/notifications/blob/main/docs/runbooks';
const inTime = (window: string): string =>
  `sum(rate(notifications_email_delivery_duration_seconds_bucket{${job}, le="120"}[${window}])) / sum(rate(notifications_email_delivery_duration_seconds_count{${job}}[${window}]))`;

export const observability: AppObservability = {
  rows: [
    {
      title: 'Email delivery',
      panels: [
        metricSeries('Emails accepted by producer', 'ops', [
          {
            expr: `sum by (producer, outcome) (rate(notifications_email_accepts_total{${job}}[$__rate_interval]))`,
            legend: '{{producer}} {{outcome}}',
          },
        ]),
        metricSeries('Deliveries by outcome', 'ops', [
          {
            expr: `sum by (outcome) (rate(notifications_email_deliveries_total{${job}}[$__rate_interval]))`,
            legend: '{{outcome}}',
          },
        ]),
        metricSeries('Send attempts by outcome', 'ops', [
          {
            expr: `sum by (outcome) (rate(notifications_email_sends_total{${job}}[$__rate_interval]))`,
            legend: '{{outcome}}',
          },
        ]),
        metricSeries('Time to delivery', 's', [
          {
            expr: `histogram_quantile(0.95, sum by (le) (rate(notifications_email_delivery_duration_seconds_bucket{${job}}[$__rate_interval])))`,
            legend: 'p95',
          },
        ]),
        metricSeries('Queue jobs by state', 'short', [
          {
            expr: `sum by (messaging_destination_name, pgboss_job_state) (pgboss_queue_jobs{${job}})`,
            legend: '{{messaging_destination_name}} {{pgboss_job_state}}',
          },
        ]),
      ],
    },
  ],
  alerts: [
    {
      name: 'NotificationsDeliveryObjective',
      summary:
        'Fewer emails go out within two minutes than the 99% objective allows, fast enough to spend the month of budget early',
      expr: `((1 - (${inTime('1h')})) > (14.4 * 0.01)) and ((1 - (${inTime('5m')})) > (14.4 * 0.01))`,
      for: '2m',
      severity: 'page',
      runbook: `${runbooks}/delivery-objective.md`,
      dashboard: 'app-notifications-api',
      windowSeconds: 3600,
    },
    {
      name: 'NotificationsDeadLetters',
      summary: 'An email failed for good in the last hour and went to the dead letters',
      expr: `sum(increase(notifications_email_deliveries_total{${job}, outcome="failed"}[1h])) > 0`,
      for: '0m',
      severity: 'ticket',
      runbook: `${runbooks}/dead-letters.md`,
      dashboard: 'app-notifications-api',
      windowSeconds: 3600,
    },
  ],
};
