# 0031. A rebuilt host keeps its images and brings products back side by side

- Status: accepted
- Date: 2026-11-26
- Supersedes: none

## Context

A change under `host/root` rebuilds the host, as record 0009 says. While a host is rebuilt, every product is away.

- On 2026-11-24, about 4 minutes passed between Docker starting on the new host and the playground answering.
- On 2026-11-25, the playground answered about 9 minutes after the new host was ready, about 12 minutes after the old one stopped.

Two facts made it slow:

- **Every image was downloaded again.** Docker 29 keeps its images in containerd's store, under `/var/lib/containerd`. That folder sat on the system disk, which a new host gets empty. Only Docker's volumes lived on the data disk.
- **One product waited for another.** At boot, `platform-deploy --redeploy-recorded` brought back the shared services, then each product in turn by name. So the playground waited for the notifications service.

On 2026-11-26 the owner was told that downloading is likely 2 to 3 of the 9 minutes, and that waiting in line costs about as much again. Asked to choose between keeping the images, adding parallel products, or neither, they chose, in their words: "Both changes".

## Decision

- **containerd's store lives on the data disk.**
  - `var-lib-containerd.mount` binds `/srv/data/containerd` to `/var/lib/containerd`, and `containerd.service` requires it.
  - `platform-data-disk` makes that folder at every boot, beside `docker-volumes`, and grows the file system to the size of the disk.
- **The data disk grows from 10 GB to 20 GB.**
- **At boot, the shared services come back first, then every product at the same time.** Each product runs in its own process, with its own work folder and its own lock, and its lines in the journal start with its name. The result lines stay as they are.
- **Docker's own folder stays on the system disk.** So a new host starts with no container, and the boot brings each one back from its recorded version, as before.

## Consequences

- From the second rebuild on, a new host downloads only the images it did not have. The rebuild that brings this change still downloads everything.
- A rebuild depends less on GitHub's image registry and Docker Hub being up.
- The data disk costs $0.88 more a month: 10 GB at $0.088 per GB-month in Ireland. Its daily snapshots grow by what the images add, a few tenths of a dollar a month, because each snapshot stores only what changed.
- containerd's store now outlives a host. A host that AWS stops shuts containerd down cleanly. A store that containerd cannot open stops Docker. Emptying `/srv/data/containerd` then loses only the copies of images, which the next deploy downloads again. `docs/cloud-first-deploy.md` holds the steps.
- `platform-docker-cleanup` already removes images unused for a week, so the store does not grow without end.
- The products' lines interleave in the journal at boot, each marked with its product's name.

## Alternatives considered

- **Download every product's images at once, then start them in order.** No disk to grow, but every rebuild still downloads everything, so it saves less.
- **Keep all of `/var/lib/docker` on the data disk too.** The containers would start by themselves through their restart policy. But a stopped host's containers would carry over into the new one, and the boot would skip every product as present, without checking it.
- **A cache of the image registry on the data disk.** Another service to run and update, for what containerd's own store already does.
- **Leave it as it is.** No change, but every rebuild keeps the products away for about 12 minutes, and the outside checks alert.
