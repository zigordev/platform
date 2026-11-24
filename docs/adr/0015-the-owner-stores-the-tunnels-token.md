# 0015. The owner stores the tunnel's token

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

The Cloudflare tunnel connects the host to Cloudflare. Its connector, `cloudflared`, runs on the host and signs in with the tunnel's token. Whoever holds that token can serve traffic for every product's address.

`infra/cloudflare` creates the tunnel with its configuration held by Cloudflare. Cloudflare then creates the tunnel's secret itself. The provider could read the token through a data source, `cloudflare_zero_trust_tunnel_cloudflared_token`, and the code could store it in Parameter Store. The token would then sit in the OpenTofu state, which the plan job of every pull request from a branch of this repo can read.

The pre-steps of the plan say: "You store every secret yourself, with a command that reads it without showing it, so I never see a value." The core rules add that a session never sets a secret.

On 2026-11-24 the owner accepted this record by answering "Merge" to the question whether to merge platform#29, which accepts record 0015.

## Decision

- The code creates the tunnel and never reads its token.
- After the tunnel exists, the owner copies its token from Cloudflare and stores it as the SecureString `/platform/CLOUDFLARE_TUNNEL_TOKEN` in Parameter Store, with a command that shows nothing. `docs/cloud-first-deploy.md` holds the steps.
- The host reads only that parameter when it starts `cloudflared`, from step 3.7. Its role gets read access to that one name then.

## Consequences

- The token is in no state file, no log and no session.
- One step after the first apply is the owner's, and so is a new token after a leak: Cloudflare's dashboard makes a new one, and the same command stores it.
- `cloudflared` cannot start before the owner has stored the token. Step 3.7 checks for it and names it when it is missing.

## Alternatives considered

- **The code stores the token.** No step for the owner, but the token would sit in the state that every branch's plan can read, and the code would set a secret.
- **A locally managed tunnel with a secret from the code.** The secret would be a value in the state as well, and the tunnel's routes would live in a file on the host instead of in the code.
