# 0017. The shared services reach the host through the deploy path

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

The host runs every product beside the shared services: the ingress Traefik, the Docker proxy, the telemetry agent Alloy and Cloudflare's connector `cloudflared`. On the laptop they come from the package `@zigordev/stack`. On 2026-11-24 the host ran Docker with no container yet.

Step 3.6 of the build plan tests that "the host's metrics and logs show in Grafana Cloud", which needs Alloy on the host. Step 3.7 builds the deploy path, which starts one version of an app on the host, checks its health and rolls back a bad one. Nothing starts containers on the host before it.

On 2026-11-24 the owner was asked how the shared services should reach the host, with two options, and chose, in their words: "Through the deploy path (Recommended)".

## Decision

- The shared services reach the host through step 3.7's deploy path, as any product does: one version at a time, with its health checked and a rollback.
- Step 3.6 builds Grafana Cloud as code first. Its test passes once step 3.7 runs the shared services on the host.
- The host's setup in `host/root` starts no container itself.

## Consequences

- One way runs containers on the host, with versions and rollback for the shared services too.
- A new version of Traefik or Alloy is a deploy, not a rebuild of the host.
- Step 3.6's test waits for step 3.7.

## Alternatives considered

- **The host starts the shared services at boot**, from the version written in its setup. Step 3.6's test would pass sooner, but every new version of the bundle would rebuild the host, with minutes of downtime, as [record 0009](0009-the-host-is-built-at-its-first-boot-and-rebuilt-on-a-change.md) says, and it would be a second way to run containers.
