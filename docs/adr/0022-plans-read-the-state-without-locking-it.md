# 0022. Plans read the state without locking it

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

OpenTofu puts a lock file in the state bucket for every plan, drift check and apply of a stack, and removes it when it is done. A plan writes no state.

On 2026-11-24 GitHub cancelled an older run of platform#33 while it planned the stack `bootstrap`. Its lock file, made at 12:45 UTC, stayed in the bucket, so the next run waited two minutes for the lock and failed with "Error acquiring the state lock". GitHub cancels a pull request's older run whenever a newer one starts, so this can happen at any time.

Terraform Cloud's speculative plans, the ones a pull request shows, do not lock the state either.

The owner was asked how to fix it, with three options, and chose, in their words: "Both (Recommended)". That meant removing the stale lock, which was done the same day, and planning without the lock from then on.

## Decision

- `infra/run.sh` plans with `-lock=false` for a plan and for a drift check.
- An apply keeps the lock and waits up to two minutes for it.
- A lock that a stopped apply leaves behind is removed from the laptop with `tofu force-unlock` and the id that the error names, once no run applies and the owner has said yes.

## Consequences

- A cancelled plan leaves nothing behind, and a pull request's plan never waits for another one.
- A plan that runs while an apply writes the state may show the state from before that apply. It does no harm, because an apply makes its own plan when it starts.
- The plan role's right to write the lock file goes unused. The bootstrap can take it away later, from the laptop.

## Alternatives considered

- **Keep the lock and stop cancelling older runs.** Pull requests would wait for each other, and a job that GitHub kills would still leave its lock.
- **Remove the lock in a trap in `infra/run.sh`.** GitHub kills a job once its grace period ends, so the trap does not always run.
