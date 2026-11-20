# 0012. Database roles have guardrails

- Status: accepted
- Date: 2026-11-20
- Supersedes: none

## Context

Toolkit ADR 0008 runs one PostgreSQL 18 server with a database and role per app, and ADR 0002 provisions them from the registry. On 2026-11-20 the owner kept the shared server, decision D7 of the notifications and playground plan, over a server per app. The condition was that no app can starve the others: a connection storm, a runaway query or a forgotten transaction in one app would otherwise hold the server for all of them.

## Decision

- Provisioning sets three limits on every app's role, on every run, so a change in the registry reaches the server on the next `pnpm local:up`:
  - a connection limit, 25 by default, which an app raises or lowers with `connections` (1 to 100) in its `app.yaml`;
  - `statement_timeout` of 60 seconds, so one query cannot run for minutes;
  - `idle_in_transaction_session_timeout` of 60 seconds, so a transaction an app forgot to close cannot hold its locks.
- The limits are role settings, so they apply to the app, its migration job and its background workers alike, and take effect on each new connection.
- `pnpm local:check` connects as every app's role and confirms all three.

## Consequences

- A busy app gets an error from its own pool instead of taking the server from the others.
- A migration or job that needs more than 60 seconds per statement sets its own `statement_timeout` for its session.
- The connection limits can add up to more than the server's `max_connections`. They cap each app; they do not reserve connections for it.
- The rule for moving an app to its own server stays as the plan states it: a different PostgreSQL version or extension, load or size that affects the others, or recovery targets of its own.

## Alternatives considered

- A server per app: full isolation, at the cost of memory, backups and upgrades multiplied on one host.
- A connection pooler such as PgBouncer in front of the server: it multiplexes connections, but it is one more service to run, and it breaks session features that pg-boss relies on.
- Limits in each app's pool settings alone: no server change, but nothing stops a misconfigured app.
