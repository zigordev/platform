# The Kafka broker is down

## What it means

Once a minute the telemetry agent checks whether the Kafka broker answers on its port, `kafka:9092`. For 5 minutes it has not.

While the broker is down, no app can send or read events. An app's outbox keeps each event in the app's own database and sends it once the broker is back, so nothing is lost, but nothing moves either: an email that an app asked for waits, for example.

The check only opens a connection. It does not sign in, so it keeps working whatever the state of the broker's users, and it never stops the agent itself.

## How to check

1. Open the alert's panel. It is on the Platform dashboard, in the row Kafka: "The broker answers on its port". It shows 0 while the broker does not answer.
2. See whether the broker runs: `docker ps --all --filter name=platform-kafka`. Its status has to say `healthy`.
3. Read its last lines: `docker logs --tail 50 platform-kafka-1`, or in Grafana's Explore, pick Loki and run `{service_name="kafka"}`.
4. See whether it ran out of memory: `docker inspect --format '{{.State.OOMKilled}}' platform-kafka-1` prints `true` when it did. `docker stats --no-stream` shows each container against its limit. The broker's limit is 1 GiB.
5. On the host, run these commands in a shell from AWS Systems Manager, as `docs/cloud-first-deploy.md` shows.

## How to fix

| What you found                                           | What to do                                                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The container is not running                             | On the laptop, `pnpm local:up` starts it again. On the host, the deploy of the shared services does, on the next merge to `main` or by hand with the owner's yes      |
| It ran out of memory                                     | Raise its `mem_limit` and its heap in `stack/compose.yaml` through a pull request. The host's memory has room for that since it became a t4g.medium on 2026-11-25     |
| Its log says the disk is full                            | Follow [The host is filling up](host-is-filling-up.md). The broker keeps its data in the volume `kafka-data` on the data disk                                         |
| It restarts again and again, and its log names a setting | A change to its settings is wrong. Put the version before back through a pull request. Never delete the volume `kafka-data` to make it start: it holds every message  |
| It runs and is healthy, and the panel still says 0       | The agent cannot reach it. Both must be on the network `zigordev`: `docker inspect --format '{{json .NetworkSettings.Networks}}' platform-kafka-1` lists its networks |
