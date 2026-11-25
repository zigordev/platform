# platform

The infrastructure and the shared services of every zigordev product: the ingress, the telemetry agent, the dashboards and alerts, the host, the backups and the runbooks. It is the only repo that can change infrastructure.

The repo is being built step by step, and each step arrives as its own pull request. This page describes what exists today: the repo itself, the shared services for the laptop, the standard dashboards and alert rules, the code of the AWS host, and the host's side of the deploy path.

## What it is

| Path                       | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack/`                   | The shared services as two compose files, and the command that starts them: the ingress, the telemetry agent, a local Grafana and a mail catcher. It is the package `@zigordev/stack`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `observability/`           | The standard dashboards and the alert rules, as TypeScript: one dashboard for any app, one for the platform, and four rules that each cover every app at once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `infra/`                   | AWS, Cloudflare, GitHub and Grafana Cloud, described as code with OpenTofu. It holds `bootstrap/`, what an empty AWS account needs before the pipeline can change it, `github/`, the settings of every repo, `host/`, the one server with its network and its data disk, `deploy/`, the command and the role of each deploy target, `cloudflare/`, the domain with its tunnel, records and HTTPS settings, `grafana-cloud/`, the access to Grafana Cloud, `grafana/`, the stack's data sources, contact point and outside checks, and `backups/`, the bucket for the dumps with its lock and the daily snapshot of the data disk. `products.json` lists the products |
| `host/`                    | What the server runs, as the files it gets at its first boot: the setup script, the deploy script, Docker's settings, the automatic updates, the data disk and the timers. `host/root` mirrors the server's own folders                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.claude/`                 | The rules, skills, hooks and permissions that every Claude Code session works under. They are a copy of the ones in `toolkit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `CLAUDE.md`                | What a session needs to know about this repo: where things live, its commands and its own rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `mise.toml`                | The pinned versions of Node.js, pnpm, gitleaks, zizmor, OpenTofu and tflint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm-workspace.yaml`      | The workspace, the single version of each dependency, and the supply-chain settings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `.github/workflows/ci.yml` | The pipeline of this repo, and the release that publishes its one package. Both are short callers of what `toolkit` holds, so this repo is checked and released exactly as every other repo is                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/`                    | The tests of the repo's own setup. The first one holds the pipeline caller to its agreed shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/`                    | The standard docs, the decision records, and in `docs/runbooks/` one page for each alert                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

`host/` grows with the platform: the deploy script arrived in step 3.7 of the build plan, and the backup script in step 3.8. The plan's eight phases build the whole platform. [The handbook in toolkit](https://github.com/zigordev/toolkit/blob/main/docs/handbook/README.md) lists them and explains every piece.

## Why it exists

Every product needs the same things around it: something that routes a request to it, something that collects its logs, traces and metrics, a machine to run on, and backups. Keeping all of that in one repo means a product repo holds the product and nothing else.

It also draws one line that is easy to check. Only this repo can change AWS, Cloudflare, GitHub's settings or Grafana Cloud, so every such change is one pull request in one place, and each one waits for the owner's approval.

## What it is built with

The shared services are five containers. [stack/README.md](stack/README.md) explains each one.

| Tool                      | What it does here                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Docker and Docker Compose | Run the shared services from the two compose files in `stack/`                                                             |
| Traefik 3                 | The ingress. It sends each address to its container, from the labels the container carries                                 |
| socket-proxy              | The Docker proxy. It lets the ingress and the agent read which containers exist, and nothing else                          |
| Grafana Alloy             | The telemetry agent. It receives traces and metrics, reads every container's log lines, and forwards all of it             |
| otel-lgtm                 | The local Grafana, with its stores for logs, traces and metrics in one container. It runs on the laptop only               |
| Mailpit                   | The mail catcher. It receives every email an app sends on the laptop. It runs on the laptop only                           |
| gcx                       | Grafana's command-line tool. It pushes the dashboards and the alert rules, as files, to the local Grafana                  |
| OpenTofu                  | Describes AWS, Cloudflare, GitHub and Grafana Cloud as code. Each change shows as a plan before anything is changed        |
| tflint                    | Checks the OpenTofu code for mistakes and unused parts                                                                     |
| Ubuntu 26.04 LTS          | The server's operating system, from Canonical's own image for Arm. It installs its security updates by itself              |
| AWS Systems Manager       | The only way into the server: a shell for the owner, with no port open and no SSH key                                      |
| docker-rollout            | On a deploy, it starts a service's new container beside the old one, waits for its health, drains the old one and stops it |
| AWS Parameter Store       | Holds every production secret, and the record of each deployed version                                                     |
| AWS CLI                   | On the server, it reads a deploy's secrets and writes its record. It comes from AWS's own snap and updates itself          |
| Grafana Foundation SDK    | A typed builder. The dashboards are written with it in TypeScript, so they are tested like any code                        |

