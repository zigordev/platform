# Jobs are waiting

## What it means

An app keeps work for later as jobs in a queue of pg-boss, a job queue that lives in the app's own PostgreSQL. pg-boss counts once a minute how many jobs of each queue are ready to start. For 15 minutes the count of one queue has stayed above zero: work that should have started is late. The alert names the app and the queue.

Today only the notifications service has queues:

| Queue                | Its jobs                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `email-deliveries`   | Emails waiting to be sent. People are waiting for them                                           |
| `email-dead-letters` | Emails that failed for good and are not yet recorded as failed, so their apps have not been told |
| `email-retention`    | The daily job that deletes the bodies of old emails                                              |
| `__pgboss__send-it`  | pg-boss's own scheduler, which starts the daily job                                              |

The usual causes: the mail server cannot be reached, so the service pauses delivery on purpose; the worker of a queue stopped; the app is not running; or a burst of work larger than the app handles, which shrinks by itself.

## How to check

1. Open the alert's panel, "Jobs ready to start, by queue", on the App dashboard, with the app the alert names. A line that climbs steadily means nothing is taken; a line that falls means the app is catching up.
2. For `email-deliveries`, look at the mail server first: on the Platform dashboard, row Email, "The mail server answers" shows 0 while it cannot be reached. If so, follow [The mail server cannot be reached](mail-server-cannot-be-reached.md): delivery goes on by itself once it answers.
3. Look at the app's health: `curl -sS https://<app>.zigordev.com/health`. A part that is `down` names the cause.
4. Read the errors of the queue's worker: in Grafana's Explore, pick Loki and run `{service_name="<app>"} | json | event=~"queue.failed|queue.warning|delivery.worker_failed|email.delivery_failed|email.retention_failed"`.
5. See whether the app runs: open a shell on the host, as `docs/cloud-first-deploy.md` says under "How to open a shell", and run `sudo docker ps --all --filter name=<app>`.

## How to fix

| What you found                                  | What to do                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mail server cannot be reached               | Follow [The mail server cannot be reached](mail-server-cannot-be-reached.md). The waiting emails go out once it answers, oldest first                                              |
| `delivery.worker_failed` or `queue.failed`      | The worker stopped on an error. Fix the cause it names in the app, through a pull request: its deploy restarts the app and the worker. A restart by hand waits for the owner's yes |
| The app's container is not running, or restarts | Its own logs say why: `sudo docker logs --tail 50 <container>`. The app's next deploy starts it                                                                                    |
| The count falls by itself                       | A burst. The notifications service sends one email at a time. If bursts keep coming, the service needs more than one worker                                                        |

Never delete jobs to empty a queue. Each job of `email-deliveries` is an email that someone asked for.
