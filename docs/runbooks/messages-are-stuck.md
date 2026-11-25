# Messages are stuck

## What it means

An app reads a topic as a consumer group, through `@zigordev/events`, and reports how many messages wait for it. For 15 minutes the group has had messages waiting, and it has handled none of them. The alert names the app and the topic.

So the work those messages ask for is not being done. For the notifications service that means emails are not being sent.

The usual causes: the app stopped reading, it cannot sign in to the broker, a rule that lets it read is missing, its handler hangs, or the broker is down.

## How to check

1. Open the alert's panel. It is on the App dashboard, for the app the alert names, in the row Messages: "Messages waiting, by topic".
2. See whether the broker answers: the Platform dashboard, row Kafka. If it does not, follow [The Kafka broker is down](kafka-broker-is-down.md) first.
3. Read the app's errors and warnings: in Grafana's Explore, pick Loki and run `{service_name="<app>"} | json | level=~"error|warn"`. A line that says the app cannot sign in, or is not authorized, points at its user or its rules.
4. Look at the app's health: its `/health` reports Kafka as a component, so it says whether the app is connected.
5. See whether the handler hangs: in Grafana's Explore, pick Tempo and search the app's spans named `process <topic>`. A span that never ends, or ends after minutes, is the handler.

## How to fix

| What you found                                  | What to do                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The broker is down                              | Follow [The Kafka broker is down](kafka-broker-is-down.md). The messages are handled once it is back                                                                           |
| The app's container is not running, or restarts | Its own logs say why. On the host, the app's next deploy starts it                                                                                                             |
| The app cannot sign in                          | Its password differs from the one the broker has. Both come from the app's own `KAFKA_PASSWORD` in Parameter Store, so a deploy of the shared services sets the broker's again |
| The app is not authorized to read               | Its rules are missing. They are lines in `KAFKA_SETUP` in `stack/compose.yaml` of `platform`, added through a pull request                                                     |
| The handler hangs                               | Fix the handler in the app. Until then a restart of the app lets it start again, from the message it did not finish                                                            |
