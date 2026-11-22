# 0004. Dashboards and alert rules are code, pushed by gcx

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

The plan gives every app the same dashboard and the same alerts, with no setup in the app, and wants the same files in the local Grafana and in Grafana Cloud. It names the tools: the Grafana Foundation SDK to write them and gcx to push them. `toolkit`'s records hold those two choices. This record says how this repo uses them.

November wrote one dashboard per app from a list of apps, and mounted the files into the Grafana container. A new app then needed an entry in a list, and Grafana read its alert rules only when it started.

gcx was tried against the local Grafana on 2026-11-22, in version 1.8.0 against Grafana 13.3. It pushes folders, dashboards and alert rules from files, and a second push of the same files changes nothing. It does not delete what the files no longer hold.

## Decision

- The dashboards and the alert rules are TypeScript in `observability/src`, and they are tested like any code.
- There is one dashboard for any app, with a list to pick the app from, and one for the platform. A rule covers every app at once, and its answer names the app.
- `pnpm build` writes them as files into `stack/observability/`: one folder, the dashboards and the rules, each one resource in the format of Grafana's own API. The files are not committed, because the code is their source.
- Everything goes into one folder in Grafana, named `zigordev`, under fixed names. A rule names its runbook, and the dashboard and the panel it opens.
- The files name their data sources `prometheus` and `loki`. The local Grafana has them under those names, and phase 3 gives Grafana Cloud the same names.
- gcx runs as a job in a container, from `compose.local.yaml`, after the services are healthy. Nothing is installed on the laptop for it.

## Consequences

- A new app shows on the dashboard and is covered by every rule from its first request.
- A dashboard or a rule changes through a pull request, and a rule that was pushed cannot be edited in Grafana.
- `pnpm local:up` builds the files first. A product gets them inside the package `@zigordev/stack`, already built.
- A rule or a dashboard that is removed from the code stays in Grafana until someone deletes it there. On the laptop `pnpm local:reset` empties Grafana. Grafana Cloud needs a step that deletes what the files no longer hold, in phase 3.
- gcx cannot check an alert rule before it pushes it. The tests check the shape, and each rule was seen to evaluate in the local Grafana.
- The memory of each container against its limit is not on the platform dashboard yet. Reading it needs either Docker's whole socket or a mount of every container's files, which the telemetry agent does not get. It arrives with the host in phase 3, written by the host itself.

## Alternatives considered

- **Mount the files into the Grafana container, as November did.** It needs no tool. It works only for a Grafana we run ourselves, so production would push in a different way than the laptop.
- **Commit the built files.** A reviewer would see the JSON that Grafana gets. Every change would then be made twice, and a check would have to catch a file that was not rebuilt.
- **One dashboard per app.** Each app could differ. A new app would need an entry somewhere, which the plan rules out. An app adds panels for what only it knows in its own repo.
- **Install gcx on the laptop with mise.** It would be one more tool for every product repo to pin. The container is already there.
