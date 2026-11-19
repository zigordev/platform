# 0003. OpenTofu state lives encrypted in S3, and CI plans and applies through GitHub's sign-in

- Status: accepted
- Date: 2026-11-19
- Supersedes: none

## Context

The legacy Terraform state lived only as a file in one checkout. The rebuild plan puts state in S3 with native lockfile locking and state encryption, gives every PR a plan from a read-only role, and applies merges to `main` through a production environment. The zigordev AWS account already holds the legacy resources, prefixed `platform-ops-`, and the GitHub sign-in provider they use. On 2026-11-19 the owner chose the same account and region as the legacy host, and a KMS key over a passphrase for state encryption.

## Decision

- `infra/bootstrap/` creates the state bucket `platform-state-<account>`, the KMS key `alias/platform-state`, and two roles. It is applied once from a laptop with the owner's OK, then its own state moves into the bucket.
- Every stack keeps its state in that bucket, locked with OpenTofu's native lockfile, and encrypts state and plans with the KMS key through OpenTofu's state encryption. The bucket also encrypts at rest with the same key.
- `platform-tofu-plan` trusts only pull requests of `zigordev/platform`. It has AWS's read-only policy plus the state lock and key, and it is denied any S3 object outside the state bucket and any SSM parameter outside `/platform/`, so a plan cannot read legacy secrets or bundles.
- `platform-tofu-apply` trusts only the repo's `production` environment, which requires the owner's approval, and holds administrator access to create what the stacks describe.
- New resources are prefixed `platform-`. The legacy resources are never read into a stack, changed or imported.

## Consequences

- No state lives on a laptop after the bootstrap, and no long-lived AWS keys exist for CI.
- The key costs about one dollar a month. The owner chose it over a free passphrase, which would have been another secret to keep and share with CI.
- Every apply waits for the owner in GitHub, so the apply role's broad access is used only after a reviewed plan.
- Bucket access logging is left out. trivy reports it as low severity, and it would need a second bucket.

## Alternatives considered

- A passphrase as the state key: free, but one more secret for the owner and for CI.
- A new AWS account in an organisation: a clean separation from the legacy resources, at the cost of setting up the organisation.
- A narrower apply policy: worth it once the stacks settle, and harder to get right before they exist.
