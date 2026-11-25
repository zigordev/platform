# 0025. Data Lifecycle Manager snapshots the data disk every day

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

Toolkit's [record 0023](https://github.com/zigordev/toolkit/blob/main/docs/adr/0023-hourly-backups-and-a-monthly-restore-test.md) asks for a daily snapshot of the host's data disk, kept 7 days. The hourly dumps of [record 0024](0024-database-dumps-are-locked-for-30-days-and-nobody-can-lift-the-lock.md) are the safe copy, under a lock. A snapshot makes a rebuild faster, because it brings back the whole disk at once: every product's volumes, not one database at a time.

The data disk holds 10 GB. Read on 2026-11-25: a snapshot in Ireland costs $0.05 per GB-month for the blocks it stores, and each daily snapshot stores only the blocks that changed. AWS's guide says Data Lifecycle Manager, EBS's own snapshot scheduler, comes "at no additional cost". AWS Backup charges for the same storage, for restores and for copies between regions, and its Vault Lock is free.

## Decision

A Data Lifecycle Manager policy in `infra/backups` snapshots the volume tagged `Name = platform-data` once a day at 01:00 UTC, before the host's nightly restart at 03:00, and keeps the 7 newest. It acts through the role `platform-snapshots`, which holds AWS's own policy for it. The owner chose this on 2026-11-25.

## Consequences

- No service to run, and well under $1 a month at today's size.
- The snapshots have no lock. An administrator, a session or a thief with the owner's sign-in could delete them, and the locked dumps would still be there. Losing them costs speed, not data.
- A snapshot holds the disk as a power cut would leave it. PostgreSQL recovers from that by itself when it starts.
- A restore from a snapshot makes a new volume, which `infra/host` then has to adopt. Phase 7's drills write that runbook.
- Toolkit's handbook names Data Lifecycle Manager in its row for EBS.

## Alternatives considered

- **AWS Backup with Vault Lock in compliance mode**, the enterprise tool. It keeps the snapshots undeletable, like the dumps, for the same storage price. It needs about five resources instead of two, one more service to know, and its lock cannot be undone once its grace days pass.
- **A timer on the host that snapshots its own disk.** No new service. The host would need the right to delete snapshots, so a hacked host could erase them, and the timer would rebuild what Data Lifecycle Manager already does.
