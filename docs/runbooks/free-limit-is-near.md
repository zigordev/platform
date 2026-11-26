# A free limit is near

## What it means

Grafana Cloud's free plan includes a fixed amount of each kind of data. More than 80% of one of them is in use. The alert names which one:

| Limit              | Included on the free plan | Counts                                               |
| ------------------ | ------------------------- | ---------------------------------------------------- |
| metrics series     | 10,000                    | The metrics series that Grafana Cloud bills for      |
| logs               | 50 GB a month             | The log data received since the month began          |
| traces             | 50 GB a month             | The trace data received since the month began        |
| profiles           | 50 GB a month             | The profile data received since the month began      |
| outside check runs | 100,000 a month           | The runs of the outside checks since the month began |
| users              | 3                         | The people who use the stack                         |

The free plan never sends a bill. Once a limit is reached, Grafana Cloud drops what goes over it: new metrics series beyond the limit, and logs, traces or profiles until the next month begins. Data that is dropped is lost, and an alert that reads it stays silent.

The amounts a month start again on the first of each month. The alert lives in Grafana Cloud only, because the laptop's Grafana has no usage numbers.

## How to check

1. Open the alert's panel, "Share of each free limit in use", on the dashboard Free limits in Grafana Cloud. It shows which limit climbs, and how fast.
2. Open Grafana Cloud's own dashboard Billing/Usage, in the folder GrafanaCloud. It shows the same numbers in more detail, and the metrics series that were dropped.
3. For metrics series, find the metrics with the most series: in Grafana's Explore, pick Prometheus and run `topk(10, count by (__name__) ({__name__=~".+"}))`. A label that holds an id or a raw path makes one metric into thousands of series.
4. For logs, find the service that writes the most: in Explore, pick Loki and run `sum by (service_name) (bytes_over_time({service_name=~".+"}[1h]))`.
5. For outside check runs: each live product is checked from two places every 5 minutes, about 17,500 runs a month. Five live products use about 88% of the 100,000.

## How to fix

| Limit              | What to do                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| metrics series     | Remove the label that multiplies the series, in the app that reports it. The agent keeps only an allow-list of the host's metrics, in `stack/compose.yaml` of `platform` |
| logs               | Lower the level of the service that writes the most, or fix the loop that writes the same line again and again                                                           |
| traces or profiles | Keep only a sample of the traces, as the plan's Observability page says for when the volume nears the free limit                                                         |
| outside check runs | Check less often, or from one place: `local.checks` in `infra/grafana` of `platform`, through a pull request                                                             |
| users              | Remove a user who no longer needs the stack                                                                                                                              |
| Any of them        | Move to Grafana Cloud's Pro plan, which cost $19 a month plus what is used beyond its own amounts on 2026-11-26. That is the owner's decision                            |
