# 0018. Dashboards and alerts reach Grafana Cloud once the agent sends data

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

[Record 0004](0004-dashboards-and-alerts-are-code-pushed-by-gcx.md) makes the dashboards and the alert rules code, which gcx pushes to Grafana, and names the step that deletes what the files no longer hold in Grafana Cloud as phase 3 work. gcx has no option for that deletion, only `gcx resources delete <kind>/<name>`.

The alert "Telemetry went silent" fires while no data arrives, and no data reaches Grafana Cloud before step 3.7 runs the telemetry agent on the host.

On 2026-11-24 the owner was asked when production dashboards and alerts should be pushed, with two options, and chose, in their words: "When the services run (Recommended)".

## Decision

- The pipeline pushes the dashboards and the alert rules to Grafana Cloud with gcx, the same image and files as the laptop, then deletes the dashboards and alert rules in the folder `zigordev` that the files no longer hold. It never touches anything outside that folder.
- The job "Observability changes" decides on each merge to `main`: it pushes only when the switch is on and the merge changed `observability/` or `infra/grafana/`.
- The job "Observability push" then waits for the owner's approval in the environment `infrastructure`, like an apply, and signs in with the apply role.
- The switch is `grafanaCloud` in `observability/push.json`. It is off until step 3.7 has the agent sending data, and it goes, with its check in the pipeline, by its removal date, 2027-01-31. A test fails after that date.

## Consequences

- No false alarm reaches the owner before production has data.
- Every change to the dashboards or the alerts in Grafana Cloud waits for the owner, as every change to Grafana Cloud does.
- A dashboard or rule changed by hand in Grafana Cloud stays changed until the next push, because the weekly drift check plans only the OpenTofu stacks.
- On 2026-11-24 a dry run against the stack accepted the folder and both dashboards. Grafana cannot dry-run alert rules on the server, so their first real check is the first push.

## Alternatives considered

- **Push right away.** Dashboards would show at once, but "Telemetry went silent" would mail the owner every few hours until step 3.7, and the alerts that matter would be lost in it.
- **OpenTofu's Grafana provider for the dashboards and rules.** The plan would show every change, and drift would be found, but the provider handles our files only through `grafana_apps_generic_resource`, which its own docs call experimental, with diffing that "may change".
