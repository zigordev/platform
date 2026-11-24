# 0016. The code makes Grafana's tokens from the owner's one token

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

Step 3.6 of the build plan puts Grafana Cloud in the code. It needs three credentials beside the owner's own token: one for the code and the pipeline to manage the stack, one for the telemetry agent to write metrics, logs and traces, and one for the outside checks.

On 2026-11-23 the owner made one Grafana Cloud token, stored as `/platform/GRAFANA_CLOUD_TOKEN`, with five scopes chosen for this: `stacks:read`, `accesspolicies:read`, `accesspolicies:write`, `accesspolicies:delete` and `stack-service-accounts:write`. [Record 0015](0015-the-owner-stores-the-tunnels-token.md) kept the tunnel's token out of the OpenTofu state instead, because that token can serve traffic for every product.

On 2026-11-24 the owner was asked who should make the three Grafana tokens, with two options, and chose, in their words: "The code makes them (Recommended)".

## Decision

- The stack `infra/grafana-cloud` makes, from the owner's token:
  - the token `platform-alloy`, which only writes metrics, logs and traces;
  - the token `platform-read`, which only reads them, for the data sources;
  - the token `platform-checks`, with the four scopes the outside checks ask for, and their installation;
  - the stack account `platform-opentofu`, an Admin of this stack only, and its token.
- Every policy covers this one stack, never the organisation.
- The four secrets are SecureStrings in Parameter Store, `/platform/GRAFANA_STACK_TOKEN`, `/platform/GRAFANA_ALLOY_TOKEN`, `/platform/GRAFANA_READ_TOKEN` and `/platform/GRAFANA_CHECKS_TOKEN`. The stack's addresses and ids sit beside them as plain strings.
- Each token's name ends in `local.rotation`. Raising that number in a pull request replaces all four.
- The stack's numeric id is marked sensitive, and the pipeline plans with `-concise`, so no Grafana id reaches the public run summary.

## Consequences

- No Grafana token is made by hand after the first one, and a new token is a pull request.
- The tokens sit in the encrypted state of `grafana-cloud`, which the plan job of every pull request from a branch of this repo can read, as it already reads the GitHub App's key and the Cloudflare token.
- The tokens do not expire. A leak is answered by raising the rotation.

## Alternatives considered

- **The owner makes them.** Nothing new in the state, but three tokens by hand now and at each renewal, and the outside checks would first need a setup in Grafana's pages.
- **Tokens that rotate by themselves**, `grafana_cloud_access_policy_rotating_token` in the provider. They expire and renew on an apply, but only an apply after a merge renews them, and every renewal would wait for the owner's approval.
