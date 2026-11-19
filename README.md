# platform

Where every zigordev app runs, described in code: the shared services, the infrastructure and each app's desired state. It holds no application code. Phase 2 of the rebuild builds it, starting with the local platform. The production host comes next.

## What it is

| Path                       | Holds                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `local/compose.yaml`       | The local platform: PostgreSQL 18, Mailpit, Grafana Alloy and Grafana's otel-lgtm image, on the `zigordev` Docker network |
| `stack/alloy/config.alloy` | The Alloy pipeline, shared by the local platform and production, with only environment variables telling them apart       |
| `apps/<app>/app.yaml`      | The app registry, one folder per app. Each app that asks for a database gets its own database and role                    |
| `src/` and `scripts/`      | The registry reader and the database provisioning, with their tests                                                       |
| `docs/`                    | How to run it, how apps use it, a tutorial and the decision records                                                       |

Later in Phase 2, `infra/` (OpenTofu), `host/` (cloud-init, systemd units, doco-cd) and `observability/` join it.

## Why it exists

The legacy estate ran 14 shared services on its production host and seven local stacks that starved a laptop's Docker VM. The rebuild keeps one kind of state, PostgreSQL, and one telemetry agent, Alloy. On a laptop, apps run as normal processes against four small containers, as [ADR 0001](docs/adr/0001-hybrid-local-platform.md) explains.

## Technologies and tools

Docker Compose, PostgreSQL 18, Mailpit, Grafana Alloy, and grafana/otel-lgtm with Grafana, Tempo, Loki and Prometheus. Node.js 26, TypeScript 7 and pnpm 12, pinned with mise, with Zod, js-yaml and node-postgres. Vitest with real PostgreSQL databases through `@zigordev/test`, Biome, lefthook, commitlint, Renovate, and toolkit's shared workflows in CI.

## Dependencies

A running Docker engine, and toolkit's packages from GitHub Packages, which need a token with `read:packages`. Nothing from platform-ops.

## Quick start

```bash
git clone git@github.com:zigordev/platform.git ~/Desktop/Personal/zigordev/platform
cd ~/Desktop/Personal/zigordev/platform
mise install
pnpm install
pnpm local:up
```

Grafana opens at <http://127.0.0.1:3300> and Mailpit at <http://127.0.0.1:8025>. [Local first start](docs/local-first-start.md) has the details, the [user manual](docs/user-manual.md) shows how an app uses the platform, and the [tutorial](docs/tutorials/run-an-app-locally.md) walks through it.
