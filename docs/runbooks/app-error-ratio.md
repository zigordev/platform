# App error ratio

**Alert:** `<App>ErrorRatio`, such as `NotificationsApiErrorRatio`, one for each app in the registry. It fires when more than 5% of the app's requests have answered with a server error for 5 minutes, and its severity is `page`.

## What fired

The share of the app's requests that answered `5xx` stayed above 5% for 5 minutes. It is measured from `http.server.request.duration` with `job="<app>"`, so it counts every route the app serves. A route that fails every time is enough on little traffic.

## Whether it matters

Each server error is a request that failed with nothing its user could do. A sign-in, a form or a page load did not happen.

## How to see

The ratio:

```promql
sum(rate(http_server_request_duration_seconds_count{job="<app>", http_response_status_code=~"5.."}[5m]))
/
sum(rate(http_server_request_duration_seconds_count{job="<app>"}[5m]))
```

Which routes fail, and with which code:

```promql
sum by (http_route, http_response_status_code) (rate(http_server_request_duration_seconds_count{job="<app>", http_response_status_code=~"5.."}[5m]))
```

The errors the app logged:

```logql
{service_name="<app>", detected_level="error"}
```

The alert links the app's dashboard in Grafana's `zigordev` folder.

## What to do

1. **Find the route** on the dashboard's traffic row, or with the second query.
2. **Read its errors.** An error line carries a `traceId`. Open that trace in Tempo to see which call failed.
3. **Check `/health`.** A required dependency that is down, such as the database, answers `503` and explains most errors at once.
4. **Fix it in the app's repo**, starting with a test that fails without the fix.

## When it is fixed

The ratio falls back under 5%, and the alert resolves on the next evaluation, within a minute.
