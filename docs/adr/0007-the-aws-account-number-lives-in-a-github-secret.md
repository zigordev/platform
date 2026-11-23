# 0007. The AWS account number lives in a GitHub secret

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

The pipeline signs in to AWS with GitHub's token, and the sign-in action needs each role's full name, which holds the account's 12-digit number. AWS says account numbers "are not considered secret". The repo is public, its run logs are public, and its rules keep account numbers, addresses and other personal values out of git.

The first version of this decision kept the number in a repository variable. Its first run, on 2026-11-23, printed the number in the sign-in step's inputs, in the public log. GitHub hides a secret in every line by itself. It hides another value only once a step asks it to, and the sign-in action asks for the account number only after its own inputs are printed.

## Decision

The account number is the repository secret `AWS_ACCOUNT_ID`, which the owner sets. The pipeline builds each role's name from `secrets.AWS_ACCOUNT_ID`, so GitHub hides the number in every log line. Every sign-in also sets `mask-aws-account-id: true`, and the script that plans replaces the number in the summaries it writes. A test fails if either workflow reads `vars.AWS_ACCOUNT_ID`.

The owner first chose a variable, believing the sign-in would hide the number in the logs. The first run showed that it did not, and on 2026-11-23 the owner chose a secret instead.

## Consequences

- From this change on, neither the repo nor its run logs tell a reader which account to aim at.
- One value lives outside the code. If it is missing, every sign-in fails, and "Looking after it" in `docs/cloud-first-deploy.md` says so.
- A session never sets, rotates or deletes the secret: the owner does.

## Alternatives considered

- **A repository variable.** Tried first: the number shows in the public log of every run that signs in.
- **The number in the pipeline file.** Simplest, with nothing to set, and AWS does not count it as secret. The repo's rule against account numbers in git would have changed.
