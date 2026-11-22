# 0001. This repo records its own decisions, and toolkit the platform's

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

The plan for the restart of 2026-11-21 has 32 decisions, and the owner took each of them. Many of them are about what this repo holds: the host, the ingress, the telemetry, the secrets and the backups. They are recorded in `toolkit`, as its records 0001 to 0032, because `toolkit` was the first repo and holds the handbook.

The plan also says that the decision records restart at 0001 in each repo. Without a rule, the same decision could be written down twice, once there and once here, and the two copies would drift apart.

## Decision

A decision is recorded once, in the repo that owns what it is about.

- A decision that shapes the whole platform, or more than one repo, is recorded in `toolkit`.
- A decision about how this repo is built is recorded here: the layout of its folders, the shape of the shared services, the dashboards, the alert rules, and later the infrastructure code.
- A record here that follows from a record in `toolkit` names it and does not repeat it.

## Consequences

- A reader who asks why the platform has a piece looks in `toolkit`. A reader who asks why the piece is built the way it is looks here.
- No decision has two records.
- A record here can be short, because the reasons for the piece itself are already written down.
- A reader has to know the rule to find a record. The index of each repo says it in its first lines.

## Alternatives considered

- **Copy the records about this repo's pieces from `toolkit` into this repo.** Everything about the repo would be in one place, and every copied record would have to be kept the same in two places.
- **Move those records here.** `toolkit` would lose the complete list of the plan's decisions, and an accepted record is never edited or moved.
