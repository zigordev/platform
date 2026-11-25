# 0026. The monthly restore test runs on the host

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

Toolkit's [record 0023](https://github.com/zigordev/toolkit/blob/main/docs/adr/0023-hourly-backups-and-a-monthly-restore-test.md) restores the newest dump once a month into a throwaway container, compares its row counts, and alerts when the last good restore is older than 35 days. It does not say where the test runs, nor what the counts are compared with.

An enterprise restores into an isolated place, away from production. Three places fit here: the host itself, a scheduled workflow on GitHub's machines, or a container task in AWS Fargate. Read on 2026-11-25: Fargate on Arm in Ireland costs $0.03238 per vCPU-hour and $0.00356 per GB-hour.

## Decision

A timer on the host runs `platform-backup restore-test` on the 1st of every month at 04:00 UTC, and an hour after every boot.

- For each running PostgreSQL that carries `com.zigordev.backup: postgres`, it takes the newest dump set that the hourly job marked complete.
- It restores the roles and every database into a throwaway container of the store's own image, with no network and 256 MB of memory.
- It compares each table's row count with the counts that the dump job took inside the same snapshot as the dump, then removes the container.
- It writes the time of the last good restore for the telemetry agent, the way the host reports each container's memory.

The host's role may read the bucket for it. The owner chose this on 2026-11-25.

## Consequences

- It costs nothing, and no dump leaves AWS.
- The comparison is exact, because the counts and the dump see the same snapshot. A dump that lost rows, or a restore that skipped some, fails the test.
- The host can read old dumps. It already holds the live data, so little more is exposed.
- The test proves that the dumps restore, not that the host can be rebuilt. The rebuild drill proves that, as step 3.9 did on 2026-11-24.
- The throwaway container takes 256 MB for a few minutes, at a quiet hour.
- The state of both jobs lives on the data disk, so a rebuilt host keeps the time of its last good dump and restore.

## Alternatives considered

- **A scheduled workflow on GitHub's machines.** It runs away from the host, on free minutes. The dumps hold personal data and password hashes, and they would leave AWS. The repo's logs are public, so nothing could ever print, and one more role would need to read the dumps.
- **A monthly task in AWS Fargate.** It runs away from the host and inside AWS, which is the closest to the enterprise way, for about a cent a month. It is a new service with about eight new pieces: a cluster, a task, two roles, a schedule, a network and its logs. Its result would need its own way into Grafana.
