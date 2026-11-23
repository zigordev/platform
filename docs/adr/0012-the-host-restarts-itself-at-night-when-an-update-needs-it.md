# 0012. The host restarts itself at night when an update needs it

- Status: proposed
- Date: 2026-11-23
- Supersedes: none

## Context

The host installs Ubuntu's security updates by itself every day. Most take effect at once. A new kernel, and a few libraries every process holds, take effect only after a restart, and a restart stops every product on the one host for about 2 minutes.

The enterprise way restarts nothing that visitors use: two or more servers behind a load balancer take turns, so nobody notices. This plan has one server and no load balancer.

## Decision

- When an installed update needs a restart, the host restarts itself at 03:00 UTC: 04:00 in Madrid in winter, 05:00 in summer.
- It restarts only when an update asked for it, never on a schedule of its own.
- The setting is `Unattended-Upgrade::Automatic-Reboot-Time` in `host/root/etc/apt/apt.conf.d/52platform-unattended-upgrades`.

## Consequences

- A kernel fix takes effect within a day, and nobody has to remember it.
- Every product is down for about 2 minutes on such a night, at an hour when the products have almost no visitors.
- If the host does not come back, the outside check notices within 10 minutes and alerts the owner's phone, once step 3.6 has set up the checks.

## Alternatives considered

- **Weekday mornings**, when the owner can react, as Renovate merges on weekdays between 08:00 and 18:00. The outage then falls while people use the products, and a weekend's fixes wait until Monday.
- **Never by itself.** The host reports that it needs a restart, and the owner restarts it through AWS. No surprise outage, but a kernel fix waits for a free moment, possibly for weeks.
