# Local first start

How to run the platform on a laptop, from nothing. It needs nothing from platform-ops.

## Prerequisites

- git, with the zigordev identity set in this repo
- [mise](https://mise.jdx.dev), activated in your shell, which installs and selects the versions in `mise.toml`: Node, pnpm and gitleaks, and for the cloud stacks OpenTofu, tflint, trivy, sops and age
- A running Docker engine, such as Docker Desktop
- The GitHub CLI, signed in as zigordev, with the `read:packages` scope

## Activate mise

`mise install` only downloads the versions. Activate mise in your shell once, so that inside this repo they come first on your `PATH`, ahead of any Node from nvm or pnpm from Homebrew:

```bash
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
```

Use `mise activate bash` in `~/.bashrc` for bash. Open a new terminal afterwards: in the repo, `node --version` prints v26 and `pnpm --version` prints 12.21.0. To skip activation, prefix each command with `mise exec --`, such as `mise exec -- pnpm install`.

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

It starts PostgreSQL and gives every app in `apps/` that asks for a database its own database and role. It makes sure notifications has its local producer keys, starts the other containers, runs notifications-api's migration job, and waits until every container reports healthy. It prints one line per database and one for the producers.

| Service           | Container                    | On the laptop                                               | What it does                                                                          |
| ----------------- | ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| PostgreSQL        | `platform-postgres`          | `127.0.0.1:5432`                                            | PostgreSQL 18, one database and role per app                                          |
| Mailpit           | `platform-mailpit`           | SMTP on `127.0.0.1:1025`, web on `http://127.0.0.1:8025`    | Catches every email, so nothing leaves the laptop                                     |
| Alloy             | `platform-alloy`             | OTLP on `127.0.0.1:4317` (gRPC) and `127.0.0.1:4318` (HTTP) | Receives traces, metrics and logs, and tails container logs                           |
| otel-lgtm         | `platform-lgtm`              | Grafana on `http://127.0.0.1:3300`                          | Grafana with Tempo, Loki and Prometheus behind it                                     |
| notifications-api | `platform-notifications-api` | `http://127.0.0.1:3001`                                     | The released notifications-api, which apps send email through. It delivers to Mailpit |

- Every port listens on `127.0.0.1` only.
- PostgreSQL trusts local connections, so there are no passwords to keep in git. Never publish its port beyond the laptop.
- Grafana opens without a login, as an administrator, because nothing in it leaves the laptop.
- Port 3000 stays free for the first Next.js app.
- `platform-notifications-api-migrate` applies notifications-api's migrations from the same image, then exits.

## Send a first email

Apps send email through notifications-api, which delivers to Mailpit. The first `pnpm local:up` creates a producer named `local-dev`, which may send as `dev@zigordev.test`, for trying it out. Its key is in the git-ignored `local/notifications-producers.json`:

```bash
KEY="$(node -p "require('./local/notifications-producers.json').find((producer) => producer.name === 'local-dev').key")"
curl -i http://127.0.0.1:3001/api/v1/emails \
  -H "authorization: Bearer $KEY" \
  -H 'idempotency-key: local:first-email' \
  -H 'content-type: application/json' \
  -d '{"from":{"email":"dev@zigordev.test"},"to":{"email":"you@zigordev.test"},"subject":"Hello from notifications","text":"It works."}'
```

It answers `202`, and the email is in Mailpit at <http://127.0.0.1:8025> within a few seconds. The [user manual](user-manual.md#send-email-through-notifications) shows how an app gets its own key.

## Stop it

- `pnpm local:down` stops the containers and keeps PostgreSQL's data.
- `pnpm local:reset` deletes the data and starts again, with the databases provisioned afresh. It keeps the producer keys in `local/notifications-producers.json`.
- Telemetry lives inside the otel-lgtm container, so it goes whenever that container is recreated.

## Check a change the way CI does

```bash
pnpm run check
npx --yes markdownlint-cli2 "**/*.md"
pnpm local:up
pnpm local:check
```

`pnpm run check` runs lint, typecheck and the tests with coverage. Its tests start their own PostgreSQL containers through Testcontainers. `pnpm local:check` probes the running platform: PostgreSQL and the provisioned roles, mail through Mailpit, notifications-api's health and an email through it into Mailpit, and a trace, a metric and container logs through Alloy into Grafana, down to a line notifications-api has just written. It reads Loki's whole 30-day window for the container list, so a stack that has run for days still passes. CI also lints the workflows with zizmor, reviews new dependencies, and scans for secrets with gitleaks.

## When something fails

- **`pnpm` prints `Failed to switch pnpm to v12.21.0`, or `node --version` is not v26:** mise is not active in this shell, so another Node or pnpm comes first on `PATH`. Activate it as [Activate mise](#activate-mise) says and open a new terminal, or prefix the command with `mise exec --`.
- **A port is taken:** another program listens on 5432, 1025, 8025, 4317, 4318, 3300 or 3001. A working copy of notifications started from its own repo also takes 3001. Stop it, then start the platform again.
- **`platform-notifications-api` never turns healthy:** `docker logs platform-notifications-api` names the setting it rejects. `pnpm local:up` rewrites its producers from `local/notifications-producers.json`, so run it rather than `docker compose up` after changing that file.
- **`local:up` never turns healthy:** `docker compose --file local/compose.yaml logs` shows each container's output.
- **`pnpm install` returns 401:** `NODE_AUTH_TOKEN` is empty or the token lacks `read:packages`.
