# An email failed for good

## What it means

The notifications service gave up on an email that an app asked it to send. The alert names the app that asked. The email's recipient will not get it, and nothing tries it again by itself.

The app has already been told: it got the outcome `email.failed`, with one of these reasons.

| Reason                | What happened                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `rejected`            | The mail server refused the email with a permanent error, a reply code from 500 to 599                              |
| `attempts_exhausted`  | The mail server deferred the email five times, each with a temporary error, a reply code from 400 to 499            |
| `retry_limit_reached` | The delivery itself kept failing, for example because the service's database did not answer, until 20 tries ran out |
| `sender_forbidden`    | The app asked to send from an address that its entry in the service's `producers.json` does not list                |

## How to check

1. Open the alert's panel, "Emails that ended, by app and outcome", on the Platform dashboard, in the row Email. It shows which app, and since when.
2. Find the email and its reason: in Grafana's Explore, pick Loki and run `{service_name="notifications-api"} | json | event=~"email.dead_lettered|email.sender_forbidden"`. Each line names the email's id, the app and the reason. A forbidden sender logs `email.sender_forbidden`, and the other three reasons log `email.dead_lettered`.
3. For `rejected` and `attempts_exhausted`, read the mail server's answers. Each try logs `email.retry_scheduled` with its reply code, and the trace of each try holds a span `smtp.send` with `smtp.response.code`. The full answer is in the service's database, in the table `email_attempts`. Open a shell on the host, as `docs/cloud-first-deploy.md` says under "How to open a shell", and run:

   ```bash
   sudo docker exec --user postgres notifications-notifications-postgres-1 psql --dbname notifications_api -c "select outcome, smtp_code, detail, created_at from email_attempts where email_id = '<id>' order by created_at"
   ```

   The answer can hold the recipient's address. Keep it out of issues, pull requests and chats.

4. For `retry_limit_reached`, read the errors of the delivery: `{service_name="notifications-api"} | json | event="email.delivery_failed"`.

## How to fix

| What you found                                             | What to do                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rejected`, and the answer says an address is not verified | Amazon SES is still in its sandbox, where it sends only to addresses it has verified. Production access is the owner's request to AWS. Until then, only verified recipients get email                               |
| `rejected` for the sender, the From address                | Every From address must be at `zigordev.com`, the domain SES has verified, as record 0029 says. Fix the sender in the app's request or in `producers.json`                                                          |
| `rejected` for any other reason                            | Read the answer in `email_attempts`. A message SES will not take, such as one too large, is fixed in the app that builds it                                                                                         |
| `attempts_exhausted`                                       | The server kept saying "later". If it happens again, look at SES's sending quota and rate in the AWS console, in Ireland, under Amazon SES, then Account dashboard. The sandbox allows 200 emails a day, 1 a second |
| `retry_limit_reached`                                      | Fix the cause that `email.delivery_failed` names. A database that does not answer has its own alerts                                                                                                                |
| `sender_forbidden`                                         | The app named a sender it may not use. Fix the app, or add the address to its entry in `apps/notifications-api/producers.json` of `notifications`, through a pull request                                           |

The service never sends a failed email again. Once the cause is fixed, the app that asked may send a new request, with a new id.
