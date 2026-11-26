# Runbooks

A runbook is the page to open when an alert fires. It says what the alert means, how to check what is wrong, and how to fix it. Every alert links its own, so nobody has to search for it.

| Alert                                                                          | Fires when                                                                                | Reaches the owner by |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------- |
| [An app answers with errors](app-answers-with-errors.md)                       | More than 5% of an app's requests fail with a server error for 5 minutes                  | Phone                |
| [An app is slow](app-is-slow.md)                                               | The slowest 5% of an app's requests take longer than 1 second for 10 minutes              | Phone                |
| [The host is filling up](host-is-filling-up.md)                                | The host's memory is above 85%, or one of its disks above 80%                             | Phone                |
| [A backup is too old](backup-is-too-old.md)                                    | A product's newest dump has been older than 2 hours for 5 minutes                         | Email                |
| [A restore test is too old](restore-test-is-too-old.md)                        | A product's last good restore test is older than 35 days, or none ever passed             | Email                |
| [Telemetry went silent](telemetry-went-silent.md)                              | The telemetry agent has reported nothing for 10 minutes                                   | Phone                |
| [The Kafka broker is down](kafka-broker-is-down.md)                            | The broker has not answered on its port for 5 minutes                                     | Phone                |
| [Messages are stuck](messages-are-stuck.md)                                    | An app has had messages waiting for 15 minutes, and has handled none of them              | Phone                |
| [A message reached a dead-letter topic](message-reached-dead-letter-topic.md)  | An app set a message aside, because it could not read it or its handler failed four times | Email                |
| [An email failed for good](email-failed-for-good.md)                           | The notifications service ended an email as failed, for any reason                        | Email                |
| [Jobs are waiting](jobs-are-waiting.md)                                        | A queue of an app has had jobs ready to start for 15 minutes                              | Phone                |
| [The mail server cannot be reached](mail-server-cannot-be-reached.md)          | The notifications service's check of its mail server has failed for 10 minutes            | Email                |
| [An app cannot be reached from outside](app-cannot-be-reached-from-outside.md) | The latest outside check of a live product has failed from every place for 5 minutes      | Phone                |
| [Spending is unusual](spending-is-unusual.md)                                  | The month's forecast or spending passes the $45 budget, or one service jumps by $5 a day  | Email, from AWS      |
| [A free limit is near](free-limit-is-near.md)                                  | More than 80% of one of Grafana Cloud's free limits is in use                             | Email                |
| [A deploy failed](deploy-failed.md)                                            | A run of the pipeline on `main` failed, in any repo                                       | Email, from GitHub   |

The numbers are starting values. They are tuned once an app has real traffic.

On the laptop the same rules run in the local Grafana, at `http://grafana.localhost` under Alerting, and they notify nobody, but for "A free limit is near", which only Grafana Cloud has. In production, Grafana Cloud sends them to the owner's email. "Phone" alerts reach the phone once Grafana IRM arrives in phase 7, and email until then.

The two backup alerts arrived with step 3.8, on 2026-11-25, and the three Kafka alerts with step 5.4, the same day. The broker's alert reads a check of its port, and the other two read the numbers each app reports through `@zigordev/events`, so they name the app. Step 5.6 added four on 2026-11-26. Three watch the notifications service: two read its own numbers, and "Jobs are waiting" reads the count of pg-boss, the job queue it uses, so it covers every app with a queue. The fourth reads Grafana Cloud's outside checks, so it covers every live product. "Spending is unusual" is sent by AWS itself, from the budget and the spending check of `infra/bootstrap`, which exist since phase 3. Its budget rose from $30 to $45 a month on 2026-11-26. The last two arrived the same day. "A free limit is near" reads Grafana Cloud's own usage numbers, so it and its dashboard Free limits live in Grafana Cloud only, built into `observability/cloud`. "A deploy failed" is sent by GitHub itself, to the account that started the run, `zigordev`.

Every rule answers with a number above 0 while it should fire, and with nothing otherwise, because each rule's threshold fires on an answer above 0. A rule that answers 0 never fires. Until 2026-11-26 the broker's rule answered 0 while the broker was down, so it could not have fired.

## How a runbook is written

- Its file name is the alert's name in the code, which is also the last part of the alert's link.
- It has three headings: what it means, how to check, how to fix.
- A step is something a person can do: a page to open or a command to run, and what to look for.
- A test in `observability/src/alerts.test.ts` fails when an alert has no runbook.
