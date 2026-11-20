# 0011. Alert rules are code, with runbooks

- Status: accepted
- Date: 2026-11-20
- Supersedes: none

## Context

The estate rules give every failure a user would notice an alert, with a runbook and a dashboard link. Toolkit ADR 0016 applies alert rules as code to both the local Grafana and Grafana Cloud. ADR 0010 already builds the dashboards from the registry, and notifications named its alerts in its runbooks before any rule existed. On 2026-11-20 the owner chose to have local alerts emailed to Mailpit.

## Decision

- `src/observability/alerts.ts` builds Grafana-managed rules with the Grafana Foundation SDK:
  - every registered app gets `<App>ErrorRatio`, which fires when more than 5% of its requests fail with a server error for 5 minutes;
  - the platform gets `PlatformFlagdDown`;
  - an app adds its own rules in `apps/<app>/observability.ts`. notifications adds `NotificationsDeliveryObjective` and `NotificationsDeadLetters`, the two of its five that its metrics can measure.
- Every rule has the same shape. It runs a PromQL query that returns a value only while the alert should fire, then a threshold above zero. No data means `OK`, and a query error means `Error`.
- Every rule carries a `severity` label (`page` or `ticket`) and three annotations: a `summary`, a `runbook_url` and a `dashboard_url`. The dashboard link is a full URL built from `PLATFORM_GRAFANA_URL`, because Grafana rejects a rule that names a dashboard without also naming a panel ID, and the generated panels have no stable IDs.
- The contact point `platform-email` sends every alert to `alerts@platform.test`. Locally, Grafana's SMTP settings point at Mailpit, so the email lands there.
- `pnpm local:up` writes the rules to `local/grafana/provisioning/alerting/`. Grafana reads that folder only at start, so the file's hash, `GRAFANA_ALERTING_SHA`, recreates otel-lgtm when the rules change, without losing data, which lives in the `lgtm-data` volume.
- The platform's runbooks live in `docs/runbooks/`, and an app's in its own repo.

## Consequences

- A new app gets its error alert, its runbook and its dashboard link the moment it joins the registry.
- A rule that names a dashboard is checked against Grafana by `pnpm local:check`, which also sends a test notification into Mailpit.
- notifications' alerts for a provider or database that is down, and for stalled retention, wait for a health metric or log rule.
- Production keeps the same rules, with Grafana Cloud's own contact points, once the host exists.

## Alternatives considered

- Prometheus alerting rules with an Alertmanager: the classic stack, but otel-lgtm ships no Alertmanager, and Grafana Cloud alerts from Grafana either way.
- Linking panels with `__dashboardUid__` and `__panelId__`: Grafana's own integration, at the cost of stable panel IDs in every dashboard and in every rule that points at one.
- Alerts only in production: nothing to run locally, but a rule would meet real data for the first time in production.
