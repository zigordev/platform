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

Any SMTP client pointed at `127.0.0.1:1025` delivers to Mailpit. With `curl`:

```bash
printf 'Subject: Hello from the tutorial\r\n\r\nIt works.\r\n' > /tmp/tutorial-mail.txt
curl -s smtp://127.0.0.1:1025 --mail-from app@tutorial.test --mail-rcpt you@tutorial.test --upload-file /tmp/tutorial-mail.txt
```

Open Mailpit at <http://127.0.0.1:8025>, and the email is in the inbox.

## 6. Clean up

Delete `apps/tutorial-app/`, then run `pnpm local:reset` to start again from the registry, or `pnpm local:down` to stop.

## What you have seen

An app gets its own database by adding one folder, and it reaches the platform through the same settings it will have in production. The [user manual](../user-manual.md) lists them.
