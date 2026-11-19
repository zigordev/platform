# Cloud first deploy

The production side of the platform is not built yet. The second half of Phase 2 builds it, and until then merging to `main` changes nothing outside this repo.

## What production will be

The decisions are recorded in toolkit's ADRs 0013 to 0016:

- One Graviton host, a t4g.medium running all week, created with OpenTofu, with state in S3 using native lockfile locking and state encryption.
- cloud-init and systemd prepare the host, and systemd timers run its jobs.
- doco-cd polls this repo every minute and applies each `apps/<app>/` folder with Docker Compose. A deploy is a commit, and a rollback is `git revert`.
- Caddy routes and terminates TLS from labels on each app's containers.
- PostgreSQL 18 holds every app's database, provisioned from the registry by the same code the local platform uses. Backups run nightly to S3, with a weekly restore drill.
- Alloy runs `stack/alloy/config.alloy` with Grafana Cloud as its destination.
- Secrets are SOPS files encrypted with age, decrypted on the host.

## Before the cloud work starts

- Request Amazon SES production access on the first day, because AWS's review takes time.
- The tutorial "From an empty AWS account to a running app" and a runbook per alert arrive with the cloud work.
