# Run an app against the local platform

This tutorial runs a small Node script as if it were an app: it gets a database, sends a trace and an email, and you see each one arrive. It takes about ten minutes once [local first start](../local-first-start.md) is done.

## 1. Start the platform

```bash
cd ~/Desktop/Personal/zigordev/platform
pnpm local:up
```

The last line says `platform.database_created` for `platform-hello`, the example app already in the registry.

## 2. Register your app

Create `apps/tutorial-app/app.yaml`:

```yaml
name: tutorial-app
database: true
```

Run `pnpm local:up` again. It leaves `platform_hello` alone and prints `platform.database_created` for `tutorial-app`.

## 3. Use the database

Connect as the app's own role and create a table:

```bash
docker exec -it platform-postgres psql -U tutorial_app -d tutorial_app -c "CREATE TABLE visits (at timestamptz DEFAULT now()); INSERT INTO visits DEFAULT VALUES; SELECT * FROM visits;"
```

The role owns its database, so it can create tables. Try the same command against `platform_hello`, and PostgreSQL refuses: each app sees only its own database.

## 4. Send a trace

Send one span to Alloy over OTLP, as an instrumented app would:

```bash
curl -s -X POST http://127.0.0.1:4318/v1/traces -H 'content-type: application/json' -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"tutorial-app"}}]},"scopeSpans":[{"spans":[{"traceId":"5b8efff798038103d269b633813fc60c","spanId":"eee19b7ec3c1b174","name":"GET /visits","kind":2,"startTimeUnixNano":"1763560000000000000","endTimeUnixNano":"1763560000100000000"}]}]}]}'
```

Open Grafana at <http://127.0.0.1:3300>, choose Explore, then Tempo, and search for the trace ID `5b8efff798038103d269b633813fc60c`. The span `GET /visits` from `tutorial-app` shows.

## 5. Send an email

Apps send email through notifications-api, never to SMTP directly. Give the tutorial app its own producer key, then restart notifications-api with it:

```bash
pnpm local:producer-key tutorial-app app@tutorial.test
pnpm local:up
```

The first command prints the key. Send an email with it, as the app's notifications client would:

```bash
curl -i http://127.0.0.1:3001/api/v1/emails \
  -H 'authorization: Bearer <the printed key>' \
  -H 'idempotency-key: tutorial:first-email' \
  -H 'content-type: application/json' \
  -d '{"from":{"email":"app@tutorial.test"},"to":{"email":"you@tutorial.test"},"subject":"Hello from the tutorial","text":"It works."}'
```

It answers `202`. Open Mailpit at <http://127.0.0.1:8025>, and the email is in the inbox. Send it again from another address, and notifications refuses it with `403`: each app sends only as its own senders.

## 6. Clean up

Delete `apps/tutorial-app/` and the `tutorial-app` entry in `local/notifications-producers.json`, then run `pnpm local:reset` to start again from the registry, or `pnpm local:down` to stop.

## What you have seen

An app gets its own database by adding one folder and its own sender with one command, and it reaches the platform through the same settings it will have in production. The [user manual](../user-manual.md) lists them.
