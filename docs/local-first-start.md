# Local first start

How to run the platform on a laptop, from nothing. It needs nothing from platform-ops.

## Prerequisites

- git, with the zigordev identity set in this repo
- [mise](https://mise.jdx.dev), which installs the versions in `mise.toml`: Node, pnpm and gitleaks, and for the cloud stacks OpenTofu, tflint, trivy, sops and age
- A running Docker engine, such as Docker Desktop
- The GitHub CLI, signed in as zigordev, with the `read:packages` scope

## Access to GitHub Packages

The tools come from toolkit's packages on GitHub Packages, which asks for a token even for public packages. Give the GitHub CLI's token the scope once:

```bash
gh auth refresh -h github.com -s read:packages
```

Add this line to `~/.npmrc` once. It names an environment variable, so the token itself is never written to a file:

```text
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Before installing, put the token in that variable:

```bash
export NODE_AUTH_TOKEN="$(gh auth token -u zigordev)"
```

## Clone and install

```bash
git clone git@github.com:zigordev/platform.git ~/Desktop/Personal/zigordev/platform
cd ~/Desktop/Personal/zigordev/platform
git config user.name zigordev
git config user.email zigordev@gmail.com
mise install
pnpm install
```

`pnpm install` also installs the git hooks: Biome and gitleaks before each commit, commitlint on each message, and the full check before each push.

## Start it

```bash
pnpm local:up
```

It starts four containers, waits until each one reports healthy, then gives every app in `apps/` that asks for a database its own database and role. It prints one line per database.

| Service    | Container           | On the laptop                                               | What it does                                                |
| ---------- | ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| PostgreSQL | `platform-postgres` | `127.0.0.1:5432`                                            | PostgreSQL 18, one database and role per app                |
| Mailpit    | `platform-mailpit`  | SMTP on `127.0.0.1:1025`, web on `http://127.0.0.1:8025`    | Catches every email, so nothing leaves the laptop           |
| Alloy      | `platform-alloy`    | OTLP on `127.0.0.1:4317` (gRPC) and `127.0.0.1:4318` (HTTP) | Receives traces, metrics and logs, and tails container logs |
| otel-lgtm  | `platform-lgtm`     | Grafana on `http://127.0.0.1:3300`                          | Grafana with Tempo, Loki and Prometheus behind it           |

- Every port listens on `127.0.0.1` only.
- PostgreSQL trusts local connections, so there are no passwords to keep in git. Never publish its port beyond the laptop.
- Grafana opens without a login, as an administrator, because nothing in it leaves the laptop.
- Port 3000 stays free for the first Next.js app.

## Stop it

- `pnpm local:down` stops the containers and keeps PostgreSQL's data.
- `pnpm local:reset` deletes the data and starts again, with the databases provisioned afresh.
- Telemetry lives inside the otel-lgtm container, so it goes whenever that container is recreated.

## Check a change the way CI does

```bash
pnpm run check
npx --yes markdownlint-cli2 "**/*.md"
pnpm local:up
pnpm local:check
```

`pnpm run check` runs lint, typecheck and the tests with coverage. Its tests start their own PostgreSQL containers through Testcontainers. `pnpm local:check` probes the running platform: PostgreSQL and the provisioned roles, mail through Mailpit, and a trace, a metric and container logs through Alloy into Grafana. CI also lints the workflows with zizmor, reviews new dependencies, and scans for secrets with gitleaks.

## When something fails

- **A port is taken:** another program listens on 5432, 1025, 8025, 4317, 4318 or 3300. Stop it, then start the platform again.
- **`local:up` never turns healthy:** `docker compose --file local/compose.yaml logs` shows each container's output.
- **`pnpm install` returns 401:** `NODE_AUTH_TOKEN` is empty or the token lacks `read:packages`.
