# User manual

How an app uses the platform. Locally, the app you are editing runs as a normal process with `pnpm dev`, against the containers the platform starts with Docker Compose: the shared services, and the released images of the apps other apps call, such as notifications-api ([ADR 0001](adr/0001-hybrid-local-platform.md), [ADR 0006](adr/0006-local-platform-runs-released-apps.md)).

## Register the app

An app is one folder in `apps/`, named after the app as `<repo>-<app>`, with an `app.yaml`:

```yaml
name: gpool-api
database: true
```

| Field         | Meaning                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | The app's one name, `<repo>-<app>` in kebab-case, equal to its folder                                                                         |
| `database`    | `true` gives the app its own database and role. It defaults to `false`                                                                        |
| `connections` | The most connections the app's role may open, 1 to 100. It defaults to 25                                                                     |
| `local`       | `true` for an app that runs only on laptops, such as the playground. Production provisioning and deploys leave it out. It defaults to `false` |

Unknown fields are rejected. `pnpm local:up` reads the registry and creates what is missing, without touching what exists ([ADR 0002](adr/0002-app-registry-provisions-databases.md)). The database and the role take the app's name with underscores, such as `gpool_api`. The role owns its database, and no other role can connect to it. Each role is also limited to its `connections`, and its statements and idle transactions end after 60 seconds, so no app can starve the others ([ADR 0012](adr/0012-database-roles-have-guardrails.md)). A migration that needs longer statements sets `statement_timeout` for its own session.

## Point the app at the platform

An app reads these values through its validated configuration:

| Setting                       | Local value                                                             |
| ----------------------------- | ----------------------------------------------------------------------- |
| Database URL                  | `postgresql://gpool_api@127.0.0.1:5432/gpool_api`                       |
| `OTEL_SERVICE_NAME`           | `gpool-api`                                                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:4318`                                                 |
| SMTP host and port            | `127.0.0.1` and `1025`, without TLS. Any user and password are accepted |

- Traces, metrics and logs sent over OTLP appear in Grafana at <http://127.0.0.1:3300>, under Explore: Tempo for traces, Prometheus for metrics, Loki for logs.
- Every email lands in Mailpit at <http://127.0.0.1:8025>.
- The database URL has no password, because the local PostgreSQL trusts local connections. Production supplies one from its secrets.

## Send email through notifications

The platform runs notifications-api from its released image, so an app sends email without a notifications clone. Each app is its own producer, with its own key and the sender addresses it may use:

```bash
pnpm local:producer-key gpool-api noreply@gpool.test
pnpm local:up
```

The first command prints the producer with its `key`. Running it again for the same app keeps the key and replaces the senders. `pnpm local:up` restarts notifications-api with the new list.

| Setting           | Local value                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Notifications URL | `http://127.0.0.1:3001`, or `http://notifications-api:3000` from a container on the `zigordev` network |
| Producer key      | The printed `key`, kept in the app's git-ignored `.env.local`                                          |

The app sends through `@zigordev/notifications-client` with that URL and key, and every email lands in Mailpit. A wrong key gets `401`, and a sender the producer does not list gets `403`.

- The keys live in the git-ignored `local/notifications-producers.json`, as callers send them. notifications-api keeps only their SHA-256 hashes, which `pnpm local:up` writes to `local/notifications-api.env`.
- The producer `local-dev`, sending as `dev@zigordev.test`, always exists, for trying the service by hand and for `pnpm local:check`.
- `pnpm local:reset` keeps the keys. Deleting the file makes new ones on the next `pnpm local:up`, and every app then needs its new key.

To work on notifications itself, stop the platform's copy and run your working copy from the notifications repo on the same port, with the `PRODUCERS` line of `local/notifications-api.env` in its `.env.local`, so every app's key still works:

```bash
docker compose --file local/compose.yaml stop notifications-api
```

`pnpm local:up` brings the released image back.

## Use feature flags

An app's flags live in `apps/<app>/flags.json`, in flagd's format, and flagd serves them to that app only ([ADR 0007](adr/0007-flagd-serves-each-apps-flags.md), toolkit ADR 0012):

```json
{
  "$schema": "https://flagd.dev/schema/v0/flags.json",
  "metadata": { "flagSetId": "gpool-api" },
  "flags": {
    "new-checkout": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off",
      "metadata": { "removeBy": "2027-03-31" }
    }
  }
}
```

- `flagSetId` is the app's name, and flag keys are kebab-case.
- Every flag has a `defaultVariant` and a `removeBy` date. `pnpm run check` fails once a flag is past its date, so remove the flag, or move the date in the same PR.
- `targeting` takes flagd's rules, such as a variant for some users. There is no toggle UI: a change is a PR.
- flagd reloads an edited file within seconds. A new `flags.json` needs `pnpm local:up`, which recreates flagd with it.

The app reads its flags through OpenFeature, always with the selector `flagSetId=<app>`:

