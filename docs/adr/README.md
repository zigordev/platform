# Decision records

Each significant decision about this repo gets one short record: the context, the decision, its consequences and the alternatives that were not taken. A record is written for a reader who was not there.

The records are numbered from 0001. An accepted record is never edited: a new record supersedes it by naming it, and this index then marks the old one as superseded.

The decisions that shape the whole platform are not here. They are recorded once, [in toolkit](https://github.com/zigordev/toolkit/blob/main/docs/adr/README.md), and [record 0001](0001-this-repo-records-its-own-decisions.md) says where the line runs.

To add one, use the `write-decision-record` skill, or copy [its template](../../.claude/skills/write-decision-record/template.md) to `NNNN-short-title.md` with the next free number, and add a row here in the same pull request.

| #                                                                                                | Decision                                                                           | Date       | Status   |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------- | -------- |
| [0001](0001-this-repo-records-its-own-decisions.md)                                              | This repo records its own decisions, and toolkit the platform's                    | 2026-11-22 | accepted |
| [0002](0002-the-shared-services-are-one-compose-project.md)                                      | The shared services are one Compose project with fixed names                       | 2026-11-22 | accepted |
| [0003](0003-the-docker-proxy-is-socket-proxy.md)                                                 | The Docker proxy is socket-proxy                                                   | 2026-11-22 | accepted |
| [0004](0004-dashboards-and-alerts-are-code-pushed-by-gcx.md)                                     | Dashboards and alert rules are code, pushed by gcx                                 | 2026-11-22 | accepted |
| [0005](0005-the-bootstrap-is-applied-from-the-laptop-only.md)                                    | The bootstrap is applied from the laptop only                                      | 2026-11-23 | accepted |
| [0006](0006-the-apply-role-is-an-administrator-behind-the-owners-approval.md)                    | The apply role is an administrator, behind the owner's approval                    | 2026-11-23 | accepted |
| [0007](0007-the-aws-account-number-lives-in-a-github-secret.md)                                  | The AWS account number lives in a GitHub secret                                    | 2026-11-23 | accepted |
| [0008](0008-the-pipeline-changes-github-through-one-github-app.md)                               | The pipeline changes GitHub through one GitHub App                                 | 2026-11-23 | accepted |
| [0009](0009-the-host-is-built-at-its-first-boot-and-rebuilt-on-a-change.md)                      | The host is built at its first boot, and rebuilt on a change                       | 2026-11-23 | accepted |
| [0010](0010-docker-on-the-host-comes-from-dockers-own-repository.md)                             | Docker on the host comes from Docker's own repository                              | 2026-11-23 | accepted |
| [0011](0011-the-only-way-into-the-host-is-aws-systems-manager.md)                                | The only way into the host is AWS Systems Manager                                  | 2026-11-23 | accepted |
| [0012](0012-the-host-restarts-itself-at-night-when-an-update-needs-it.md)                        | The host restarts itself at night when an update needs it                          | 2026-11-23 | accepted |
| [0013](0013-a-first-boot-that-misses-its-setup-is-repaired-through-systems-manager.md)           | A first boot that misses its setup is repaired through Systems Manager             | 2026-11-24 | accepted |
| [0014](0014-cloudflare-holds-one-record-per-product-and-the-https-settings.md)                   | Cloudflare holds one record per product, one route, and the HTTPS settings         | 2026-11-24 | accepted |
| [0015](0015-the-owner-stores-the-tunnels-token.md)                                               | The owner stores the tunnel's token                                                | 2026-11-24 | accepted |
| [0016](0016-the-code-makes-grafanas-tokens-from-the-owners-one-token.md)                         | The code makes Grafana's tokens from the owner's one token                         | 2026-11-24 | accepted |
| [0017](0017-the-shared-services-reach-the-host-through-the-deploy-path.md)                       | The shared services reach the host through the deploy path                         | 2026-11-24 | accepted |
| [0018](0018-dashboards-and-alerts-reach-grafana-cloud-once-the-agent-sends-data.md)              | Dashboards and alerts reach Grafana Cloud once the agent sends data                | 2026-11-24 | accepted |
| [0019](0019-a-deploy-is-one-command-per-target-and-the-host-checks-what-it-runs.md)              | A deploy is one command per target, and the host checks what it runs               | 2026-11-24 | accepted |
| [0020](0020-the-host-records-each-deployed-version-in-parameter-store.md)                        | The host records each deployed version in Parameter Store                          | 2026-11-24 | accepted |
| [0021](0021-outside-images-are-pinned-by-their-digest.md)                                        | Outside images are pinned by their digest                                          | 2026-11-24 | accepted |
| [0022](0022-plans-read-the-state-without-locking-it.md)                                          | Plans read the state without locking it                                            | 2026-11-24 | accepted |
| [0023](0023-the-host-is-rebuilt-on-purpose-by-raising-its-generation.md)                         | The host is rebuilt on purpose by raising its generation                           | 2026-11-24 | accepted |
| [0024](0024-database-dumps-are-locked-for-30-days-and-nobody-can-lift-the-lock.md)               | Database dumps are locked for 30 days, and nobody can lift the lock                | 2026-11-25 | accepted |
| [0025](0025-data-lifecycle-manager-snapshots-the-data-disk-every-day.md)                         | Data Lifecycle Manager snapshots the data disk every day                           | 2026-11-25 | accepted |
| [0026](0026-the-monthly-restore-test-runs-on-the-host.md)                                        | The monthly restore test runs on the host                                          | 2026-11-25 | accepted |
| [0027](0027-the-broker-formats-its-own-storage-and-one-list-holds-its-topics-users-and-rules.md) | The broker formats its own storage, and one list holds its topics, users and rules | 2026-11-25 | proposed |
