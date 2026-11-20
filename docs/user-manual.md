# User manual

How an app uses the platform. Locally, the app you are editing runs as a normal process with `pnpm dev`, against the containers the platform starts with Docker Compose: the shared services, and the released images of the apps other apps call, such as notifications-api ([ADR 0001](adr/0001-hybrid-local-platform.md), [ADR 0006](adr/0006-local-platform-runs-released-apps.md)).

## Register the app

An app is one folder in `apps/`, named after the app as `<repo>-<app>`, with an `app.yaml`:

```yaml
name: gpool-api
database: true
```

| Field      | Meaning                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | The app's one name, `<repo>-<app>` in kebab-case, equal to its folder                                                                         |
| `database` | `true` gives the app its own database and role. It defaults to `false`                                                                        |
| `local`    | `true` for an app that runs only on laptops, such as the playground. Production provisioning and deploys leave it out. It defaults to `false` |

Unknown fields are rejected. `pnpm local:up` reads the registry and creates what is missing, without touching what exists ([ADR 0002](adr/0002-app-registry-provisions-databases.md)). The database and the role take the app's name with underscores, such as `gpool_api`. The role owns its database, and no other role can connect to it.

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

## Run the app in a container

A container joins the `zigordev` network and reaches the services by name, the same names production uses:

| Service           | Address on the `zigordev` network                                    |
| ----------------- | -------------------------------------------------------------------- |
| PostgreSQL        | `postgres:5432`                                                      |
| Alloy             | `http://alloy:4318`                                                  |
| Mailpit           | `mailpit:1025`                                                       |
| notifications-api | `http://notifications-api:3000`                                      |
| flagd             | `flagd:8015` for in-process providers, `http://flagd:8016` for OFREP |

Alloy also tails the logs of every container on the `zigordev` network into Loki, and reads no other container's logs.

## Limits

- The local platform is for one laptop. PostgreSQL trusts local connections, so its port must never be published beyond `127.0.0.1`.
- PostgreSQL's data survives `pnpm local:down` and goes with `pnpm local:reset`.
- Telemetry lives inside the otel-lgtm container and goes whenever that container is recreated.
- notifications-api runs the release Renovate pinned, not notifications' `main`. A migration that a working copy applied stays in its database, ahead of that release.
- Traces from notifications-api carry no `service.version` locally, because its image does not carry its version.
