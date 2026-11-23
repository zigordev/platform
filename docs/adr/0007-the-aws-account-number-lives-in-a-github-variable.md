# 0007. The AWS account number lives in a GitHub variable

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

The pipeline signs in to AWS with GitHub's token, and the sign-in action needs each role's full name, which holds the account's 12-digit number. AWS says account numbers "are not considered secret", and the action can hide the number in the logs. The repo is public, and its rules keep account numbers, addresses and other personal values out of git.

## Decision

The account number is the repository variable `AWS_ACCOUNT_ID`, which the owner set once. The pipeline builds each role's name from `vars.AWS_ACCOUNT_ID`, and every sign-in sets `mask-aws-account-id: true`. The script that plans also replaces the number in the summaries it writes.

The owner chose this on 2026-11-23, over writing the number into the pipeline file.

## Consequences

- Nobody who reads the public repo learns which account to aim at.
- One value lives outside the code. If it is missing, every sign-in fails, and "Looking after it" in `docs/cloud-first-deploy.md` says so.
- A session never sets the variable: the owner does.

## Alternatives considered

- **The number in the pipeline file.** Simplest, with nothing to set, and AWS does not count it as secret. The repo's rule against account numbers in git would have changed.
