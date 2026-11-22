# platform

The infrastructure and the shared services of every zigordev product: the ingress, the telemetry agent, the dashboards and alerts, the host, the backups and the runbooks. It is the only repo that can change AWS, Cloudflare, GitHub's settings or Grafana Cloud. The core rules in `.claude/rules/core.md` apply here as everywhere.

## Where things live

| Path                       | What it holds                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `stack/`                   | `@zigordev/stack`: the shared services as `compose.yaml` and `compose.local.yaml`, and the command `zigordev-stack` |
| `stack/src`                | The command, and `compose.test.ts`, which holds every service to the container rules                                |
| `.claude/`                 | A copy of the shared rules, skills, hooks and permissions. `toolkit` owns them                                      |
| `.github/workflows/ci.yml` | The caller of the pipeline in `toolkit`, pinned to one commit of it                                                 |
| `test/`                    | The tests of the repo's own setup. `test/pipeline.test.ts` holds the caller to its shape                            |
| `docs/`                    | The standard docs, and the decision records in `docs/adr/`                                                          |
| `mise.toml`                | The pinned versions of Node.js, pnpm, gitleaks and zizmor                                                           |
| `pnpm-workspace.yaml`      | The workspace, the single version of each dependency, and the supply-chain settings                                 |

Three folders arrive with their steps of the build plan: `observability/` in phase 2, `infra/` and `host/` in phase 3.

## Commands

- `pnpm install` installs the dependencies and the git hooks.
- `pnpm check` runs what CI runs: lint, build, type check, and tests with coverage. It prints how long it took.
- `pnpm check:quick` runs the same without coverage. The push hook runs it.
- `pnpm format` fixes the formatting, the import order and the Markdown problems that have a safe fix.
- `pnpm exec vitest run <path>` runs one test file.
- `pnpm exec zigordev check [rule...] [file...]` runs the rules a machine can check, all of them or the ones named.
- `pnpm exec zigordev sync` copies the shared files from `@zigordev/dev` into this repo.
- `pnpm local:up` starts the shared services and waits until each is healthy. `pnpm local:down` stops them and keeps their data. `pnpm local:reset` deletes the data too.

## Rules of this repo

- Every change to AWS, Cloudflare, GitHub's settings or Grafana Cloud waits for the owner. Nothing there is changed by hand, and a session never runs an apply without a yes.
- A shared file is never edited here: `.claude/`, `lefthook.yml`, `.commitlintrc.json`, `.markdownlint-cli2.jsonc`, `renovate.json` and the pull request template. Change it in `toolkit`, then run `pnpm exec zigordev sync` here, or `pnpm check` fails.
- A version lives once, in the `catalog` of `pnpm-workspace.yaml`, as an exact version. `package.json` refers to it with `catalog:`.
- An entry under `overrides` in `pnpm-workspace.yaml` replaces a dependency of a dependency that has a known flaw, when the package that brings it in offers no fixed version. The entry goes when that package takes a fixed version itself.
- The pipeline is called at a commit of `toolkit` that a version tag names, with that version beside it. Renovate proposes the next one.
- The job named `check` is the required check in every repo. It is never renamed.
- Coverage counts the `src` folder of every top-level folder, with a floor of 90%.
- `stack/compose.yaml` holds what runs everywhere, and `stack/compose.local.yaml` what only the laptop has. Neither mounts a file from the package folder, and the agent's config in `ALLOY_CONFIG` holds no dollar sign. Record 0002 says why.
- A new shared service, or a new setting of one, comes with a line in `stack/src/compose.test.ts` and in `stack/README.md`. A service that cannot keep a container rule is named there as an exception, with the reason.
- A change to a compose file is tried for real with `pnpm local:up` before the pull request opens, and the pull request says what was seen.
- A new package starts with `"private": true`. It goes public only after the owner has run `zigordev first-publish` for it, which a session never runs without `--dry-run`.
- A decision about how this repo is built gets a record in `docs/adr/`, written with the `write-decision-record` skill, and a row in the index there. A decision that shapes the whole platform is recorded in `toolkit`.
- A tool the owner has agreed to gets its row in `toolkit`'s `docs/handbook/tools.md` before it is used here.
- Docker on the owner's laptop also holds other projects. Never stop, remove or reconfigure a container, a volume or an image that this repo did not create. A trial outside `pnpm local:up` uses a throwaway container whose name starts with `zigordev-probe-`.
