# 0029. SES sends as the domain with Easy DKIM, and DMARC passes on DKIM alone

- Status: proposed
- Date: 2026-11-25
- Supersedes: none

## Context

The notifications service sends every product's mail through AWS SES in eu-west-1, as toolkit's [record 0042](https://github.com/zigordev/toolkit/blob/main/docs/adr/0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) says. Its production settings already name SES's SMTP endpoint in that region. On 2026-11-25, AWS refused SES production access within minutes. SES held no identity at all, and AWS's page says a verified domain helps such a request.

Since step 3.5, the zone has said `v=spf1 -all` for SPF and `p=reject; sp=reject; adkim=s; aspf=s` for DMARC. [Record 0014](0014-cloudflare-holds-one-record-per-product-and-the-https-settings.md) wrote that they hold "until SES sends".

Checked on AWS's pages on 2026-11-25:

- **Easy DKIM.** SES makes the key pair, keeps the private key, and signs every message. The domain publishes three CNAME records, `<token>._domainkey.<domain>`. A 2048-bit key is the default, and the length AWS prefers.
- **DMARC.** A message passes DMARC when SPF or DKIM passes for its From domain. SPF can align only through a custom MAIL FROM domain, which must be a subdomain, and only when DMARC does not say `aspf=s`.
- **Where the records point.** The CNAME values point into the identity's `SigningHostedZone`, which AWS says "varies by AWS Region and can differ between identities". AWS's table gives `dkim.amazonses.com` for eu-west-1. AWS provider 6.74.0 returns the tokens, but not that zone.
- **Price.** The pricing page names no charge for an identity or for DKIM.

## Decision

- **A new stack holds SES's side.** The stack `infra/email` holds SES's side of sending mail. Today that is two things. The first is the domain identity `zigordev.com` in eu-west-1, signed by Easy DKIM with a 2048-bit key. The second is its three DKIM records in Cloudflare: CNAMEs that Cloudflare does not proxy. The later pieces of sending mail go there too.
- **The records point at `<token>.dkim.amazonses.com`.** After the first apply, two values must hold:
  - `aws sesv2 get-email-identity` shows `dkim.amazonses.com` as the `SigningHostedZone`.
  - The DKIM status reads `SUCCESS`.
    If the zone differs, the code takes AWS's value.
- **Every From address is at `zigordev.com` itself, never at a subdomain.** DKIM signs as `zigordev.com`, and DMARC asks for strict alignment.
- **SES keeps its own envelope domain.** There is no custom MAIL FROM domain. SPF of the apex stays `v=spf1 -all`, and DMARC passes on DKIM alone.

## Consequences

- One apply makes the identity and its records. SES verifies the domain by itself once DNS answers. The owner then asks AWS for production access again.
- No private key exists in the code or in the state.
- A message whose DKIM signature breaks fails DMARC, and receivers reject it, because no aligned SPF backs it up. A forwarder that rewrites the message is the usual cause.
- The Return-Path header shows SES's domain, not ours.
- `infra/cloudflare` keeps the domain's own mail policy, SPF and DMARC. `infra/email` holds the records that belong to SES.

## Alternatives considered

- **Bring our own DKIM key.** We would choose the selector, and every record would be known at plan time. But the private key would sit in the state, and rotating it would be our job.
- **A 1024-bit key.** AWS offers it, and it is weaker. Its one advantage, fitting in a single DNS string, does not matter for CNAME records.
- **A custom MAIL FROM domain, such as `bounce.zigordev.com`.**
  - It adds aligned SPF and puts our name in the Return-Path, for two more records.
  - It aligns only once DMARC relaxes `aspf=s` to `aspf=r`.
  - At a few messages a day, DKIM alone carries DMARC.
  - It can come later, with that change, if delivery needs it.
- **The identity inside `infra/cloudflare`.** One stack fewer, but an AWS service would live in the DNS stack, and the sending credentials of step 5.4 would have no home there.
- **The identity made in SES's console.** The console's wizard also asks for a pricing plan, and AWS changes only as code.
