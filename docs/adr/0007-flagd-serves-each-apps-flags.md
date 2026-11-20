# 0007. flagd serves each app's flags from its registry folder

- Status: accepted
- Date: 2026-11-20
- Supersedes: none

## Context

Toolkit ADR 0012 has apps read feature flags through OpenFeature, from flagd serving JSON kept in this repo, with a default and a removal date on every flag. It left open how the JSON is laid out. On 2026-11-20 the owner chose one file per app, beside the app's `app.yaml`, with each app reading only its own flags.

## Decision

- An app's flags live in `apps/<app>/flags.json`, in flagd's format. The file's `metadata.flagSetId` is the app's name, every flag has a `defaultVariant` and a `metadata.removeBy` date, and a strict schema rejects anything else. An app without flags has no file.
- `pnpm run check` fails on an invalid file, or on a flag past its removal date, so a stale flag blocks the next merge until it is removed or its date moves.
- One flagd serves every app's file. `pnpm local:up` writes the list of files to the git-ignored `local/.env`, which compose reads, so a new flags file recreates flagd with it. flagd reloads an edited file within seconds.
- An app scopes every request to its own flags with the selector `flagSetId=<app>`, set in its provider or sent as the `flagd-selector` header. A flag of another app answers `FLAG_NOT_FOUND`.
- flagd listens on `127.0.0.1`: evaluation over gRPC on 8013, health and metrics on 8014, sync for in-process providers on 8015, and OFREP over HTTP on 8016. It allows any origin locally, because it holds no secrets and listens only on the laptop.
- flagd sends its metrics to Alloy over OTLP, through the standard `OTEL_*` variables like the apps, and writes JSON logs. Its image has no shell or HTTP client, so compose cannot health-check it. `pnpm local:check` probes its health and readiness instead, and an alert on its metrics joins the dashboards.

## Consequences

- A flag change is a reviewed PR in this repo, scoped to one app's folder.
- Two apps may use the same flag key without clashing.
- flagd is the one container in the local platform without a compose healthcheck. Nothing waits for it: when flagd is down, an app's provider returns each flag's default.
- Production runs the same flagd and the same files once the host exists.

## Alternatives considered

- One shared file for every app: closest to toolkit ADR 0012's wording, but every app sees every flag, and every change touches the same file.
- One flagd per app: isolation without selectors, at the cost of a container per app.
- Each app reading its own file in-process, without flagd: no service to run, but a container in production would need the file mounted, and a change would reach it only through that mount.
- An image of our own that adds busybox's `wget` to flagd, for a compose healthcheck: it meets the healthcheck rule, at the cost of building and maintaining a copy of a third-party image.
