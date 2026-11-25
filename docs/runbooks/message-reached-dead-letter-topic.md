# A message reached a dead-letter topic

## What it means

An app set a message aside. `@zigordev/events` moves a message to the topic's dead-letter topic, `<topic>.dead-letter`, for one of two reasons, which the alert names:

| Reason    | What happened                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `invalid` | The app could not read the message: it is not JSON, not an event it knows, or its data breaks the event's schema |
| `failed`  | The app's handler failed on it four times, with pauses of 1, 5 and 25 seconds between the tries                  |

The app then moved on to the next message, so the work this message asked for is not done, and nothing tries it again by itself.

## How to check

1. Open the alert's panel. It is on the App dashboard, for the app the alert names, in the row Messages: "Messages set aside, by topic".
2. Read the app's own line about it: in Grafana's Explore, pick Loki and run `{service_name="<app>"} | json | event="events.dead_lettered"`. It names the topic, the event and the reason.
3. For `failed`, read the errors just before it: `{service_name="<app>"} | json | level="error"`. The handler's error is there, and its trace links the whole try.
4. The message itself stays on the dead-letter topic, with its key, its bytes and its headers, and six headers that start with `dead-letter.` and say why. The README of `@zigordev/events` in `toolkit` lists them.

## How to fix

| What you found                | What to do                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reason `invalid`              | The sender wrote something the receiver cannot read. Fix the sender, or the event's schema, through a pull request. The message itself cannot be handled as it is                                    |
| Reason `failed`, a bug        | Fix the handler through a pull request. Once the fix is deployed, the message can be sent to its topic again. Sending a message again in production is a step by hand, and waits for the owner's yes |
| Reason `failed`, a dependency | The handler's database or an outside service was down. Once it is back, the message can be sent again, with the owner's yes                                                                          |
