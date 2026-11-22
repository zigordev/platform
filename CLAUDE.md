# platform

The infrastructure and the shared services of every zigordev product: the ingress, the telemetry agent, the dashboards and alerts, the host, the backups and the runbooks. It is the only repo that can change AWS, Cloudflare, GitHub's settings or Grafana Cloud. The core rules in `.claude/rules/core.md` apply here as everywhere.

## Where things live

| Path                       | What it holds                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `.claude/`                 | A copy of the shared rules, skills, hooks and permissions. `toolkit` owns them           |
| `.github/workflows/ci.yml` | The caller of the pipeline in `toolkit`, pinned to one commit of it                      |
| `test/`                    | The tests of the repo's own setup. `test/pipeline.test.ts` holds the caller to its shape |
| `docs/`                    | The standard docs, and the decision records in `docs/adr/`                               |
| `mise.toml`                | The pinned versions of Node.js, pnpm, gitleaks and zizmor                                |
| `pnpm-workspace.yaml`      | The single version of each dependency, and the supply-chain settings                     |

Four folders arrive with their steps of the build plan: `stack/` and `observability/` in phase 2, `infra/` and `host/` in phase 3.

## Commands

- `pnpm install` installs the dependencies and the git hooks.
- `pnpm check` runs what CI runs: lint, build, type check, and tests with coverage. It prints how long it took.
- `pnpm check:quick` runs the same without coverage. The push hook runs it.
- `pnpm format` fixes the formatting, the import order and the Markdown problems that have a safe fix.
- `pnpm exec vitest run <path>` runs one test file.
- `pnpm exec zigordev check [rule...] [file...]` runs the rules a machine can check, all of them or the ones named.
- `pnpm exec zigordev sync` copies the shared files from `@zigordev/dev` into this repo.

## Rules of this repo

- Every change to AWS, Cloudflare, GitHub's settings or Grafana Cloud waits for the owner. Nothing there is changed by hand, and a session never runs an apply without a yes.
- A shared file is never edited here: `.claude/`, `lefthook.yml`, `.commitlintrc.json`, `.markdownlint-cli2.jsonc`, `renovate.json` and the pull request template. Change it in `toolkit`, then run `pnpm exec zigordev sync` here, or `pnpm check` fails.
- A version lives once, in the `catalog` of `pnpm-workspace.yaml`, as an exact version. `package.json` refers to it with `catalog:`.
- The pipeline is called at a commit of `toolkit` that a version tag names, with that version beside it. Renovate proposes the next one.
- The job named `check` is the required check in every repo. It is never renamed.
- Coverage counts the `src` folder of every top-level folder, with a floor of 90%.
- A decision about how this repo is built gets a record in `docs/adr/`, written with the `write-decision-record` skill, and a row in the index there. A decision that shapes the whole platform is recorded in `toolkit`.
- A tool the owner has agreed to gets its row in `toolkit`'s `docs/handbook/tools.md` before it is used here.
- Docker on the owner's laptop also holds other projects. Never stop, remove or reconfigure a container, a volume or an image that this repo did not create.
