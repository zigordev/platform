# 0024. Database dumps are locked for 30 days, and nobody can lift the lock

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

Toolkit's [record 0023](https://github.com/zigordev/toolkit/blob/main/docs/adr/0023-hourly-backups-and-a-monthly-restore-test.md) dumps every database to S3 each hour and keeps a dump for 30 days. Toolkit's [record 0035](https://github.com/zigordev/toolkit/blob/main/docs/adr/0035-labels-tell-the-platform-what-a-service-is.md) says how the host makes the dumps, and that the bucket is private and encrypted with its own key. Neither says how hard it is to delete a dump.

A dump can be lost to a bug in the job, to a hacked host, to a mistake by a session or the owner, or to someone who steals the owner's AWS sign-in. An enterprise keeps its backups in a separate AWS account, under a lock that nobody can lift. Here there is one account.

The facts, read on 2026-11-25. In S3 Object Lock's compliance mode, AWS's guide says a locked version "can't be overwritten or deleted by any user, including the root user". S3's price page lists no charge for the lock. Storage in Ireland costs $0.023 per GB-month, an upload $0.005 per 1,000, and the key $1 a month.

## Decision

The bucket `zigordev-platform-backups` holds S3 Object Lock in compliance mode, with a default retention of 30 days, and versioning on. Every dump is locked for 30 days from its upload.

- A lifecycle rule expires a dump after 30 days, and removes the expired version a day later.
- The host may add, read and list dumps. It may never delete one, change a lock or touch the bucket's settings.
- The bucket and its key, `alias/platform-backups`, are never destroyed by code.

The owner chose this on 2026-11-25.

## Consequences

- For 30 days nobody can delete or overwrite a dump: not the host, a session, the owner, or a thief with the owner's sign-in.
- A dump written by mistake stays, and is billed, for its 30 days. A person's deleted data stays in the dumps for up to 31 days, as toolkit's record 0023 already accepts.
- The bucket cannot be deleted while it holds a locked dump.
- One gap stays: a thief with administrator rights could order the key deleted, which would make the dumps unreadable. AWS stops using a key as soon as its deletion is ordered. So the next dumps fail, and the stale-dump alert fires within 2 hours. AWS then waits at least 7 days before it deletes the key, so the order can be cancelled.
- The copy outside AWS that toolkit's record 0023 plans for gpool's data covers the loss of the account itself.

## Alternatives considered

- **Governance mode.** The same lock, but an administrator who sends a bypass flag can delete early. It stops mistakes and a hacked host, not a thief with the owner's sign-in.
- **No lock, a host that can only add, and versioning.** It stops a broken or hacked host. Anyone with administrator rights can still delete every dump.
- **A separate AWS account for backups**, the enterprise way. It would also survive the loss of the main account. It needs AWS Organizations, a second account and roles across accounts, for a single host.
