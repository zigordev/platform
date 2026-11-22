# Runbooks

A runbook is the page to open when an alert fires. It says what the alert means, how to check what is wrong, and how to fix it. Every alert links its own, so nobody has to search for it.

| Alert                                                    | Fires when                                                                   | Reaches the owner by |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| [An app answers with errors](app-answers-with-errors.md) | More than 5% of an app's requests fail with a server error for 5 minutes     | Phone                |
| [An app is slow](app-is-slow.md)                         | The slowest 5% of an app's requests take longer than 1 second for 10 minutes | Phone                |
| [The host is filling up](host-is-filling-up.md)          | The host's memory is above 85%, or one of its disks above 80%                | Phone                |
| [Telemetry went silent](telemetry-went-silent.md)        | The telemetry agent has reported nothing for 10 minutes                      | Phone                |

The numbers are starting values. They are tuned once an app has real traffic.

On the laptop the same rules run in the local Grafana, at `http://grafana.localhost` under Alerting, and they notify nobody. Production does not exist yet, so the steps below that name the host are written for phase 3 and say so.

Six more alerts arrive with the pieces they watch, in phase 3: an app that cannot be reached from outside, a backup that is too old, a restore test that is too old, a free limit that is near, a failed deploy and unusual spending.

## How a runbook is written

- Its file name is the alert's name in the code, which is also the last part of the alert's link.
- It has three headings: what it means, how to check, how to fix.
- A step is something a person can do: a page to open or a command to run, and what to look for.
- A test in `observability/src/alerts.test.ts` fails when an alert has no runbook.
