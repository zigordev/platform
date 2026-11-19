# Cloud first deploy

The production side of the platform is being built in the second half of Phase 2. Until the host exists, merging to `main` changes nothing outside this repo and its bootstrap stack.

## Bootstrap

`infra/bootstrap/` creates what every other stack needs first, in the zigordev AWS account and in `eu-west-1` ([ADR 0003](adr/0003-encrypted-state-and-ci-roles.md)):

- `platform-state-<account>`, the S3 bucket that holds every stack's state. It is versioned, private, reachable only over TLS, and encrypted with the state key.
- `alias/platform-state`, the KMS key that OpenTofu encrypts state and plans with, rotated every year.
- `platform-tofu-plan`, the role pull requests plan with. It reads AWS, holds the state lock and uses the state key, and it is denied every S3 object outside the state bucket and every parameter outside `/platform/`.
- `platform-tofu-apply`, the role that applies. Only a workflow running in the `production` environment, which the owner approves, can take it.

Both roles trust the GitHub sign-in provider that already exists in the account. The bootstrap is the one stack applied from a laptop, once, with the owner's OK:

```bash
cd infra/bootstrap
AWS_PROFILE=platform-ops mise exec -- tofu init
AWS_PROFILE=platform-ops mise exec -- tofu plan -out bootstrap.tfplan
AWS_PROFILE=platform-ops mise exec -- tofu apply bootstrap.tfplan
```

Its state then moves into the bucket it created, encrypted like every other stack's.

## What production will be

The decisions are recorded in toolkit's ADRs 0013 to 0016:

- One Graviton host, a t4g.medium running all week, created with OpenTofu.
- cloud-init and systemd prepare the host, and systemd timers run its jobs.
- doco-cd polls this repo every minute and applies each `apps/<app>/` folder with Docker Compose. A deploy is a commit, and a rollback is `git revert`.
- Caddy routes and terminates TLS from labels on each app's containers, with DNS in Cloudflare.
- PostgreSQL 18 holds every app's database, provisioned from the registry by the same code the local platform uses. Backups run nightly to S3, with a weekly restore drill.
- Alloy runs `stack/alloy/config.alloy` with Grafana Cloud as its destination.
- Secrets are SOPS files encrypted with age, decrypted on the host.
- Amazon SES sends email, with production access requested on the first day of the cloud work, because AWS's review takes time.
