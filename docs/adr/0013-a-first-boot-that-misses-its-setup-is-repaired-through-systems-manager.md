# 0013. A first boot that misses its setup is repaired through Systems Manager

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

[Record 0009](0009-the-host-is-built-at-its-first-boot-and-rebuilt-on-a-change.md) builds the host from its user data at its first boot. The first host, `i-01373656405e78363`, started on 2026-11-23 at 21:46:59 UTC and got none of it:

- Canonical's Ubuntu 26.04 image, serial 20261120 with kernel 7.0.0-1018-aws and cloud-init 26.2, starts without its boot image. The network driver therefore loads from the root disk.
- A new disk is made from a snapshot, and AWS copies each block from storage on its first read, so loading the driver took until second 10.
- cloud-init's first stage ran at second 6, found no network card, and wrote no network settings. The network stayed down for 6 minutes, and cloud-init went on with no data source: no setup, no Docker, no timers.
- The agent of Systems Manager still reported once the network came up, and no port answered from outside.

Every new host starts from a new disk, so every rebuild can meet the same race. A restart reads a disk whose blocks are already copied.

On 2026-11-24 the owner was asked how a new host should recover when its first boot misses its setup, with four options, and chose, in their words: "Repair through AWS".

## Decision

- The command document `platform-host-repair-first-boot` runs `host/repair-first-boot` under `sh`.
- A State Manager association of the same name runs it on every instance tagged `Name=platform-host`, as soon as the instance reports to Systems Manager and every 30 minutes after.
- When cloud-init's instance id is `iid-datasource-none`, the script clears cloud-init and restarts the host a minute later, so the next boot runs as a first boot. On any other host it does nothing.
- It restarts the host at most 3 times, counted in `/var/lib/platform-repair/restarts`, and then fails, so a person looks.

## Consequences

- A rebuild needs no hand work again: when the race hits, the host is ready after about 15 minutes instead of 5.
- The cause stays in Canonical's image. A later image may fix it, and then the repair simply never acts.
- State Manager costs nothing on EC2: AWS's pricing page lists it with "No additional charges".
- The association writes one line to its history every 30 minutes, on a host that needs nothing.

## Alternatives considered

- **Systems Manager applies the whole setup** instead of the user data. A change to the setup would then no longer replace the host, but it replaces record 0009, and the host's state would depend on its history.
- **Bake our own image** with EC2 Image Builder or Packer, the enterprise way. No setup is fetched at boot, and the boot can wait for the network card. It needs a build pipeline and a new tool, and it is the largest change of the four.
- **Restart the host by hand** when it happens. Nothing to build, but every rebuild would need a person, against the plan's rebuild with no manual step.
