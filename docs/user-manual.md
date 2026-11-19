# User manual

How an app uses the platform. Locally, an app runs as a normal process with `pnpm dev`, against the services the platform starts ([ADR 0001](adr/0001-hybrid-local-platform.md)).

## Register the app

An app is one folder in `apps/`, named after the app as `<repo>-<app>`, with an `app.yaml`:

```yaml
name: gpool-api
database: true
```

| Field      | Meaning                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `name`     | The app's one name, `<repo>-<app>` in kebab-case, equal to its folder  |
| `database` | `true` gives the app its own database and role. It defaults to `false` |

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

## Run the app in a container

A container joins the `zigordev` network and reaches the services by name, the same names production uses:

| Service    | Address on the `zigordev` network |
| ---------- | --------------------------------- |
| PostgreSQL | `postgres:5432`                   |
| Alloy      | `http://alloy:4318`               |
| Mailpit    | `mailpit:1025`                    |

Alloy also tails the logs of every container on the `zigordev` network into Loki, and reads no other container's logs.

## Limits

- The local platform is for one laptop. PostgreSQL trusts local connections, so its port must never be published beyond `127.0.0.1`.
- PostgreSQL's data survives `pnpm local:down` and goes with `pnpm local:reset`.
- Telemetry lives inside the otel-lgtm container and goes whenever that container is recreated.
