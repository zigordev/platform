# Cloud first deploy

The production side of the platform is being built in the second half of Phase 2. Until the host exists, merging to `main` changes nothing outside this repo and its bootstrap stack.

## Bootstrap

`infra/bootstrap/` creates what every other stack needs first, in the zigordev AWS account and in `eu-west-1` ([ADR 0003](adr/0003-encrypted-state-and-ci-roles.md)):

- `platform-state-<account>`, the S3 bucket that holds every stack's state. It is versioned, private, reachable only over TLS, and encrypted with the state key.
- `alias/platform-state`, the KMS key that OpenTofu encrypts state and plans with, rotated every year.
- `platform-tofu-plan`, the role pull requests plan with. It reads AWS, holds the state lock and uses the state key, and it is denied every S3 object outside the state bucket and every parameter outside `/platform/`.
- `platform-tofu-apply`, the role that applies. Only a workflow running in the `production` environment, which the owner approves, can take it.

Both roles trust the GitHub sign-in provider that already exists in the account, through the immutable subjects GitHub signs this repo's tokens with: `repo:zigordev@261390829/platform@1464253077:pull_request` and `:ref:refs/heads/main` for the plan role, `:environment:production` for the apply role. The bootstrap was first applied from a laptop with the owner's OK, because the roles CI uses did not exist yet. The same commands repair it if a change ever breaks those roles:

```bash
cd infra/bootstrap
AWS_PROFILE=platform-ops mise exec -- tofu init
AWS_PROFILE=platform-ops mise exec -- tofu plan -out bootstrap.tfplan
AWS_PROFILE=platform-ops mise exec -- tofu apply bootstrap.tfplan
```

It was applied on 2026-11-19. Its state lives in the bucket it created, at `bootstrap/terraform.tfstate`, encrypted with the state key. OpenTofu refuses to read or write state or plans without that encryption, so the commands above need the `platform-ops` profile, and nothing about the bootstrap stays on a laptop.

`mise.toml` pins the OpenTofu version, and each stack's `opentofu.tofu` holds the lowest version it accepts ([ADR 0004](adr/0004-opentofu-version-floor.md)). An older `tofu` stops at `init` with "Incompatible module".

## How a change reaches AWS

The Tofu workflow runs every stack in `infra/` through OpenTofu ([ADR 0005](adr/0005-merges-apply-the-approved-plan.md)):

1. On a pull request, its Plan job plans each stack with `platform-tofu-plan`. The plans are in the job's log and summary, and nothing is applied.
2. On a merge to `main`, Plan runs again on the merged code. When no stack changes, the run ends there.
3. When a stack changes, its plan is saved, encrypted with the state key, and the Apply job waits in the `production` environment. Read the plan in the Plan job's summary, then approve the deployment on the run. Apply then applies exactly the saved plans with `platform-tofu-apply`.
4. If an apply fails, or the state moved while the approval waited, re-run all jobs. OpenTofu refuses a saved plan whose state has moved on, so the run plans again first.

A newer merge waits until a pending approval is given or rejected. Reject a stale approval to let the newer run plan again.

## What production will be

The decisions are recorded in toolkit's ADRs 0013 to 0016:

- One Graviton host, a t4g.medium running all week, created with OpenTofu.
- cloud-init and systemd prepare the host, and systemd timers run its jobs.
- doco-cd polls this repo every minute and applies each `apps/<app>/` folder with Docker Compose. A deploy is a commit, and a rollback is `git revert`.
- Caddy routes and terminates TLS from labels on each app's containers, with DNS in Cloudflare.
- PostgreSQL 18 holds every app's database, provisioned from the registry by the same code the local platform uses. Backups run nightly to S3, with a weekly restore drill.
- Alloy runs `stack/alloy/config.alloy` with Grafana Cloud as its destination, and the same builders that the local Grafana uses produce Grafana Cloud's dashboards and alert rules, with production's own contact points.
- Browsers send real user monitoring to Alloy's Faro receiver, through a public route or Grafana Cloud's collector, decided with the host ([ADR 0009](adr/0009-alloy-receives-browser-telemetry.md)).
- flagd serves each app's `flags.json` from this repo, so a flag change deploys like any other commit.
- Secrets are SOPS files encrypted with age, decrypted on the host.
- Amazon SES sends email, with production access requested on the first day of the cloud work, because AWS's review takes time.
