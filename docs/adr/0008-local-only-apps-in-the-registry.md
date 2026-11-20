# 0008. Local-only apps live in the registry

- Status: accepted
- Date: 2026-11-20
- Supersedes: none

## Context

The playground is a local-only app that tries what toolkit, the design system, platform and notifications provide, the way a product would. It is not a git repository and never reaches production. It created its own database with a copy of the platform's provisioning SQL, and it had no way to get flags or dashboards, which the platform derives from its registry. On 2026-11-20 the owner chose to register it in the platform, marked as local-only.

## Decision

- `app.yaml` takes `local`, a boolean that defaults to `false`. `true` means the app runs only on laptops.
- `appsFor('local', apps)` gives the laptop every app, and `appsFor('production', apps)` leaves local-only apps out. Local provisioning uses the first. The production provisioning and deploys will use the second when they are built.
- `playground-api`, with a database, and `playground-web` are registered as local-only apps. The platform provisions the `playground_api` database and role, and serves their flags and dashboards like any other app's.
- A local-only app's folder holds only what the platform reads, `app.yaml` and `flags.json`, and never a production compose file.

## Consequences

- The playground gets its database, flags and dashboards the same way a real product will, so trying it proves the platform's side too.
- The playground no longer copies the platform's provisioning SQL.
- Production tooling has to honour `local`, through `appsFor('production', ...)`.
- `pnpm local:check` connects as every registered app's role to its database, the playground's included.

## Alternatives considered

- A second, git-ignored registry folder for local-only apps: nothing about the playground in git, but flags and dashboards would have no reviewed home.
- A registry inside the playground, read by path: keeps the playground self-contained, but couples the platform to a folder outside its repo.
- No registration: the playground keeps its copy of the SQL, and gets no flags or dashboards.
