# A deploy failed

## What it means

A run of the pipeline on `main` failed, in `platform` or in a product's repo. GitHub sends this alert itself, not Grafana: it emails the account that started the run, `zigordev`, when its notifications for GitHub Actions are on. Every run on `main` is started by `zigordev`, also when a pull request of Renovate merges.

A failed run on `main` is one of these:

- A product's deploy failed. Its new version did not pass the health check, and the host brought back the version before, or the deploy stopped before it changed anything.
- The deploy of the shared services failed.
- An infrastructure apply failed.
- The push of the dashboards and alert rules to Grafana Cloud failed.
- The release failed, so a package or an image was not published.

When a deploy fails, the version before keeps running, so the product's users usually notice nothing. But the change that was merged is not live.

## How to check

1. Open the run from GitHub's email, or from the repo's page on GitHub, under Actions. The job that failed is red.
2. For a deploy, read the job's last lines. The host's answer is the line that starts with `platform-deploy:`, as the table below explains. A run without such a line failed before it reached the host.
3. See which version runs. A product's `/health`, such as `https://notifications.zigordev.com/health`, names its commit as `version`. The host records each deploy that passed in Parameter Store: `aws ssm get-parameter --profile platform-ops --region eu-west-1 --name /platform/deploy/<target>`.
4. For a version that failed its health check, read its logs in Grafana's Explore: pick Loki and run `{service_name="<app>"} | json | level="error"`, around the time of the deploy.

| The host's answer              | Means                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `result=rolled-back`           | The new version did not pass its health check, so the host brought back the version before. `commit=` names the version that runs again                                                                             |
| `result=failed reason=<step>`  | A step failed: `pull`, `start`, `job`, `health`, `orphans`, `record` or `unexpected`. `restored=` names the version that runs again, `none` on a product's first deploy, or `failed`                                |
| `result=refused reason=<word>` | Nothing changed. The reason says why: `not-on-main`, `unverified-image`, `unpinned-image`, `missing-secrets` (with the names, never the values), `not-current`, `no-previous`, `busy`, `unreachable` or `bad-input` |

## How to fix

| What you found                         | What to do                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rolled-back`, or `failed` at `health` | Fix the new version, using its logs, and merge the fix. The version before keeps running until then                                                     |
| `failed` with `restored=failed`        | No version runs. Revert the merge that broke it, so the version before deploys again, and look at the host's state with the owner                       |
| `refused` with `missing-secrets`       | The owner stores the secrets the line names in Parameter Store, under `/<product>/`. A session never sets a secret                                      |
| `refused` with `busy` or `unreachable` | Another deploy held the lock, or GitHub or Parameter Store did not answer. Running the job again waits for the owner's yes                              |
| `refused` with `not-current`           | A newer commit was merged meanwhile. Its own deploy brings the change too                                                                               |
| An infrastructure apply failed         | Read the apply's log in the run, fix the code through a pull request, and the next merge applies it again after the owner's approval                    |
| The push to Grafana Cloud failed       | Read the job's log. `push:` lines say what failed. Fix it before the owner approves the next push, because the owner approves every waiting run at once |
| The release failed                     | Read the job's log. The next release run publishes what is missing                                                                                      |
