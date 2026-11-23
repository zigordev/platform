# 0008. The pipeline changes GitHub through one GitHub App

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

Step 3.3 of the build plan turns the settings of every repo into code, in the stack `infra/github`: how a pull request merges, the ruleset on `main`, the environment `release`, the security settings, the workflow token and the label `destructive-migration`. The pipeline plans that code on every pull request, applies it after the owner's approval, and plans it every week to find drift. Most of these settings need admin rights even to be read, and the token GitHub gives each workflow has none.

On 2026-11-23 the owner was asked "How should the pipeline get the right to change GitHub's settings?", with four options, and chose, in their words: "One GitHub App".

## Decision

- The owner's account holds one GitHub App, app 5889897, installed on all of the account's repos as installation 185052691. Both numbers are in `infra/github/locals.tf`.
- The app holds three repository rights, each read and write: Administration, Issues, for the labels, and Variables. It holds no right to code, secrets or Actions.
- Its private key is the SecureString `/platform/GITHUB_APP_PRIVATE_KEY` in Parameter Store, which only the owner stores, replaces and deletes. The stack reads it through a data source, and the GitHub provider signs in with `app_auth`. Each run gets a token that lasts one hour.
- The app's sign-in wins over the workflow token that the pipeline also sets: a plan made with a wrong `GITHUB_TOKEN` beside it still signed in on 2026-11-23.

## Consequences

- No admin token of the owner's sits in GitHub or in a file, and a change the pipeline makes shows as the app's.
- The key does not expire. If it leaks, the owner deletes it on the app's page and stores a new one.
- The plan job can read the key, as it can read the Cloudflare and Grafana tokens. A pull request from a branch of this repo could misuse it. A pull request from a fork never runs the plan.
- Administration also lets the app delete a repo. Every repo in the stack sets `archive_on_destroy`, so taking one out of the code archives it, and every apply waits for the owner.
- Two settings stay outside the code. The subject of GitHub's sign-in to AWS: provider 6.13.0 cannot express the immutable form that the AWS roles trust, so managing it could break the sign-in. And the ruleset's extra approval for unattributed changes, which the provider does not know, so a change to the ruleset through the code may reset it.
- The environment `infrastructure` stays in the bootstrap, which created it.

## Alternatives considered

- **Two GitHub Apps**, read-only for plans and write for applies. The enterprise way, and the same split as the two AWS roles, at twice the setup. To be consistent, Cloudflare and Grafana would then need read-only tokens for plans too.
- **The owner's fine-grained token** in Parameter Store. One form and no app, but it acts as the owner, and it lasts at most 366 days or never expires.
- **Laptop only, like the bootstrap.** No credential in the pipeline, but the weekly drift check could not read the admin settings, and every change would wait for a laptop session.
