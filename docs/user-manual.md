# Use platform

`platform` has two kinds of user. A product uses what this repo runs around it, and the owner operates it. This page says what each of them takes from it, and how. Each part says what exists on 2026-11-22, because the platform is still being built.

| A user takes                         | Who       | From                 | Exists today                                                 |
| ------------------------------------ | --------- | -------------------- | ------------------------------------------------------------ |
| The shared services on the laptop    | A product | `stack/`             | Yes, in this repo. As the package `@zigordev/stack`, not yet |
| A dashboard, and the standard alerts | A product | `observability/`     | Not yet. Phase 2                                             |
| A place to run in production         | A product | `infra/` and `host/` | Not yet. Phase 3                                             |
| A runbook for every alert            | The owner | `docs/runbooks/`     | Not yet. Phase 2                                             |

## What a product does not have to do

A product keeps a short list of promises, which the handbook calls [the contract](https://github.com/zigordev/toolkit/blob/main/docs/handbook/the-platform.md): it ships as a container, answers `GET /health`, writes its logs as JSON lines, sends its traces and metrics to the address it is given, and describes itself in its own `compose.yaml`.

Everything else comes from here, with no line of setup in the product:

| The product gets                        | Because                                                                       | Exists today |
| --------------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| Its address                             | The ingress reads the route from the labels in the product's own compose file | Yes          |
| Its logs, traces and metrics in Grafana | One agent collects them from every container the same way                     | Yes          |
| A place that catches its email          | The mail catcher takes whatever is sent to it on the laptop                   | Yes          |
| Its dashboard                           | The dashboard asks the data which apps exist                                  | Not yet      |
| The standard alerts                     | Each rule covers every app at once                                            | Not yet      |
| Its backups                             | The backup job finds a database by a label in the product's compose file      | Not yet      |

## Being served on the laptop

With the shared services running, an app is served when its compose file does four things.

| The app                                  | With                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Joins the platform's network             | `networks: [zigordev]` on the service, and `zigordev` named as an external network                                 |
| Asks for a route                         | The labels `traefik.enable: "true"`, a router rule such as ``Host(`hello.localhost`)``, and the port it listens on |
| Has a health check                       | `healthcheck`. The ingress sends no request to a container before its check passes                                 |
| Sends its telemetry and its mail by name | `OTEL_EXPORTER_OTLP_ENDPOINT: http://alloy:4318`, and `mailpit` on port 1025 as its SMTP server                    |

Its log lines need nothing: the agent reads them from Docker and names them by the app's service name.

[The package's own page](../stack/README.md) shows a whole example, explains each service, and lists what to check when an app is not served.

## Starting and stopping the shared services

In this repo, `pnpm local:up`, `pnpm local:down` and `pnpm local:reset`. [Run platform on a clean laptop](local-first-start.md) walks through the first start.

A product will not need this repo for that. It will install `@zigordev/stack` and start the same services with `zigordev-stack up`, once the package is published.

## Finding out how something is meant to work

| You want to know                     | Read                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| How the whole platform fits together | [The platform](https://github.com/zigordev/toolkit/blob/main/docs/handbook/the-platform.md) |
| Which tool does which job            | [The tools](https://github.com/zigordev/toolkit/blob/main/docs/handbook/tools.md)           |
| Why something was decided here       | [The decision records](adr/README.md)                                                       |
| The rules a session works under      | `.claude/rules/core.md`, and the area rule for the files in hand                            |
