# 0010. Dashboards are code, generated from the registry

- Status: accepted
- Date: 2026-11-20
- Supersedes: none

## Context

Toolkit ADR 0016 has dashboards and alert rules written as code and applied to both the local Grafana and Grafana Cloud, and the tech radar names the Grafana Foundation SDK in place of the legacy 3,055-line generator. The local Grafana showed only otel-lgtm's sample dashboards. On 2026-11-20 the owner chose to keep dashboards and alerts in this repo: a standard set for every app in the registry, plus an app's own panels where it needs them. otel-lgtm also kept its data inside the container, so every recreation emptied Grafana.

## Decision

- `src/observability/` builds dashboards with the Grafana Foundation SDK. Every registered app gets one, named after the app, with the same rows: overview, traffic, latency and logs, plus a browser row for an app named `*-web`. One more dashboard, `platform`, shows every app, flagd and the browsers.
- An app adds its own rows in `apps/<app>/observability.ts`, which exports `observability` with them. notifications-api adds its email delivery row this way.
- Every query is scoped to its app: Prometheus by `job="<app>"`, Loki by `service_name="<app>"`.
- `pnpm local:up` writes the dashboards and Grafana's provider file to the git-ignored `local/grafana/`, which otel-lgtm mounts. Grafana picks up a change within 10 seconds, and a dashboard whose app left the registry disappears.
- otel-lgtm keeps its data in the `lgtm-data` volume, so telemetry survives a recreated container and goes only with `pnpm local:reset`.

## Consequences

- A new app gets its dashboard the moment it joins the registry, with nothing to draw by hand.
- The same builders will produce the Grafana Cloud dashboards once the host exists.
- Mounting the provisioning folder replaces otel-lgtm's sample dashboards, which the app dashboards supersede.
- The browser row depends on the `-web` suffix of the app's name.

## Alternatives considered

- Dashboard JSON kept in git: no builder code, but every app's dashboard repeats the same panels, and they drift apart.
- Each app's repo shipping its own dashboards: the knowledge stays with the app, but the platform needs a way to collect them, and the standard rows would be copied into every repo.
- An app's own rows inside `src/observability/`: keeps all code under `src`, but separates them from the app's other entries in the registry.
