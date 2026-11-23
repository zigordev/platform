# 0009. The host is built at its first boot, and rebuilt on a change

- Status: proposed
- Date: 2026-11-23
- Supersedes: none

## Context

Step 3.4 of the build plan adds the one server that runs every product: a t4g.small on Ubuntu 26.04 LTS. The plan asks that it is built from code and holds nothing made by hand, so that it can be thrown away and rebuilt within 1 hour.

cloud-init, which every Ubuntu image runs at boot, applies the server's user data once, at the first boot of an instance. A later change to the user data does nothing on a running server unless the server is replaced. Before the restart, the old host's user data wrote a cleanup job into a folder that did not exist yet, so the job never ran and the disk filled to 94% on 2026-09-21.

## Decision

- Every file the host needs sits under `host/root`, at its path on the host. The stack `infra/host` writes all of them through the user data, and the script `platform-setup` runs once at the first boot.
- `user_data_replace_on_change` is on. A change to any file under `host/root` replaces the instance, and the plan says "must be replaced" before the owner approves it.
- The data lives on its own disk, `platform-data`: 10 GB of encrypted gp3, guarded by `prevent_destroy`. A new host attaches it, mounts it at `/srv/data`, and keeps Docker's volumes on it at `/srv/data/docker-volumes`. Docker does not start without it.
- The image is Canonical's newest Ubuntu 26.04 LTS for arm64 at the moment the host is built. A newer image does not rebuild the host, and the first boot installs every update anyway.

## Consequences

- Every change to the setup takes the rebuild path, which the 1-hour target needs to work anyway.
- A change to the setup stops every container for a few minutes: the old host stops, and the new one boots, installs Docker and attaches the disk. Step 3.7 redeploys the apps after a rebuild, and decides whether a deploy also applies the setup in place.
- Nothing on the host drifts from the code for long, because what is not under `host/root` is gone at the next rebuild.
- AWS takes at most 16 KB of user data. On 2026-11-23 it holds about 11 KB, and a test fails above the limit.

## Alternatives considered

- **Change the running host in place**, with AWS Systems Manager's State Manager or with Ansible. A change costs no downtime, but the host's state then depends on its history, and it adds a tool.
- **A baked image**, built with Packer or EC2 Image Builder. The enterprise way: boots in seconds, and every host runs a tested image. It needs its own pipeline, an image store and a new tool, and each image is a snapshot billed at $0.05 per GB a month in Ireland.
- **Follow every new Canonical image.** Always fresh, but a rebuild with downtime every few weeks, and the weekly drift check would fail each time.
