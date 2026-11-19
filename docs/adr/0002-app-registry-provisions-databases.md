# 0002. The app registry provisions one database and role per app

- Status: accepted
- Date: 2026-11-19
- Supersedes: none

## Context

The estate rules give every app its own database and role in the one PostgreSQL. The rebuild plan makes `apps/<app>/app.yaml` the registry: OpenTofu reads it for DNS, checks and email senders, and a provisioning job creates each app's database and role. The legacy apps each ran a PostgreSQL container of their own.

## Decision

- Each app is a folder in `apps/`, named `<repo>-<app>`, holding an `app.yaml` with `name`, equal to the folder, and `database`, which defaults to `false`. A strict Zod schema rejects unknown fields. The file is read with js-yaml, the YAML library the estate already uses in gpool.
- Provisioning creates a login role and a database with the app's name in snake_case, such as `gpool_api`. The role owns the database, and `PUBLIC` loses its access to it. A second run changes nothing that exists.
- Locally, `pnpm local:up` runs the provisioning, and the local PostgreSQL trusts local connections, so no password is kept in git. In production the same code will run on the host, with each role's password coming from SOPS.

## Consequences

- Adding an app's database is one folder and one command.
- Database and role names use underscores, while the app keeps its kebab-case name everywhere else.
- The schema grows with the fields that the cloud work needs, such as domains and checks.

## Alternatives considered

- An SQL init script per app: no registry to share with OpenTofu, and it runs only on a fresh data volume.
- `app.json`: no YAML parser, but the plan and every compose file around it use YAML.
