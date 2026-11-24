# 0020. The host records each deployed version in Parameter Store

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

The host needs to know which version of each target runs. It rolls back a bad deploy to the version before, and on a rebuilt host it brings every target back at its version. Enterprise deploy systems keep this record outside the machine.

On 2026-11-24 the owner was asked where the record should live, with three options: Parameter Store, the host's data disk, or GitHub's deployment history. They chose, in their words: "Parameter Store (Recommended)". AWS's pricing page said that day that standard parameters come "at no additional charge".

## Decision

- After a deploy passes every step, the host writes `/platform/deploy/<target>` as a String. It holds the commit, the verified images, the repo, the compose folder, the version before, and the time.
- Only the host writes it. The pipeline never reads or writes it.
- A rollback brings back the version before and records it, with no version before it.
- At boot, the host lists every record and brings back each target that runs no container.

## Consequences

- The record survives the loss of both the host and its data disk.
- AWS keeps the last 100 values of each record and logs every change.
- The host's role may read and write `/platform/deploy/` and nothing else there.
- GitHub's Deployments page in each repo also lists every deploy, because the deploy job runs in the environment `production`. Nothing reads it.

## Alternatives considered

- **The data disk.** It needs no AWS permission and works when AWS's API does not answer. But the record is lost with the disk until step 3.8's snapshots restore it, and it can be read only on the host.
- **GitHub's deployment history.** The record would sit where the owner already looks. But a rebuild would depend on GitHub answering, and the record shows what the pipeline saw, not what the host ran.
