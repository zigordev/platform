# platform

Where every zigordev app runs, described in code. The estate rules in toolkit's `claude/estate.md` apply here as everywhere.

## Layout

- `local/compose.yaml`: the local platform. Its project is `platform-local`, its containers are named `platform-*`, and its network is `zigordev`. Besides the shared services, it runs the apps other apps call from their released images: notifications-api, after its migration job ([ADR 0006](docs/adr/0006-local-platform-runs-released-apps.md)).
- `local/notifications-producers.json` holds the local producer keys, and `local/notifications-api.env` their hashes for notifications-api. Both are git-ignored and written by the scripts.
- `stack/alloy/config.alloy`: the Alloy pipeline for both the local platform and production. Only environment variables differ.
- `apps/<app>/app.yaml`: the registry. An app's folder is named after the app. `apps/<app>/flags.json` holds the app's feature flags, which flagd serves to that app only ([ADR 0007](docs/adr/0007-flagd-serves-each-apps-flags.md)).
- `local/.env` holds the list of flags files that compose passes to flagd. It is git-ignored and written by `pnpm local:up`.
- `src/` holds the registry reader, the database provisioning, the flags reader and the local producer keys, `scripts/` the commands that run them, and `test/` the test setup and the local stack check.
- `infra/<stack>/`: OpenTofu stacks. `infra/bootstrap/` keeps the state bucket, the state key and the CI roles.
- `docs/adr/`: this repo's decision records. The estate-wide ones live in toolkit.

## Commands

- `pnpm install` installs the tools and the git hooks. It needs `NODE_AUTH_TOKEN` for `@zigordev/*`, as `docs/local-first-start.md` shows.
- `pnpm local:up`, `pnpm local:down` and `pnpm local:reset` start, stop, or wipe and restart the local platform. `pnpm local:check` probes the running platform.
- `pnpm local:producer-key <app> <sender> [sender ...]` adds or updates a local notifications producer and prints its key. `pnpm local:up` applies it.
- `pnpm run check` runs what CI's `Node / Check` runs: lint, typecheck and the tests with coverage. The tests start PostgreSQL containers, so Docker has to be running.

## Rules

- The platform's containers, volumes and network are its own. Never stop, recreate or reconfigure a container outside the `platform-local` project.
- Alloy reads logs only from containers on the `zigordev` network. Keep that filter, so no other container's logs are read.
- A flags file's `flagSetId` is its app's name, and every flag has a `defaultVariant` and a `removeBy` date. `pnpm run check` fails on a flag past its date: remove it, or move the date in the same PR.
- flagd's image has no shell or HTTP client, so it is the one container without a compose healthcheck. `pnpm local:check` probes its health and readiness.
- Images are pinned to exact versions, at least three days old, and Renovate proposes their updates. The estate's own images from `ghcr.io/zigordev` are pinned by tag and digest and follow their releases at once (toolkit ADR 0035).
- An app runs here only from its released image, never from a working copy. Its migration job runs first from the same image, and its version appears only in the image tag, so a Renovate bump is the only edit a release needs.
- Try a compose change under another project name, with an extra compose file that overrides `container_name`, the ports (`!override`) and the network name, so the running `platform-local` containers are never touched.
- `overrides` in `pnpm-workspace.yaml` lifts `glob` to 14.0.2, because testcontainers' archiver and otel's GCP detector still pin `glob` 10, which carries GHSA-3g3m-2fjr-6pw4. Remove the override once both resolve a patched `glob` on their own.
- OpenTofu, tflint, trivy, sops and age come from `mise.toml`. Run them as `mise exec -- tofu ...`, with `AWS_PROFILE=platform-ops` for the zigordev account.
- Each stack states the lowest OpenTofu version it accepts in `opentofu.tofu`, with a `language` block that OpenTofu checks at `init`. OpenTofu ignores `required_version` in `.tf` files, so no stack sets it, and no stack has a `versions.tofu`, which would hide `versions.tf` ([ADR 0004](docs/adr/0004-opentofu-version-floor.md)).
- `tofu plan` reads, so it may run any time. `tofu apply`, and any change to AWS, GitHub environments or Cloudflare, waits for the owner's OK every time.
- The Tofu workflow's Apply job applies merged changes after the owner approves the plan in the `production` environment. A laptop apply is only for the bootstrap's CI roles, when CI cannot apply them itself ([ADR 0005](docs/adr/0005-merges-apply-the-approved-plan.md)).
- GitHub signs this repo's tokens with immutable subjects, `repo:zigordev@261390829/platform@1464253077:...`. An AWS trust policy for GitHub's sign-in names that form, never `repo:zigordev/platform:...`, which never matches.
- Cloud resources are prefixed `platform-`. The legacy `platform-ops-*` resources in the same account are never read into a stack, changed or imported.
- A new decision gets a record in `docs/adr/` from the template, with the next number, in the same PR.
