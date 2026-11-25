# A backup is too old

## What it means

The newest dump of one product's database is more than 2 hours old. The host dumps every product's PostgreSQL at 17 minutes past each hour, so at least two runs in a row have failed, or none has run.

Nothing is lost yet. But until a dump passes again, losing the host would lose everything written since the last good dump, and the target is at most 1 hour.

## How to check

1. Open the alert's panel, "Age of the newest dump, by product", on the Platform dashboard. It shows which product, and since when.
2. Open a shell on the host through AWS Systems Manager, as `docs/cloud-first-deploy.md` says under "How to open a shell".
3. Read the last runs: `sudo journalctl -u platform-backup.service --since -3h`. Each run ends with one line per product, `dump: <product> passed` or `dump: <product> failed`, and the reason stands above it.
4. See whether the timer still runs: `systemctl list-timers platform-backup.timer`.
5. See the newest sets in the bucket, from the laptop: `aws s3 ls --profile platform-ops --region eu-west-1 --recursive s3://zigordev-platform-backups/<product>/ | tail`.

## How to fix

| What you found                               | What to do                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The timer is stopped                         | `sudo systemctl enable --now platform-backup.timer`                                                                                                       |
| The timer is missing on a rebuilt host       | The setup failed. Its log is `/var/log/cloud-init-output.log`                                                                                             |
| `AccessDenied` from S3 or KMS in the journal | The host's policy `backups`, the bucket or its key differ from the code. Run the plan of `infra/backups`, and put the code back through a pull request    |
| The store's container is not running         | The product is down, and its own alerts say why. The dump starts again by itself once the store runs                                                      |
| `pg_dump` or `psql` failed inside the store  | Read the error in the journal. A full disk or a store at its memory limit shows up as "The host is filling up", or as the store's memory on the dashboard |
| `refusing the name`                          | A compose project or a database name holds more than lower-case letters, digits, `-` and `_`. Rename it in the product                                    |

To run a dump at once, without waiting for the hour: `sudo systemctl start platform-backup.service`, then read the journal.

Never delete or rewrite a dump to make room or to tidy up. The bucket's lock refuses it for 30 days, on purpose, as [record 0024](../adr/0024-database-dumps-are-locked-for-30-days-and-nobody-can-lift-the-lock.md) says.
