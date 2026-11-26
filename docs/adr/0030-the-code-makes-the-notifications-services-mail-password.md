# 0030. The code makes the notifications service's mail password

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

The notifications service sends through SES's SMTP endpoint in eu-west-1. It signs in with two secrets from its `.env.production.example`, `NOTIFICATIONS_API_SMTP_USER` and `NOTIFICATIONS_API_SMTP_PASSWORD`. Step 5.4 of the build plan puts that password in Parameter Store.

Checked on AWS's pages on 2026-11-25:

- **Where SMTP credentials come from.** They are made from an IAM user's access key. The user name is the key's id. The password comes from the key's secret, through a published algorithm. They work in one Region only.
- **No short-lived credentials.** AWS says not to make them from temporary credentials, so the key lives until it is replaced.
- **The right to send.** The SMTP interface needs `ses:SendRawEmail`. A policy limits sending to an identity by naming the identity's ARN.
- **Limits and price.** An IAM user may hold two access keys. IAM is offered at no additional charge, and so are standard parameters in Parameter Store.
- **The provider.** `aws_iam_access_key` makes the SMTP password itself, as `ses_smtp_password_v4`, in eu-west-1 among other Regions. Like the key's secret, it sits in the state.

Whoever holds the password can send mail as `zigordev.com`. SES signs that mail with the domain's DKIM key, so it passes DMARC.

Two earlier records went opposite ways on this kind of secret:

- [Record 0015](0015-the-owner-stores-the-tunnels-token.md) kept the tunnel's token out of the state, for a like reason.
- [Record 0016](0016-the-code-makes-grafanas-tokens-from-the-owners-one-token.md) let the code make Grafana's tokens, which sit in the state.

The plan job of every pull request from a branch of this repo can read that state. It already holds the Cloudflare token, which can change the domain's DNS.

On 2026-11-25 the owner was asked who makes the mail password, with three options. They chose, in their words: "A: the code".

## Decision

- **One user, one right.** `infra/email` makes the IAM user `notifications-smtp`. Its one policy allows `ses:SendRawEmail` on the identity `zigordev.com`, and nothing else.
- **The code makes the key and stores it.** The stack makes the user's access key, and writes two SecureStrings that the notifications service reads:
  - `/notifications/NOTIFICATIONS_API_SMTP_USER`, the key's id;
  - `/notifications/NOTIFICATIONS_API_SMTP_PASSWORD`, the SMTP password the provider makes from the key's secret.
- **A new password is a pull request.** `local.smtp.rotation` counts the key's generations. Raising it makes a new key before the old one goes.
- **No log shows a key's id.** The pipeline's logs hide access key ids, because AWS's `GetAccessKeyInfo` tells any AWS caller which account a key id belongs to.

## Consequences

- Nobody makes, copies or stores the mail password by hand, and no session sees it, now or after a leak.
- The key's secret and the password sit in the encrypted state of `infra/email`. The plan job of every pull request from a branch of this repo can read that state.
- After a new key, mail fails from the apply until notifications' next deploy reads the new values.
- The key does not expire. A leak is answered by raising the rotation.
- notifications' docs say these two values come from `platform`, not from the owner.

## Alternatives considered

- **The owner makes the key**, as record 0015 does for the tunnel's token.
  - The password would be in no state, log or session.
  - But the owner would run a command at the laptop, now and after each leak.
  - The key would be the one thing in AWS made by hand, and the code could not see it.
- **No password: SES's API with short-lived credentials.** This is how an enterprise works: no long-lived secret at all.
  - Containers cannot reach the host's role today: the host uses IMDSv2 with a hop limit of 1. Opening it would let every product on the host send mail.
  - The other way, IAM Roles Anywhere, needs certificates. They would come from a CA we run ourselves, or from AWS Private CA at $50 a month in short-lived mode, or $400 in general-purpose mode.
  - notifications would also move from SMTP to SES's API.
- **The code makes the key, encrypted for the owner** with `pgp_key`.
  - The state would hold only an encrypted password.
  - But the owner would need a PGP key, and would decrypt and store the value by hand.
