# 0014. Cloudflare holds one record per product, one route, and the HTTPS settings

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

Step 3.5 of the build plan puts `zigordev.com` on Cloudflare as code: the tunnel that the host opens outward, the DNS records, and the mail records. On 2026-11-24 the zone held no record at all, and its name servers were Cloudflare's.

The plan left one point open: whether one DNS record could cover every product. Checked on 2026-11-24 in Cloudflare's docs: a proxied wildcard record works "on all plans", the tunnel's ingress accepts a hostname such as `*.example.com`, and the free certificate covers the apex and first-level names only.

The zone's HTTPS settings, such as sending `http://` visitors to `https://`, were not in the code, and the token at the time could not read them.

On 2026-11-24 the owner took two choices, each from two options:

- How product addresses reach the host: "One per product (Recommended)", over one wildcard record for all.
- The HTTPS settings: "Settings as code (Recommended)", over Cloudflare's defaults. The owner's new token adds Zone Settings: Edit for that.

## Decision

- Every product has one proxied CNAME, `<product>.zigordev.com`, pointing at the tunnel. The records come from `local.products` in `infra/cloudflare/locals.tf`, one entry per product. The first entry is `hello`, the test page of step 3.9.
- The tunnel has one route: every `*.zigordev.com` name goes to Traefik's web entrypoint, `http://traefik:8080`, which routes by the labels each app carries. Anything else gets a 404.
- The zone turns on Always Use HTTPS and automatic HTTPS rewrites, and refuses TLS older than 1.2.
- Until SES sends, SPF names no sender (`v=spf1 -all`) and DMARC rejects whatever fails it (`p=reject; sp=reject`).

## Consequences

- DNS lists exactly what runs, and a name that is no product does not resolve.
- A new product is one line in `local.products` and one plan to approve. The tunnel needs no change for it.
- A change made by hand to a record or a setting shows in the weekly drift check.
- The token may change every setting of the zone, not only its DNS.
- Everything here costs nothing on Cloudflare's free plan.

## Alternatives considered

- **One wildcard record for all products.** No DNS change per product, but every name under the domain would answer, an unknown one with Traefik's 404, and DNS would no longer list what runs.
- **Cloudflare's default settings.** One permission fewer on the token, but the settings would live outside the code, and plain `http://` would stay open until a later step closed it.
