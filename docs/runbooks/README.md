# Runbooks

A runbook is the page to open when an alert fires. It says what the alert means, how to check what is wrong, and how to fix it. Every alert links its own, so nobody has to search for it.

| Alert                                                                         | Fires when                                                                                | Reaches the owner by |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| [An app answers with errors](app-answers-with-errors.md)                      | More than 5% of an app's requests fail with a server error for 5 minutes                  | Phone                |
| [An app is slow](app-is-slow.md)                                              | The slowest 5% of an app's requests take longer than 1 second for 10 minutes              | Phone                |
| [The host is filling up](host-is-filling-up.md)                               | The host's memory is above 85%, or one of its disks above 80%                             | Phone                |
| [A backup is too old](backup-is-too-old.md)                                   | A product's newest dump has been older than 2 hours for 5 minutes                         | Email                |
| [A restore test is too old](restore-test-is-too-old.md)                       | A product's last good restore test is older than 35 days, or none ever passed             | Email                |
| [Telemetry went silent](telemetry-went-silent.md)                             | The telemetry agent has reported nothing for 10 minutes                                   | Phone                |
| [The Kafka broker is down](kafka-broker-is-down.md)                           | The broker has not answered on its port for 5 minutes                                     | Phone                |
| [Messages are stuck](messages-are-stuck.md)                                   | An app has had messages waiting for 15 minutes, and has handled none of them              | Phone                |
| [A message reached a dead-letter topic](message-reached-dead-letter-topic.md) | An app set a message aside, because it could not read it or its handler failed four times | Email                |

The numbers are starting values. They are tuned once an app has real traffic.

On the laptop the same rules run in the local Grafana, at `http://grafana.localhost` under Alerting, and they notify nobody. Production does not exist yet, so the steps below that name the host are written for phase 3 and say so.

The two backup alerts arrived with step 3.8, on 2026-11-25, and the three Kafka alerts with step 5.4, the same day. The broker's alert reads a check of its port, and the other two read the numbers each app reports through `@zigordev/events`, so they name the app. Four more arrive with the pieces they watch: an app that cannot be reached from outside, a free limit that is near, a failed deploy and unusual spending.

## How a runbook is written

- Its file name is the alert's name in the code, which is also the last part of the alert's link.
- It has three headings: what it means, how to check, how to fix.
- A step is something a person can do: a page to open or a command to run, and what to look for.
- A test in `observability/src/alerts.test.ts` fails when an alert has no runbook.
