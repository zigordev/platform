# platform

The infrastructure and the shared services of every zigordev product: the ingress, the telemetry agent, the dashboards and alerts, the host, the backups and the runbooks. It is the only repo that can change infrastructure.

The repo is being built step by step, and each step arrives as its own pull request. This page describes what exists today, which is the repo itself: its tools, its rules, its pipeline and its docs. The shared services arrive with the next step.

## What it is

| Path                       | What it holds                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/`                 | The rules, skills, hooks and permissions that every Claude Code session works under. They are a copy of the ones in `toolkit`                |
| `CLAUDE.md`                | What a session needs to know about this repo: where things live, its commands and its own rules                                              |
| `mise.toml`                | The pinned versions of Node.js, pnpm, gitleaks and zizmor                                                                                    |
| `pnpm-workspace.yaml`      | The single version of each dependency, and the supply-chain settings                                                                         |
| `.github/workflows/ci.yml` | The pipeline of this repo. It is a short caller of the pipeline that `toolkit` holds, so this repo is checked exactly as every other repo is |
| `test/`                    | The tests of the repo's own setup. The first one holds the pipeline caller to its agreed shape                                               |
| `docs/`                    | The standard docs and the decision records                                                                                                   |

Four more folders arrive as the platform is built:

| Folder           | What it will hold                                                                                                                             | Arrives in |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `stack/`         | The shared services as Docker Compose files: the ingress, the telemetry agent, and the Grafana and the mail catcher that only the laptop runs | Phase 2    |
| `observability/` | The standard dashboards and the alert rules, as code                                                                                          | Phase 2    |
| `infra/`         | AWS, Cloudflare, GitHub and Grafana Cloud, described as code                                                                                  | Phase 3    |
| `host/`          | What the host runs at boot and on a deploy: its setup, the deploy script, the backups and the cleanup timers                                  | Phase 3    |

The phases are the eight steps in which the whole platform is built. [The handbook in toolkit](https://github.com/zigordev/toolkit/blob/main/docs/handbook/README.md) lists them and explains every piece.

## Why it exists

Every product needs the same things around it: something that routes a request to it, something that collects its logs, traces and metrics, a machine to run on, and backups. Keeping all of that in one repo means a product repo holds the product and nothing else.

It also draws one line that is easy to check. Only this repo can change AWS, Cloudflare, GitHub's settings or Grafana Cloud, so every such change is one pull request in one place, and each one waits for the owner's approval.

## What it is built with

| Tool                         | What it does here                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [mise](https://mise.jdx.dev) | Installs the exact Node.js, pnpm, gitleaks and zizmor versions that `mise.toml` pins                                                                                                                                     |
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
| Renovate                     | Opens a pull request for each newer version of a package, a tool or an action. It merges patch and minor updates by itself, on weekdays between 08:00 and 18:00                                                          |
| Claude Code                  | Does the building, under the rules, skills and hooks in `.claude/`                                                                                                                                                       |

It needs no other repo on disk and, today, no running service.

## Quick start

Install [mise](https://mise.jdx.dev/getting-started.html) and activate it in your shell. Then:

```bash
git clone https://github.com/zigordev/platform.git
cd platform
mise install
pnpm install
pnpm check
```

`mise install` installs the pinned tools. `pnpm install` installs the dependencies and the git hooks. `pnpm check` runs the full check, and on a clean clone it must end with `check took` and a number of seconds, with no error above it.

| Command            | What it does                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm check`       | The full check: lint, build, type check, and tests with coverage. It prints how long it took |
| `pnpm check:quick` | The part of the check that needs no containers. The push hook runs it                        |
| `pnpm format`      | Fixes the formatting, the import order and the Markdown problems that have a safe fix        |
| `pnpm lint`        | Reports lint and formatting problems without changing a file                                 |
| `pnpm typecheck`   | Checks the types                                                                             |
| `pnpm test`        | Runs the tests with coverage                                                                 |
| `pnpm build`       | Builds what has to be built before it is used. Today that is nothing                         |

## Where to read more

| You want to                                         | Read                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Run it on a clean laptop, step by step              | [docs/local-first-start.md](docs/local-first-start.md)                                           |
| Know how its work reaches production                | [docs/cloud-first-deploy.md](docs/cloud-first-deploy.md)                                         |
| Use it from a product                               | [docs/user-manual.md](docs/user-manual.md)                                                       |
| Know why something was decided                      | [docs/adr/](docs/adr/README.md)                                                                  |
| Understand the whole platform, and every tool in it | [The handbook in toolkit](https://github.com/zigordev/toolkit/blob/main/docs/handbook/README.md) |
