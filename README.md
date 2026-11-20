# platform

Where every zigordev app runs, described in code: the shared services, the infrastructure and each app's desired state. It holds no application code. Phase 2 of the rebuild builds it, starting with the local platform. The production host comes next.

## What it is

| Path                       | Holds                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local/compose.yaml`       | The local platform: PostgreSQL 18, Mailpit, Grafana Alloy, Grafana's otel-lgtm image, flagd and the released notifications-api, on the `zigordev` Docker network                                                                                                                            |
| `stack/alloy/config.alloy` | The Alloy pipeline, shared by the local platform and production, with only environment variables telling them apart                                                                                                                                                                         |
| `apps/<app>/`              | The app registry, one folder per app: `app.yaml`, and `flags.json` for an app with feature flags. Each app that asks for a database gets its own database and role, and flagd serves each app its own flags. Local-only apps, such as the playground, are marked and never reach production |
| `infra/bootstrap/`         | OpenTofu that creates what every other stack needs first: the encrypted state bucket, its KMS key, and the roles CI plans and applies with                                                                                                                                                  |
| `src/` and `scripts/`      | The registry reader, the database provisioning and the local producer keys for notifications, with their tests                                                                                                                                                                              |
| `docs/`                    | How to run it, how apps use it, a tutorial and the decision records                                                                                                                                                                                                                         |

Later in Phase 2, more of `infra/`, `host/` (cloud-init, systemd units, doco-cd) and `observability/` join it.

## Why it exists

The legacy estate ran 14 shared services on its production host and seven local stacks that starved a laptop's Docker VM. The rebuild keeps one kind of state, PostgreSQL, and one telemetry agent, Alloy. On a laptop, the app you are editing runs as a normal process against a few containers: the shared services, and the released images of the apps other apps call, such as notifications-api, so an app can send email without cloning notifications. [ADR 0001](docs/adr/0001-hybrid-local-platform.md) and [ADR 0006](docs/adr/0006-local-platform-runs-released-apps.md) explain why.

## Technologies and tools

Docker Compose, PostgreSQL 18, Mailpit, flagd for OpenFeature, Grafana Alloy, grafana/otel-lgtm with Grafana, Tempo, Loki and Prometheus, and notifications-api's released image. OpenTofu 1.13 with tflint and trivy, sops and age. Node.js 26, TypeScript 7 and pnpm 12, all pinned with mise, with Zod, js-yaml and node-postgres. Vitest with real PostgreSQL databases through `@zigordev/test`, Biome, lefthook, commitlint, Renovate, and toolkit's shared workflows in CI.

## Dependencies

A running Docker engine, toolkit's packages from GitHub Packages, which need a token with `read:packages`, and notifications-api's public image on GHCR. The cloud stacks run in the zigordev AWS account, in `eu-west-1`, beside the legacy resources and without touching them. Nothing from platform-ops.

## Quick start

```bash
git clone git@github.com:zigordev/platform.git ~/Desktop/Personal/zigordev/platform
cd ~/Desktop/Personal/zigordev/platform
mise install
pnpm install
pnpm local:up
```

mise has to be active in your shell, or each command prefixed with `mise exec --`, as [local first start](docs/local-first-start.md#activate-mise) shows. Grafana opens at <http://127.0.0.1:3300>, Mailpit at <http://127.0.0.1:8025>, notifications-api answers at <http://127.0.0.1:3001>, and flagd's OFREP at <http://127.0.0.1:8016>. [Local first start](docs/local-first-start.md) has the details, the [user manual](docs/user-manual.md) shows how an app uses the platform, and the [tutorial](docs/tutorials/run-an-app-locally.md) walks through it.
