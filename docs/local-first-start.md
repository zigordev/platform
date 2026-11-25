# Run platform on a clean laptop

This page takes a laptop with nothing on it to a passing `pnpm check` and to the shared services running. It takes about twenty minutes, most of them downloads. `platform` needs no other repo on disk, no account and no secret.

## What you need first

| Thing          | Why                                                                                                          | How to get it                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| git            | To clone the repo                                                                                            | On a Mac it comes with the command line tools: `xcode-select --install`                                                             |
| mise           | It installs the exact versions of Node.js, pnpm, gitleaks, zizmor, OpenTofu and tflint that `mise.toml` pins | Follow [mise's getting started page](https://mise.jdx.dev/getting-started.html), including the step that activates it in your shell |
| Docker Desktop | It runs the shared services, and the check asks it to read the compose files                                 | Install it from [Docker's own page](https://docs.docker.com/desktop/) and start it. It needs about 8 GB of free disk for the images |

Nothing else is installed by hand. Node.js and pnpm come from mise, and every other tool comes from `pnpm install`.

## The steps

```bash
git clone https://github.com/zigordev/platform.git
cd platform
mise install
pnpm install
pnpm check
pnpm local:up
```

| Step            | What it does                                                                                                                                                                                                                          | How you know it worked                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `mise install`  | Installs the pinned tools for this folder. The first time, mise asks you to trust the repo's `mise.toml`: answer with `mise trust`                                                                                                    | `node --version` prints the version that `mise.toml` names                                          |
| `pnpm install`  | Installs the dependencies from the lockfile, and installs the git hooks                                                                                                                                                               | Its last lines say `sync hooks` and name `pre-commit`, `commit-msg` and `pre-push`                  |
| `pnpm check`    | Runs what the pipeline runs: lint, build, type check, and the tests with coverage                                                                                                                                                     | It ends with `check took` and a number of seconds, with no error above that line                    |
| `pnpm local:up` | Builds the dashboard files, starts the six shared services and waits until each one is healthy, sets up Kafka's topics and users, then pushes the dashboards and the alert rules. The first time, it downloads the images, about 6 GB | It ends with "The shared services are up:" and four addresses, and `http://grafana.localhost` opens |

One dependency is our own. `@zigordev/dev` holds the developer setup that every zigordev repo shares, and `pnpm install` takes it from the public npm registry like any other package.

## The shared services

| Address                    | What opens                                                             |
| -------------------------- | ---------------------------------------------------------------------- |
| `http://grafana.localhost` | Grafana, with every log line, trace and metric. It asks for no sign-in |
| `http://mail.localhost`    | Mailpit, with every email that was sent on this laptop                 |
| `http://traefik.localhost` | The routes the ingress knows                                           |
| `http://alloy.localhost`   | What the telemetry agent receives, and whether each part is healthy    |

In Grafana, the folder `zigordev` under Dashboards holds two dashboards: App, for one app picked from a list, and Platform, for the machine and the ingress. Under Alerting there are nine rules, which on a laptop notify nobody.

A name that ends in `.localhost` always means this laptop, so nothing has to be added to a hosts file. The services listen on port 80 of the laptop itself. For an app that runs as a process outside a container, the telemetry agent also listens on port 4318, and the Kafka broker on port 9094. None of these ports is reachable from the network the laptop is on.

`pnpm local:down` stops them and keeps their data. `pnpm local:reset` deletes the data too and starts again. [The package's own page](../stack/README.md) explains each service, and what to do when one does not start.

## Before your first commit

Every commit in a zigordev repo is made as zigordev. Set that once in this clone:

```bash
git config user.name zigordev
git config user.email zigordev@gmail.com
```

`gh` has to act as the same account. `gh config get user -h github.com` prints the account it uses.

The commit hook refuses a commit under another identity, so a mistake here shows at once.

## Working in it

| You want to                                   | Run                                                    |
| --------------------------------------------- | ------------------------------------------------------ |
| Check everything, as the pipeline does        | `pnpm check`                                           |
| Check faster, without coverage                | `pnpm check:quick`                                     |
| Fix the formatting                            | `pnpm format`                                          |
| Run one test file                             | `pnpm exec vitest run <path>`                          |
| Run one rule of the conformance check         | `pnpm exec zigordev check <rule>`                      |
| Bring the shared files at the root up to date | `pnpm exec zigordev sync`                              |
| Start, stop or empty the shared services      | `pnpm local:up`, `pnpm local:down`, `pnpm local:reset` |

A change starts with the `start-work` skill and ends with the `finish-work` skill. Both are in `.claude/skills/`, and they are short enough to follow by hand.

## When something fails

| What you see                                                   | What it means                                                                               | What to do                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node` is missing, or it is the wrong version                  | mise is not active in this shell                                                            | Activate mise as its getting started page says, then open a new shell                                                                              |
| `pnpm install` refuses a package as too new                    | pnpm waits one day before it accepts a new release. Our own `@zigordev` packages are exempt | Wait, or pin the release before it in `pnpm-workspace.yaml`                                                                                        |
| `pnpm install` reports a trust downgrade                       | A package's newest release was published with less proof than the one before                | Pin the earlier release, and look at why the publisher changed                                                                                     |
| A git hook does not run at all                                 | The hooks are not installed                                                                 | `pnpm install`                                                                                                                                     |
| `gitleaks` or `zizmor` is missing                              | The pinned tools are not installed                                                          | `mise install`                                                                                                                                     |
| `zigordev check` reports `shared`                              | A shared file in this repo differs from the copy inside `@zigordev/dev`                     | `pnpm exec zigordev sync`, then commit the result. The file itself is changed in `toolkit`, never here                                             |
| The tests fail with `spawnSync docker ENOENT`                  | The tests ask Docker Compose to read the compose files, and Docker is not installed         | Install Docker Desktop. It does not have to be running for the tests                                                                               |
| `pnpm local:up` says it cannot connect to the Docker daemon    | Docker is not running                                                                       | Start Docker Desktop                                                                                                                               |
| `pnpm local:up` fails on port 80, or a service stays unhealthy | Another program holds the port, or a container cannot start                                 | [The package's own page](../stack/README.md) lists each case                                                                                       |
| The disk fills up under `infra/` or `~/.cache/opentofu`        | OpenTofu keeps every provider version it ever fetched, and never deletes an old one         | Delete the folders `infra/*/.terraform` and the old versions in `~/.cache/opentofu/plugins`. The next `tofu init` fetches what the lock files name |