The repo itself is built with the same tools as every zigordev repo:

| Tool                         | What it does here                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [mise](https://mise.jdx.dev) | Installs the exact Node.js, pnpm, gitleaks, zizmor, OpenTofu and tflint versions that `mise.toml` pins                                                                                                                   |
| Node.js 26                   | Runs every script and every test                                                                                                                                                                                         |
| pnpm 12                      | Installs the dependencies. It takes every version from one catalog, waits one day before it accepts a new release, blocks the install scripts of dependencies, and refuses a package whose publisher became less trusted |
| TypeScript 7                 | Checks types in strict mode                                                                                                                                                                                              |
| Biome 2                      | Lints and formats TypeScript, JavaScript, JSON and CSS, and formats YAML and Markdown                                                                                                                                    |
| markdownlint                 | Lints the Markdown                                                                                                                                                                                                       |
| lefthook                     | Runs the hooks before a commit and before a push                                                                                                                                                                         |
| commitlint                   | Keeps commit titles in the Conventional Commits format, and refuses attribution lines                                                                                                                                    |
| gitleaks                     | Stops a commit that contains something shaped like a secret                                                                                                                                                              |
| Vitest 5                     | Runs the tests and holds coverage above a 90% floor                                                                                                                                                                      |
| zizmor                       | Lints the pipeline files for unsafe patterns, such as an action that is not pinned to a commit                                                                                                                           |
| `@zigordev/dev`              | The developer setup that every zigordev repo shares, installed from npm: the `zigordev` command, the Biome config, the TypeScript bases, the git hooks and the commit rules                                              |
| GitHub Actions               | Runs the pipeline on every pull request and on every merge to `main`                                                                                                                                                     |
| CodeQL                       | Scans our own code for vulnerable patterns, in the pipeline                                                                                                                                                              |
| Dependency Review            | Fails a pull request that adds a dependency with a known flaw                                                                                                                                                            |
| semantic-release             | Works out the next version from the merged titles, tags it and writes the release notes. The release then publishes the package with npm                                                                                 |
| Renovate                     | Opens a pull request for each newer version of a package, a tool, an action or a container image. It merges patch and minor updates by itself, on weekdays between 08:00 and 18:00                                       |
| Claude Code                  | Does the building, under the rules, skills and hooks in `.claude/`                                                                                                                                                       |

It needs no other repo on disk. The shared services need Docker.

## Quick start

Install [mise](https://mise.jdx.dev/getting-started.html) and activate it in your shell, and install and start [Docker Desktop](https://docs.docker.com/desktop/). Then:

```bash
git clone https://github.com/zigordev/platform.git
cd platform
mise install
pnpm install
pnpm check
pnpm local:up
```

`mise install` installs the pinned tools. `pnpm install` installs the dependencies and the git hooks. `pnpm check` runs the full check, and on a clean clone it must end with `check took` and a number of seconds, with no error above it.

`pnpm local:up` starts the shared services and waits until each one is healthy. It then pushes the dashboards and the alert rules, and ends with four addresses. `http://grafana.localhost` and `http://mail.localhost` then open in a browser. The first start downloads about 5 GB of images.

| Command            | What it does                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `pnpm local:up`    | Starts the shared services, and changes nothing when they are running already                     |
| `pnpm local:down`  | Stops them and keeps their data                                                                   |
| `pnpm local:reset` | Stops them, deletes their data and starts them again                                              |
| `pnpm check`       | The full check: lint, build, type check, and tests with coverage. It prints how long it took      |
| `pnpm check:quick` | The part of the check that needs no containers. The push hook runs it                             |
| `pnpm format`      | Fixes the formatting, the import order and the Markdown problems that have a safe fix             |
| `pnpm lint`        | Reports lint and formatting problems without changing a file                                      |
| `pnpm typecheck`   | Checks the types                                                                                  |
| `pnpm test`        | Runs the tests with coverage                                                                      |
| `pnpm build`       | Compiles the command of `@zigordev/stack`, and writes the dashboards and the alert rules as files |

## Where to read more

| You want to                                                  | Read                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Know what each shared service does, and how an app is served | [stack/README.md](stack/README.md)                                                               |
| Run it on a clean laptop, step by step                       | [docs/local-first-start.md](docs/local-first-start.md)                                           |
| Know how its work reaches production                         | [docs/cloud-first-deploy.md](docs/cloud-first-deploy.md)                                         |
| Use it from a product                                        | [docs/user-manual.md](docs/user-manual.md)                                                       |
| Know what to do when an alert fires                          | [docs/runbooks/](docs/runbooks/README.md)                                                        |
| Know why something was decided                               | [docs/adr/](docs/adr/README.md)                                                                  |
| Understand the whole platform, and every tool in it          | [The handbook in toolkit](https://github.com/zigordev/toolkit/blob/main/docs/handbook/README.md) |
