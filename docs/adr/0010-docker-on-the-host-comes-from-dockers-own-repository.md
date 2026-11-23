# 0010. Docker on the host comes from Docker's own repository

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

The host runs every container with Docker and Docker Compose, the same tools as the laptop. On 2026-11-23 two sources offer them for Ubuntu 26.04:

| Source                           | Version on 2026-11-23                     | Who patches it                                                                  |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Ubuntu's own package `docker.io` | 29.1.3, in the archive section `universe` | The community. Canonical covers `universe` only with an Ubuntu Pro subscription |
| Docker's repository for Ubuntu   | `docker-ce` 29.9.3, Compose plugin 5.8.0  | Docker                                                                          |

The laptop runs Docker 29.9.2. A new major version of Docker can drop old parts of its API, which the ingress and the telemetry agent read. The core rules say that a new major version waits a month and arrives as its own task.

On 2026-11-23 the owner accepted this record by answering "Merge" to the question whether to merge platform#26, which accepts records 0009 to 0011.

## Decision

- The host installs `docker-ce`, `docker-ce-cli`, `containerd.io` and `docker-compose-plugin` from `https://download.docker.com/linux/ubuntu`. Docker's signing key, fingerprint `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88`, is in git at `host/root/etc/apt/keyrings/docker.asc`, so the host never fetches it.
- `host/root/etc/apt/preferences.d/docker` holds each package to its major version: Docker 29, containerd 2 and Compose 5.
- The automatic updates install Docker's updates inside those versions every day, as they install Ubuntu's security updates. Docker's `live-restore` keeps the containers running while Docker restarts.
- A new major version is a pull request that moves the pin, a month after its release. It rebuilds the host, as [record 0009](0009-the-host-is-built-at-its-first-boot-and-rebuilt-on-a-change.md) says.

## Consequences

- The host runs the same Docker line as the laptop, and gets Docker's fixes within a day.
- Docker's repository is one more source the host trusts. The key in git limits that trust to packages Docker signed.
- When Docker publishes a new major version, nothing happens by itself. Someone has to notice it, which Renovate cannot do for an apt pin.

## Alternatives considered

- **Ubuntu's `docker.io`.** One source fewer, but eight minor versions behind on 2026-11-23, and in the section of the archive that Canonical patches only for subscribers.
- **Docker's repository with no pin.** No work at a major version, but a breaking release would reach the host unannounced, against the core rules.
- **Docker's script at `get.docker.com`.** Docker's quickest way, but it runs a script from the internet as root, and pins nothing.
