# An app answers with errors

## What it means

More than 5% of the requests to one app have ended in a server error for 5 minutes. A server error is an answer with a status from 500 to 599: the app itself failed, the visitor did nothing wrong. The alert names the app.

Visitors of that app see an error page, or a part of a page that does not load.

## How to check

1. Open the alert's panel. It is on the App dashboard, with the app already picked: "Share of requests that fail".
2. On the same dashboard, look at "Requests by route" and "Responses by status". They show whether every route fails or one.
3. Scroll to "Errors and warnings". Each line is one failure, and its `error` field holds the message and the place in the code.
4. A line carries a `traceId`. In Grafana's Explore, pick Tempo and paste it: the trace shows which step of the request failed, such as a database query or a call to another app.
5. Look at "Version" at the top. A version that changed minutes before the errors began points at the last deploy.

## How to fix

| What you found                                            | What to do                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The errors began with a new version                       | Roll back to the version before. From phase 3 that is one command, followed by a revert so `main` stays true |
| One route fails, the others work                          | Fix that route in the product's repo, with a test that fails without the fix                                 |
| The app cannot reach its database                         | Look at the database container of that product: `docker ps` shows whether it is healthy                      |
| The app cannot reach another app                          | That app has its own alert. An app has to keep working when another one is down: fix the caller too          |
| The errors stopped by themselves before you found a cause | Read the lines from that time anyway. An error that fixed itself comes back                                  |