| Reader                      | Local settings                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Server, flagd provider      | `FLAGD_RESOLVER=in-process`, `FLAGD_HOST=127.0.0.1`, `FLAGD_PORT=8015` and `FLAGD_SOURCE_SELECTOR=flagSetId=<app>` |
| Browser, OFREP web provider | Base URL `http://127.0.0.1:8016`, with the header `flagd-selector: flagSetId=<app>`                                |

A flag of another app answers `FLAG_NOT_FOUND`, and when flagd is down the provider returns each flag's default.

## See the app in Grafana

Every app in the registry gets a dashboard in Grafana's `zigordev` folder, named after the app ([ADR 0010](adr/0010-dashboards-are-code-from-the-registry.md)). Its rows show the overview, traffic by route and status, latency, and log lines by level, from the app's `http.server.request.duration` metric with `job="<app>"` and its logs with `service_name="<app>"`. An app named `*-web` also gets a browser row from Faro. The `platform` dashboard shows every app, flagd's evaluations and the browsers.

An app adds rows of its own in `apps/<app>/observability.ts`, built with the helpers in `src/observability/panels.ts`:

```ts
import type { AppObservability } from '../../src/observability/dashboards.ts';
import { metricSeries } from '../../src/observability/panels.ts';

export const observability: AppObservability = {
  rows: [
    {
      title: 'Pools',
      panels: [
        metricSeries('Pools created', 'ops', [
          { expr: 'sum(rate(gpool_pools_created_total{job="gpool-api"}[$__rate_interval]))' },
        ]),
      ],
    },
  ],
};
```

`pnpm local:up` regenerates the dashboards, and Grafana shows a change within 10 seconds.

## Alerts

Every app in the registry gets one standard alert, `<App>ErrorRatio`, such as `GpoolApiErrorRatio`. It fires when more than 5% of the app's requests have failed with a server error for 5 minutes ([ADR 0011](adr/0011-alert-rules-are-code-with-runbooks.md)). The platform adds `PlatformFlagdDown`. Locally, every alert is emailed to `alerts@platform.test`, and Mailpit catches it.

An app adds its own alerts in `apps/<app>/observability.ts`, next to its dashboard rows:

```ts
alerts: [
  {
    name: 'GpoolApiInvitationsFailing',
    summary: 'Invitations have failed to send for 10 minutes',
    expr: 'sum(increase(gpool_invitations_failed_total{job="gpool-api"}[10m])) > 0',
    for: '10m',
    severity: 'ticket',
    runbook: 'https://github.com/zigordev/gpool/blob/main/docs/runbooks/invitations-failing.md',
    dashboard: 'app-gpool-api',
  },
],
```

- `expr` returns a value only while the alert should fire. With no data, the alert stays quiet.
- `severity` is `page` for something a person should look at now, and `ticket` for something that can wait.
- Every alert links a runbook in the app's repo, with what fired, whether it matters, how to see it and what to do. It also links the app's dashboard.
- Run a new `expr` against the local Prometheus before it goes in. `pnpm local:up` loads it, and `pnpm local:check` confirms Grafana has it.

## Send browser telemetry

A web app sends real user monitoring from the browser with Grafana Faro, to Alloy's Faro receiver ([ADR 0009](adr/0009-alloy-receives-browser-telemetry.md), toolkit ADR 0016):

| Setting         | Local value                                  |
| --------------- | -------------------------------------------- |
| Faro URL        | `http://127.0.0.1:12347/collect`             |
| App name        | The app's registry name, such as `gpool-web` |
| App version     | The release, as in `OTEL_SERVICE_VERSION`    |
| App environment | `local`                                      |

- Browser logs land in Loki labelled `source="faro"` and `service_name=<app>`, beside the app's server logs, and browser traces land in Tempo.
- Any origin may post locally. Production allows only the apps' own origins.
- Alloy never downloads sourcemaps, and it limits each browser to 50 requests a second with bursts of 100.
- Nothing personal leaves the browser: no emails, names or ids in log messages or attributes.

## Run the app in a container

A container joins the `zigordev` network and reaches the services by name, the same names production uses:

| Service           | Address on the `zigordev` network                                    |
| ----------------- | -------------------------------------------------------------------- |
| PostgreSQL        | `postgres:5432`                                                      |
| Alloy             | `http://alloy:4318`, Faro on `http://alloy:12347/collect`            |
| Mailpit           | `mailpit:1025`                                                       |
| notifications-api | `http://notifications-api:3000`                                      |
| flagd             | `flagd:8015` for in-process providers, `http://flagd:8016` for OFREP |

Alloy also tails the logs of every container on the `zigordev` network into Loki, labelled `service_name` with the container's compose service, which the estate names after the app, and reads no other container's logs.

## Limits

- The local platform is for one laptop. PostgreSQL trusts local connections, so its port must never be published beyond `127.0.0.1`.
- PostgreSQL's data survives `pnpm local:down` and goes with `pnpm local:reset`.
- Telemetry lives in the `lgtm-data` volume, so it survives a recreated otel-lgtm container and goes with `pnpm local:reset`.
- notifications-api runs the release Renovate pinned, not notifications' `main`. A migration that a working copy applied stays in its database, ahead of that release.
- Traces from notifications-api carry no `service.version` locally, because its image does not carry its version.
