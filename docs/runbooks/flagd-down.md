# flagd down

**Alert:** `PlatformFlagdDown`, when flagd has sent no telemetry for 5 minutes. Its severity is `page`.

## What fired

No `target_info{job="platform-flagd"}` sample arrived in 5 minutes. flagd has stopped, keeps crashing, or cannot reach Alloy.

## Whether it matters

Apps keep working, because their OpenFeature providers fall back to each flag's default. But every flag is then at its default: a flag turned on in a `flags.json` is off for everyone, and edits to the flags change nothing.

## How to see

Whether the container runs, and what it logged:

```bash
docker compose --file local/compose.yaml ps flagd
docker logs --tail 50 platform-flagd
```

Whether it answers:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8014/readyz
```

If flagd answers `200` and the alert still fired, it runs but its metrics do not reach Alloy. Check its `OTEL_EXPORTER_OTLP_ENDPOINT` in `local/compose.yaml`, and that `platform-alloy` is healthy.

## What to do

1. **A stopped container:** `pnpm local:up` starts it again.
2. **A crash loop:** its JSON logs name the error. A flags file it cannot read is the usual cause. `pnpm run check` validates every `flags.json`: fix the file, then run `pnpm local:up`.
3. **A source that disappeared**, such as an app removed from the registry: `pnpm local:up` writes flagd's list of files again and recreates it.

## When it is fixed

`target_info{job="platform-flagd"}` returns, and the alert resolves within a minute.
