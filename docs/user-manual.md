# Use platform

`platform` has two kinds of user. A product uses what this repo runs around it, and the owner operates it. This page says what each of them takes from it, and how. Each part says what exists on 2026-11-22, because the platform is still being built.

| A user takes                         | Who       | From                          | Exists today     |
| ------------------------------------ | --------- | ----------------------------- | ---------------- |
| The shared services on the laptop    | A product | The package `@zigordev/stack` | Not yet. Phase 2 |
| A dashboard, and the standard alerts | A product | `observability/`              | Not yet. Phase 2 |
| A place to run in production         | A product | `infra/` and `host/`          | Not yet. Phase 3 |
| A runbook for every alert            | The owner | `docs/runbooks/`              | Not yet. Phase 2 |

## What a product will not have to do

A product keeps a short list of promises, which the handbook calls [the contract](https://github.com/zigordev/toolkit/blob/main/docs/handbook/the-platform.md): it ships as a container, answers `GET /health`, writes its logs as JSON lines, sends its traces and metrics to the address it is given, and describes itself in its own `compose.yaml`.

Everything else comes from here, with no line of setup in the product:

| The product gets                        | Because                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Its address                             | The ingress reads the route from the labels in the product's own compose file |
| Its logs, traces and metrics in Grafana | One agent collects them from every container the same way                     |
| Its dashboard                           | The dashboard asks the data which apps exist                                  |
| The standard alerts                     | Each rule covers every app at once                                            |
| Its backups                             | The backup job finds a database by a label in the product's compose file      |

Each row becomes a section of this page in the step that builds it.

## Finding out how something is meant to work

| You want to know                     | Read                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| How the whole platform fits together | [The platform](https://github.com/zigordev/toolkit/blob/main/docs/handbook/the-platform.md) |
| Which tool does which job            | [The tools](https://github.com/zigordev/toolkit/blob/main/docs/handbook/tools.md)           |
| Why something was decided here       | [The decision records](adr/README.md)                                                       |
| The rules a session works under      | `.claude/rules/core.md`, and the area rule for the files in hand                            |
