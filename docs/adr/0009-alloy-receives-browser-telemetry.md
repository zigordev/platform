# 0009. Alloy receives browser telemetry

- Status: accepted
- Date: 2026-11-20
- Supersedes: none

## Context

Toolkit ADR 0016 sends real user monitoring through Grafana Faro, with Alloy as the only agent and one Alloy config for the laptop and production. The local platform had no way to receive a browser's telemetry, so web apps could not try Faro locally. Alloy also read its config only at start, so a change to `stack/alloy/config.alloy` reached a running local stack only after someone restarted Alloy by hand.

## Decision

- Alloy runs a `faro.receiver` in the shared config. It listens on port 12347, published on `127.0.0.1` locally, and browsers post to `/collect`.
- Browser logs go to Loki as JSON, labelled `source="faro"` and `service_name=<app name>`, so they sit beside each app's server logs. Browser traces join the same OTLP pipeline as the apps' traces.
- The allowed origins come from `FARO_ALLOWED_ORIGINS`, a comma-separated list. Locally it is `*`, because the port listens only on the laptop.
- Sourcemaps are never downloaded, because a download URL comes from the browser and would let anyone make Alloy fetch an internal address. Rate limiting stays on, at 50 requests a second with bursts of 100.
- `pnpm local:up` writes the config's SHA-256 to `local/.env` as `ALLOY_CONFIG_SHA`, which compose passes to Alloy, so a changed config recreates Alloy on the next `pnpm local:up`.

## Consequences

- A web app tries Faro locally against the same receiver production will run, and its browser logs and traces show in Grafana beside its server's.
- Production still needs a public route from browsers to the receiver, or Faro pointed at Grafana Cloud's own collector. That choice comes with the host.
- Every config change recreates Alloy once, which restarts its log tailing. It resumes from the positions kept in its data volume.

## Alternatives considered

- Faro straight to Grafana Cloud's collector, and a separate receiver locally: production gets Grafana's frontend app at once, but the laptop and production would no longer share Alloy's config.
- A route in each app that forwards Faro payloads: no new port, but every app carries the same proxy code.
- Restarting Alloy by hand after a config change: nothing to build, and easy to forget, which leaves the local stack on the old config with no sign of it.
