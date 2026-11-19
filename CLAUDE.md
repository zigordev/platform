# platform

Where every zigordev app runs, described in code. The estate rules in toolkit's `claude/estate.md` apply here as everywhere.

## Layout

- `local/compose.yaml`: the local platform. Its project is `platform-local`, its containers are named `platform-*`, and its network is `zigordev`.
- `stack/alloy/config.alloy`: the Alloy pipeline for both the local platform and production. Only environment variables differ.
- `apps/<app>/app.yaml`: the registry. An app's folder is named after the app.
- `src/` holds the registry reader and the database provisioning, `scripts/` the commands that run them, and `test/` the test setup and the local stack check.
- `infra/<stack>/`: OpenTofu stacks. `infra/bootstrap/` keeps the state bucket, the state key and the CI roles.
- `docs/adr/`: this repo's decision records. The estate-wide ones live in toolkit.

## Commands

- `pnpm install` installs the tools and the git hooks. It needs `NODE_AUTH_TOKEN` for `@zigordev/*`, as `docs/local-first-start.md` shows.
- `pnpm local:up`, `pnpm local:down` and `pnpm local:reset` start, stop, or wipe and restart the local platform. `pnpm local:check` probes the running platform.
- `pnpm run check` runs what CI's `Node / Check` runs: lint, typecheck and the tests with coverage. The tests start PostgreSQL containers, so Docker has to be running.

## Rules

- The platform's containers, volumes and network are its own. Never stop, recreate or reconfigure a container outside the `platform-local` project.
- Alloy reads logs only from containers on the `zigordev` network. Keep that filter, so no other container's logs are read.
- Images are pinned to exact versions, at least three days old, and Renovate proposes their updates.
- `overrides` in `pnpm-workspace.yaml` lifts `glob` to 14.0.2, because testcontainers' archiver and otel's GCP detector still pin `glob` 10, which carries GHSA-3g3m-2fjr-6pw4. Remove the override once both resolve a patched `glob` on their own.
- OpenTofu, tflint, trivy, sops and age come from `mise.toml`. Run them as `mise exec -- tofu ...`, with `AWS_PROFILE=platform-ops` for the zigordev account.
- Each stack states the lowest OpenTofu version it accepts in `opentofu.tofu`, with a `language` block that OpenTofu checks at `init`. OpenTofu ignores `required_version` in `.tf` files, so no stack sets it, and no stack has a `versions.tofu`, which would hide `versions.tf` ([ADR 0004](docs/adr/0004-opentofu-version-floor.md)).
- `tofu plan` reads, so it may run any time. `tofu apply`, and any change to AWS, GitHub environments or Cloudflare, waits for the owner's OK every time.
- Cloud resources are prefixed `platform-`. The legacy `platform-ops-*` resources in the same account are never read into a stack, changed or imported.
- A new decision gets a record in `docs/adr/` from the template, with the next number, in the same PR.
