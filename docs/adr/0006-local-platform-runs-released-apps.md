# 0006. The local platform runs the apps other apps call, from their released images

- Status: accepted
- Date: 2026-11-20
- Supersedes: 0001, for which containers the local platform runs

## Context

ADR 0001 kept the local platform to four shared services and ran every app on the host with `pnpm dev`. An app that sends email then needed notifications cloned, installed and running in a second terminal on port 3001, with its producer key added to that clone's `.env.local`. On 2026-11-20 the owner chose Docker Compose for every local container, and the platform as the place for the apps other apps call, while the app being edited stays on the host (toolkit ADR 0035).

## Decision

- `local/compose.yaml` runs notifications-api from its released image, pinned by tag and digest, after a migration job from the same image. Renovate proposes each new release at once, as the shared preset does for the estate's own images.
- `pnpm local:up` starts PostgreSQL, provisions the databases and the producer keys, then starts every other container and waits until each one is healthy.
- notifications-api listens on `127.0.0.1:3001`, delivers to Mailpit, sends traces and metrics to Alloy, and logs to stdout, which Alloy tails. It runs as its image's non-root user, read-only, with `init`, no capabilities, its image's healthcheck and a 30-second stop grace period.
- Producer keys live in the git-ignored `local/notifications-producers.json`, as callers send them. Provisioning writes their SHA-256 hashes to the git-ignored `local/notifications-api.env`, which the service reads as `PRODUCERS`. `pnpm local:producer-key <app> <sender>` adds or updates a producer and prints its key. A `local-dev` producer, sending as `dev@zigordev.test`, always exists, for trying the service by hand and for the stack check.
- The app's version appears only in its image tag, so a Renovate bump is the only edit a release needs.
- To work on notifications itself, the platform's container is stopped, and the working copy takes its port.

## Consequences

- An app sends email locally with the platform alone: no notifications clone, no second terminal, no toolchain for notifications.
- The local stack runs five long-running containers instead of four, plus a migration job that exits. notifications-api uses about 230 MiB.
- The platform keeps every local producer's key in one file. It never leaves the laptop, and production keeps only the hashes, in SOPS.
- The image does not carry its version, so traces from it have no `service.version` locally.
- The image is public on GHCR, so `pnpm local:up` pulls it without a token.
- A migration that a working copy of notifications applies stays in the shared database, ahead of the released image, until that release lands.

## Alternatives considered

- Keep running notifications from its repo: every app that sends email needs a clone, a terminal and the notifications toolchain.
- An opt-in compose profile for app containers: the default stack stays at four containers, but every caller has to remember the flag.
- `docker run` commands: long, easy to get wrong, and nothing updates the pinned image.
- Hashes kept by hand in an env file, with a committed example: every new producer would need a hash computed and pasted, and a fresh clone would fail to start until someone filled the file in. Provisioning creates the file on the first run instead.
- `OTEL_SERVICE_VERSION` beside the image tag: Renovate updates the tag but not the setting, so the two would drift after the first bump.
