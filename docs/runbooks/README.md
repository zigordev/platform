# Runbooks

One page for each alert the platform raises: what fired, whether it matters, how to see it and what to do. The rules are code in `src/observability/alerts.ts`, and an app's own rules live in its `apps/<app>/observability.ts` and link to that app's runbooks ([ADR 0011](../adr/0011-alert-rules-are-code-with-runbooks.md)).

| Alert                                                | Fires when                                                                      | Runbook                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| `<App>ErrorRatio`, such as `PlaygroundApiErrorRatio` | more than 5% of an app's requests have failed with a server error for 5 minutes | [App error ratio](app-error-ratio.md) |
| `PlatformFlagdDown`                                  | flagd has sent no telemetry for 5 minutes                                       | [flagd down](flagd-down.md)           |

notifications' own alerts, `NotificationsDeliveryObjective` and `NotificationsDeadLetters`, link to [notifications' runbooks](https://github.com/zigordev/notifications/tree/main/docs/runbooks).

## Where alerts go

Locally, Grafana emails every alert to `alerts@platform.test`, and Mailpit catches it at <http://127.0.0.1:8025>. Each email names the alert and links its runbook and dashboard. Production's contact points come with the host.
