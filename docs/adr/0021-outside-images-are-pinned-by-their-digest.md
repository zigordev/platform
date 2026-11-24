# 0021. Outside images are pinned by their digest

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

The plan says that only images our own pipeline built may run. GitHub attests each of our images when it is built, and the deploy refuses one without that build record.

The shared services run four images that other people build: Traefik, Grafana Alloy, socket-proxy and Cloudflare's connector. Products run PostgreSQL. Our pipeline builds none of them, so none has our build record. The enterprise way copies each one into our own registry, scans it and signs it, so that only signed images ever run.

On 2026-11-24 the owner was asked how these images should be trusted, with two options. They chose, in their words: "Pinned by digest (Recommended)".

## Decision

- Every image that our pipeline does not build is named with its digest in the compose files, as `name:tag@sha256:<digest>`.
- The host refuses a deploy that holds such an image without its digest.
- Renovate proposes each new version with its digest, after its one-day wait.
- The build-record check covers our own images only.

## Consequences

- A tag that is pushed again cannot change what runs. The digest names the exact contents.
- We trust each publisher's release, as the laptop already does.
- Renovate's settings in `toolkit` pin the digests in every repo's compose files.
- The shared services' compose files get their digests in the pull request that deploys them.

## Alternatives considered

- **Copy, scan and sign each image into GHCR.** One rule would cover every image, and a flawed image would never reach the host. But it needs a copy workflow to build and keep, and each new version waits for it.
