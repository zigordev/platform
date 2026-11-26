# The mail server cannot be reached

## What it means

The notifications service checks its mail server every 30 seconds: it connects, starts TLS and signs in. For 10 minutes every check has failed. In production the mail server is Amazon SES's SMTP endpoint, `email-smtp.eu-west-1.amazonaws.com` on port 587. On the laptop it is Mailpit.

While the check fails, the service pauses delivery on purpose. Every email waits in its queue, nothing is lost, and the emails go out once a check passes. So the alert fires even when no email waits: it warns before anyone waits for one. When emails do wait, [Jobs are waiting](jobs-are-waiting.md) fires too, after 15 minutes.

The usual causes: the service's mail password stopped working, SES is down in Ireland, or the host cannot reach the internet.

## How to check

1. Open the alert's panel, "The mail server answers", on the Platform dashboard, in the row Email. It shows 0 since the checks began to fail.
2. Read why: in Grafana's Explore, pick Loki and run `{service_name="notifications-api"} | json | event="provider.unavailable"`. The service writes this line once, when the checks begin to fail. Its `errorClass` and `smtpCode` say what failed.

   | `errorClass` or `smtpCode`                      | Means                                                 |
   | ----------------------------------------------- | ----------------------------------------------------- |
   | `EAUTH`, or `535`                               | The server refused the sign-in: the password is wrong |
   | `ECONNECTION`, `ETIMEDOUT`, `ESOCKET` or `EDNS` | The server could not be reached at all                |
   | `ETLS`                                          | TLS failed, on the host's side or on the server's     |
   | `421` or `454`                                  | The server is busy, or limits the rate                |

3. Look for a new password. The password is made by `infra/email` in this repo, and a pull request that raises `local.smtp.rotation` makes a new one and deletes the old one. The running service keeps the password it read at its last deploy. Compare the time of the last apply of `infra/email` with the time of notifications' last deploy, which `https://notifications.zigordev.com/health` names as `version`.
4. Look at SES itself: the AWS Health Dashboard, for Amazon SES in Ireland, eu-west-1.
5. See whether the host reaches the internet: the other outside services, such as Grafana Cloud, still get its telemetry when it does.

## How to fix

| What you found                                  | What to do                                                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EAUTH` after a new password                    | Deploy notifications again, so it reads the new password from Parameter Store: merge any change to its `main`. A deploy by hand waits for the owner's yes                                     |
| `EAUTH` without a new password                  | The key or the user's policy differs from the code. Run the plan of `infra/email`, and put the code back through a pull request. Nobody stores the mail password by hand, as record 0030 says |
| `ECONNECTION`, `ETIMEDOUT` or `EDNS`, SES is up | The host cannot reach SES. Look at the host's network in AWS, and at the other alerts                                                                                                         |
| SES is down                                     | Wait for AWS. The emails wait, and go out once SES answers                                                                                                                                    |
| `421` or `454` for long                         | SES limits the rate. Look at its sending quota in the AWS console, in Ireland, under Amazon SES, then Account dashboard                                                                       |

The service logs `provider.recovered` when a check passes again, and delivery goes on by itself.
