import type { AppObservability } from '../../src/observability/dashboards.ts';
import { metricSeries } from '../../src/observability/panels.ts';

const job = 'job="notifications-api"';

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
};
