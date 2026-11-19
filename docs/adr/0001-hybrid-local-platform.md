# 0001. The local platform runs shared services in Docker and apps as processes

- Status: accepted
- Date: 2026-11-19
- Supersedes: none

## Context

The legacy estate mirrored production on the laptop: seven stacks, 31 containers, a Docker VM starved of memory, and an image rebuild for every change. The rebuild plan keeps the local platform small and runs apps natively. Production stays Docker Compose on one host, applied by doco-cd (toolkit ADRs 0014 and 0015). On 2026-11-19 the owner weighed mirroring production against a hybrid, and chose the hybrid.

## Decision

- `pnpm local:up` starts four containers on the `zigordev` network: PostgreSQL 18, Mailpit, Alloy and otel-lgtm. It waits until they are healthy, then provisions the apps' databases. `pnpm local:down` and `pnpm local:reset` stop it, or wipe and restart it, under the estate's standard command names.
- Every port listens on `127.0.0.1`: PostgreSQL on 5432, Mailpit on 1025 and 8025, Alloy's OTLP on 4317 and 4318, and Grafana on 3300, so that 3000 stays free for Next.js apps.
- Apps run with `pnpm dev`, reaching the services through the same settings they get in production.
- Alloy runs `stack/alloy/config.alloy`, the file production will run. Only environment variables tell the destinations apart, and the local credentials are placeholders that otel-lgtm ignores.
- Alloy reads logs only from containers on the `zigordev` network.

## Consequences

- The daily loop keeps hot reload and a debugger, on four small containers.
- Parity covers the database major, the migrations, the telemetry pipeline and the settings, not the process model. CI's image tests and an opt-in run of an app's production compose file cover the container itself, once the image workflow exists.
- PostgreSQL runs as `postgres` and Mailpit as a non-root user. Alloy runs as root, because it reads the Docker socket to tail container logs. otel-lgtm runs as root, because it is an all-in-one development image that never reaches production.
- Without the network filter, Alloy read every container on the laptop, including unrelated work containers, and tried to ship their logs. The filter keeps it to the estate's own containers, locally and in production.

## Alternatives considered

- Mirroring production with every app in a container: the most parity, at the legacy cost in memory and rebuilds.
- `mise run up`, as the plan wrote it: every other repo starts its local stack with `pnpm local:up`.
- Grafana on 3000: otel-lgtm's own default, but it clashes with the first Next.js dev server.
