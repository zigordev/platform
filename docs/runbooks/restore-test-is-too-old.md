# A restore test is too old

## What it means

No restore test of one product's dumps has passed for more than 35 days, or none ever has. On the 1st of every month, and an hour after every boot, the host restores each product's newest dump into a throwaway PostgreSQL. It then compares every table's rows with the counts taken with the dump.

The dumps are still made and kept. What is missing is the proof that they would bring the data back.

## How to check

1. Open the alert's panel, "Age of the last good restore test, by product", on the Platform dashboard. An age of about 57 years means the test never passed for that product: the host reports 0 for it.
2. Open a shell on the host through AWS Systems Manager, as `docs/cloud-first-deploy.md` says under "How to open a shell".
3. Read the last run: `sudo journalctl -u platform-restore-test.service --since -40d | tail -30`. It ends with `restore-test: <product> passed` or `restore-test: <product> failed`, and the reason stands above it.
4. See when it runs next: `systemctl list-timers platform-restore-test.timer`.

## How to fix

| What you found                                                                | What to do                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `has no complete dump`                                                        | The hourly dump fails too, and "A backup is too old" says so. Fix that first                                                                                                                           |
| `the rows of <product>/<database> differ from the counts taken with its dump` | Run the test again: `sudo systemctl start platform-restore-test.service`. If it fails the same way, the dumps cannot be trusted. Keep the data disk's snapshots, and fix the dump before anything else |
| `pg_restore` failed                                                           | Read the error in the journal. A memory error means 256 MB is too little for this database: raise `--memory` in `host/root/usr/local/sbin/platform-backup` through a pull request                      |
| The timer is stopped                                                          | `sudo systemctl enable --now platform-restore-test.timer`                                                                                                                                              |
| A container `zigordev-restore-<product>` is still there                       | The script removes it after each run and before the next. `docker rm -f zigordev-restore-<product>` is safe, because it holds only a copy                                                              |

To run the test at once: `sudo systemctl start platform-restore-test.service`. It takes a few minutes, one product at a time, and 256 MB of memory while it runs. [Record 0026](../adr/0026-the-monthly-restore-test-runs-on-the-host.md) says why the test runs on the host.
