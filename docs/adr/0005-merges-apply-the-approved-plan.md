# 0005. Merges apply the plan the owner approved

- Status: accepted
- Date: 2026-11-19
- Supersedes: 0003, for the plan role's trust

## Context

[ADR 0003](0003-encrypted-state-and-ci-roles.md) created two roles: `platform-tofu-plan` for pull requests, and `platform-tofu-apply` for the `production` environment, which waits for the owner's approval. GitHub asks for that approval before a job starts. A job that plans and applies in one go would ask the owner to approve a plan nobody has seen yet. Required checks are not strict, so a pull request's plan can be stale by the time it merges. And every merge, a docs change included, would ask for an approval.

## Decision

- The Tofu workflow plans every stack in `infra/` with `platform-tofu-plan`, on every pull request and on every push to `main`. Each plan is printed in the job log and the job summary.
- `platform-tofu-plan` also trusts pushes to `main` (`repo:zigordev/platform:ref:refs/heads/main`). It stays read-only.
- On `main`, the plan of each stack that changes is saved, encrypted with the state key, and kept as a workflow artifact for 7 days. The Apply job runs only when at least one stack changes. It waits in the `production` environment, so the owner approves after reading the plan on the same run, and it applies exactly the saved files. OpenTofu refuses a saved plan whose state has moved on.
- The bootstrap is planned and applied like every other stack. A change that breaks the CI roles is repaired from a laptop with the `platform-ops` profile.

## Consequences

- A merge that changes nothing in AWS asks for no approval.
- Applies run one at a time. A newer merge waits until the pending approval is given or rejected.
- Every stack is planned before any is applied, so a change that needs resources another stack has not created yet lands in two pull requests.
- The plans of this public repo are public. Values must be marked sensitive so OpenTofu redacts them, and secrets come from SOPS, never from plain variables.
- The change to the plan role's trust was applied from a laptop, because CI could not plan on `main` before it existed.

## Alternatives considered

- Plan and apply in one job in the `production` environment: the simplest workflow, but the owner approves a plan they have not seen.
- Applying the plan saved by the pull request's run: it goes stale as soon as `main` moves, and it comes from code that had not merged yet.
- A hosted OpenTofu runner such as Spacelift, Terraform Cloud or Atlantis: plan comments and locking come built in, at a monthly cost or with a server to run.
- A second environment without reviewers for the plans on `main`: the same result as trusting `main`, with one more environment and role to keep.
