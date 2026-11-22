# 0002. The shared services are one Compose project with fixed names

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

The plan gives every product the same shared services: the ingress, the telemetry agent and, on the laptop, a local Grafana and a mail catcher. A product repo needs no other repo on disk, so the services reach it as the package `@zigordev/stack`, and each product starts them from its own copy of that package.

Two things follow from that. Several products run on one laptop at the same time and must share one set of services. And the same compose files are started from a different folder in every repo.

Compose recreates a container when its settings change, and the path of a mounted file is one of its settings. A config file mounted from the package folder would therefore recreate the service each time another repo started the services. A config written into the compose file as a Compose config cannot be used either: Compose refuses to put one into a container whose file system is read-only.

## Decision

- The shared services are one Compose project named `platform`. The name is in the file, so the folder does not matter.
- Apps join one network with the fixed name `zigordev`. On it the services answer to their short names: an app sends telemetry to `alloy` and mail to `mailpit`.
- `compose.yaml` holds what runs everywhere. `compose.local.yaml` holds what only the laptop has: the local Grafana, the mail catcher, the local addresses, the published port and the settings.
- No service mounts a file from the package folder. The ingress and the Docker proxy take their settings as variables and flags. The agent's config is the variable `ALLOY_CONFIG` in `compose.yaml`, which one line of shell writes to a file in memory before Alloy replaces that shell.
- One command, `zigordev-stack`, starts and stops the project, in every repo.

## Consequences

- Starting the services from a second repo changes nothing, and two products share them.
- A change to the agent's config recreates the agent and nothing else, because the config is part of the service's own settings.
- The agent's config is edited inside a YAML file, with no editor support for its own language. It may hold no dollar sign, which Compose would read as a variable. A test holds that.
- The agent's image has to contain a shell. Its health check needs one already.
- Two repos on different versions of the package recreate the changed services when each one starts them. Renovate keeps the repos on one version.
- A product names the network `zigordev` as an external network. `zigordev-stack down` cannot remove that network while a product's container is on it.

## Alternatives considered

- **Mount the config file from the package folder.** The config would stay a file of its own. Every `local:up` in another repo would recreate the agent, and a change to the file would not recreate it, because Compose does not look at a mounted file's content.
- **A Compose config with its content in the file.** It is the feature made for this. It does not work with a read-only file system, so the agent would be the one service that can write to its own.
- **Copy the files to one fixed folder on the laptop first.** It needs a place outside every repo and a step that keeps it current.
- **Build our own agent image with the config inside.** It adds an image to build, scan and publish for a file of 80 lines.
