# platform

The infrastructure and the shared services of every zigordev product: the ingress, the telemetry agent, the dashboards and alerts, the host, the backups and the runbooks. It is the only repo that can change AWS, Cloudflare, GitHub's settings or Grafana Cloud. The core rules in `.claude/rules/core.md` apply here as everywhere.

## Where things live

| Path                          | What it holds                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack/`                      | `@zigordev/stack`: the shared services as `compose.yaml` and `compose.local.yaml`, and the command `zigordev-stack`                                                                                                       |
| `stack/src`                   | The command, and `compose.test.ts`, which holds every service to the container rules                                                                                                                                      |
| `stack/observability/`        | The dashboard and alert files that gcx pushes. `pnpm build` writes them, and git ignores them                                                                                                                             |
| `observability/src`           | The dashboards and the alert rules as TypeScript, and `build.ts`, which writes those files                                                                                                                                |
| `infra/bootstrap`             | What an empty AWS account needs first: the state bucket and its key, GitHub's sign-in, the plan and apply roles, the budget alarm, the spending check and the GitHub environment `infrastructure`                         |
| `infra/bootstrap/tests`       | The stack's tests, which run against stand-ins for AWS and GitHub                                                                                                                                                         |
| `infra/github`                | GitHub's settings of every repo: merging, the ruleset on `main`, the environment `release`, the security settings, the workflow token and the label `destructive-migration`. It signs in as the GitHub App of record 0008 |
| `infra/github/tests`          | The stack's tests, which run against stand-ins for AWS and GitHub                                                                                                                                                         |
| `infra/host`                  | The host: its own network with no inbound rule, its role, the t4g.small on Ubuntu 26.04, the data disk, and the user data built from `host/root`                                                                          |
| `infra/host/tests`            | The stack's tests, which run as plans against a stand-in for AWS                                                                                                                                                          |
| `host/root`                   | The files the host gets at its first boot, each at the same path on the host: the setup script, Docker's settings, the automatic updates, the data disk's units and the timers                                            |
| `host/repair-first-boot`      | The script that AWS Systems Manager runs on the host to repair a first boot that missed its setup. It is POSIX `sh`, because Systems Manager runs it with `sh`                                                            |
| `infra/run.sh`                | Plans, checks for drift or applies every stack in `infra/`, the same way in the pipeline and in the drift check. It never applies the bootstrap                                                                           |
| `docs/runbooks/`              | One page for each alert, named after the alert                                                                                                                                                                            |
| `docs/`                       | The standard docs, and the decision records in `docs/adr/`                                                                                                                                                                |
| `.claude/`                    | A copy of the shared rules, skills, hooks and permissions. `toolkit` owns them                                                                                                                                            |
| `.github/workflows/ci.yml`    | The callers of the pipeline and of the release in `toolkit`, both pinned to one commit of it, and the job that starts the shared services                                                                                 |
| `.github/workflows/drift.yml` | The weekly check that every stack still matches its code                                                                                                                                                                  |
| `test/`                       | The tests of the repo's own setup. `test/pipeline.test.ts` holds the caller to its shape                                                                                                                                  |
| `mise.toml`                   | The pinned versions of Node.js, pnpm, gitleaks, zizmor, OpenTofu and tflint                                                                                                                                               |
| `pnpm-workspace.yaml`         | The workspace, the single version of each dependency, and the supply-chain settings                                                                                                                                       |

## Commands

- `pnpm install` installs the dependencies and the git hooks.
- `pnpm check` runs what CI runs: lint, build, type check, and tests with coverage. It prints how long it took.
- `pnpm check:quick` runs the same without coverage. The push hook runs it.
- `pnpm format` fixes the formatting, the import order and the Markdown problems that have a safe fix.
- `pnpm build` compiles the command of `@zigordev/stack` and writes the dashboard and alert files.
- `pnpm exec vitest run <path>` runs one test file.
- `pnpm exec zigordev check [rule...] [file...]` runs the rules a machine can check, all of them or the ones named.
- `pnpm exec zigordev sync` copies the shared files from `@zigordev/dev` into this repo.
- `pnpm exec zigordev release plan` says which public packages npm lacks at the latest tagged version. It changes nothing.
- `pnpm lint:infra` checks the OpenTofu code's format and runs tflint. `pnpm test:infra` runs the stacks' tests. Both need no AWS account, and `pnpm check` runs them.
- `pnpm local:up` builds, starts the shared services, waits until each is healthy, and pushes the dashboards and alert rules. `pnpm local:down` stops them and keeps their data. `pnpm local:reset` deletes the data too.

## Rules of this repo

- Every change to AWS, Cloudflare, GitHub's settings or Grafana Cloud waits for the owner. Nothing there is changed by hand, and a session never runs an apply without a yes.
- `infra/bootstrap` is applied from the laptop only, with the owner's AWS session and GitHub login, after the owner has said yes to that plan. Record 0005 says why. `docs/cloud-first-deploy.md` holds the commands.
- Every OpenTofu command against AWS names the profile, `AWS_PROFILE=platform-ops`. The GitHub provider takes the owner's login as `GITHUB_TOKEN="$(gh auth token)"` in the command itself, never from a file.
- An infrastructure change has a title that starts with `chore(infra)`, so that it releases no package.
- The pipeline plans every stack on every pull request with the read-only role, and applies a changed stack only after the owner approves the run in the environment `infrastructure`. A session never approves it, and never starts the drift check by hand without the owner's yes.
- A new stack is a folder in `infra/` with a `providers.tf`, its own `opentofu.tofu`, its state under its own key in the state bucket, and tests in its own `tests/`. `infra/run.sh` finds it by itself, and `pnpm lint:infra` and `pnpm test:infra` must cover it.
- `infra/github` signs in as the GitHub App of record 0008, whose key the owner keeps in Parameter Store. A new repo is one entry in its `local.repos`, once the owner has said yes to the repo. It never manages the environment `infrastructure`, which the bootstrap owns, nor the subject of GitHub's sign-in to AWS, which provider 6.13.0 cannot express.
- The pipeline builds each role's name from the secret `AWS_ACCOUNT_ID`, which the owner sets (record 0007). Never from a variable: GitHub prints a variable's value in the public logs.
- A file under `host/root` lands at the same path on the host, through the user data. A change to one of them rebuilds the host: the plan says the instance must be replaced, and the data disk stays. Record 0009 says why.
- A new host's first boot often misses its setup, because of a race in Canonical's image. The association `platform-host-repair-first-boot` restarts such a first boot, at most 3 times. Record 0013 says why. Never remove it while the image boots without its boot image.
- The data disk is never destroyed by code. `prevent_destroy` guards it, which is also why the host's tests run as plans only.
- The host's role reads no parameter until a step needs one, and then only that product's own path. AWS's managed policy `AmazonSSMManagedInstanceCore` is never attached, because it reads every parameter, the GitHub App's key included.
- Docker on the host comes from Docker's own repository, held to one major version in `host/root/etc/apt/preferences.d/docker`. A new major version is its own pull request, a month after its release. Record 0010 says why.
- A script of the host is bash, with a test in `test/` that runs it with stand-ins on `PATH`. It runs on Ubuntu's bash 5 on the host and on the laptop's bash 3.2 in its test, so it uses neither associative arrays nor `mapfile`.
- No account number, email address or other personal value goes into git. The code reads it from AWS, or from Parameter Store, where the owner stores it.
- A role that GitHub signs in to trusts GitHub's immutable subject, `repo:zigordev@261390829/<repo>@<repo id>:<context>`. `gh api repos/zigordev/<repo>/actions/oidc/customization/sub` prints the prefix. A tested trust that uses the old form fails without an error until a workflow signs in.
- Each stack sets its lowest OpenTofu version in its own `opentofu.tofu`, never as `required_version` in a `.tf` file, which OpenTofu ignores. Providers are pinned to one exact version, and `.terraform.lock.hcl` holds their hashes for macOS on Apple silicon and for Linux on x86 and Arm.
- A shared file is never edited here: `.claude/`, `lefthook.yml`, `.commitlintrc.json`, `.markdownlint-cli2.jsonc`, `renovate.json` and the pull request template. Change it in `toolkit`, then run `pnpm exec zigordev sync` here, or `pnpm check` fails.
- A version lives once, in the `catalog` of `pnpm-workspace.yaml`, as an exact version. `package.json` refers to it with `catalog:`.
- An entry under `overrides` in `pnpm-workspace.yaml` replaces a dependency of a dependency that has a known flaw, when the package that brings it in offers no fixed version. The entry goes when that package takes a fixed version itself.
- The pipeline and the release are called at one commit of `toolkit` that a version tag names, with that version beside it. Renovate proposes the next one, together with `@zigordev/dev`.
- A change to the shared services, the dashboards or the alert rules has a title that starts with `feat` or `fix`. Any other type releases nothing, so no product would receive the change.
- The job named `check` is the required check in every repo. It is never renamed.
- Coverage counts the `src` folder of every top-level folder, with a floor of 90%.
- `stack/compose.yaml` holds what runs everywhere, and `stack/compose.local.yaml` what only the laptop has. No service mounts a file from the package folder, and the agent's config in `ALLOY_CONFIG` holds no dollar sign. Record 0002 says why.
- A new shared service, or a new setting of one, comes with a line in `stack/src/compose.test.ts` and in `stack/README.md`. A service that cannot keep a container rule is named there as an exception, with the reason.
- A change to a compose file is tried for real with `pnpm local:up` before the pull request opens, and the pull request says what was seen. The pipeline's job "Shared services" starts them too, so an update that Renovate merges by itself was started once.
- An alert is one entry in `observability/src/alerts.ts`. It covers every app at once, names the app in its summary, and returns an answer only while it should fire. It has a runbook in `docs/runbooks/` under its own name, and it opens a panel that exists. The tests hold all of that.
- A dashboard query groups only by labels with a few known values, never by an id, an address or a raw path. A query of the App dashboard is about the picked app only. Run a new query against the local Grafana before it goes in.
- A panel keeps its number in `appPanels` or `platformPanels` for good, because alerts point at it. A new panel takes the next free number.
- A new package starts with `"private": true`. It goes public only after the owner has run `zigordev first-publish` for it, which a session never runs without `--dry-run`.
- The version in `stack/package.json` stays `0.0.0`. The release writes the tagged version when it packs. `zigordev release pack`, run by hand as a trial, changes the file too: put it back before a commit.
- A decision about how this repo is built gets a record in `docs/adr/`, written with the `write-decision-record` skill, and a row in the index there. A decision that shapes the whole platform is recorded in `toolkit`.
- A tool the owner has agreed to gets its row in `toolkit`'s `docs/handbook/tools.md` before it is used here.
- Docker on the owner's laptop also holds other projects. Never stop, remove or reconfigure a container, a volume or an image that this repo did not create. A trial outside `pnpm local:up` uses a throwaway container whose name starts with `zigordev-probe-`.
