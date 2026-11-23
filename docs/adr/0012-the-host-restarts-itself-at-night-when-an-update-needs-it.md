# 0012. The host restarts itself at night when an update needs it

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

The host installs Ubuntu's security updates by itself every day. Most take effect at once. A new kernel, and a few libraries every process holds, take effect only after a restart, and a restart stops every product on the one host for about 2 minutes.

The enterprise way restarts nothing that visitors use: two or more servers take turns, so nobody notices. Here that needs a second server and the databases moved off the servers, because a database on a server still stops when that server restarts. Checked on 2026-11-23 against the vendors' pages and AWS's price list for Ireland:

| Part                                                               | A month                                         |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| A second t4g.small, with its disk and public address               | $18.84. AWS's free trial covers one server only |
| Traffic to whichever server answers: one Cloudflare Tunnel on both | $0. An AWS load balancer would add about $26    |
| AWS's managed PostgreSQL, db.t4g.micro with a standby copy, 20 GB  | $30.63, for all products on one server          |

From 2027-01-01 that is about $68 a month instead of about $21, and it changes four decisions of the plan: one host, the host itself, one PostgreSQL server per product, and the backups.

On 2026-11-23 the owner was asked when the host should restart for such an update, with four options, the enterprise way among them, and chose, in their words: "At night (Recommended)".

## Decision

- When an installed update needs a restart, the host restarts itself at 03:00 UTC: 04:00 in Madrid in winter, 05:00 in summer.
- It restarts only when an update asked for it, never on a schedule of its own.
- The setting is `Unattended-Upgrade::Automatic-Reboot-Time` in `host/root/etc/apt/apt.conf.d/52platform-unattended-upgrades`.

## Consequences

- A kernel fix takes effect within a day, and nobody has to remember it.
- Every product is down for about 2 minutes on such a night, at an hour when the products have almost no visitors.
- If the host does not come back, the outside check notices within 10 minutes and alerts the owner's phone, once step 3.6 has set up the checks.
- The enterprise way stays open. It comes back as its own step when a product earns money or promises its users that it stays up.

## Alternatives considered

- **The enterprise way**, as priced above. Visitors would notice no restart, at more than three times the price, and with four decisions of the plan to change first.
- **Weekday mornings**, when the owner can react, as Renovate merges on weekdays between 08:00 and 18:00. The outage then falls while people use the products, and a weekend's fixes wait until Monday.
- **Never by itself.** The host reports that it needs a restart, and the owner restarts it through AWS. No surprise outage, but a kernel fix waits for a free moment, possibly for weeks.
- **Canonical's Livepatch**, which applies the worst kernel fixes without a restart. Its free tier covers personal use on up to 5 physical machines, which does not clearly include a cloud server that serves users, and Canonical says it is "not a replacement for rebooting".
