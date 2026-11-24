# 0023. The host is rebuilt on purpose by raising its generation

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

[Record 0009](0009-the-host-is-built-at-its-first-boot-and-rebuilt-on-a-change.md) builds the host at its first boot, and rebuilds it when a file under `host/root` or the user data changes. Until 2026-11-24 that was the only way to get a new host from code. A host that misbehaved could be rebuilt only by changing a file for some other reason.

Step 3.9 of the build plan needs the host destroyed and rebuilt on purpose, with the test product serving again within 1 hour. Nothing in AWS is changed by hand, so the rebuild has to come from a pull request and the owner's approval of its apply.

## Decision

`host/root/etc/platform/generation` holds a whole number. A pull request that raises it rebuilds the host through record 0009's rule. Nothing else reads it. The host keeps the number at `/etc/platform/generation`, which tells which generation runs. A test holds the file to a whole number above zero. The owner chose this on 2026-11-24.

## Consequences

- Rebuilding a sick host is a one-line pull request with its reason in the description. The plan shows the replacement before the owner approves it.
- Adding the file rebuilds the host once, which is step 3.9's test.
- The file has no other job, and its number only grows.

## Alternatives considered

- A number in `infra/host` that OpenTofu ties to the instance through `replace_triggered_by`. It is the usual OpenTofu way and puts nothing on the host. But OpenTofu does not replace the instance when the lever is first added, so the first rebuild would take two pull requests and two approvals.
- No lever: the next real change to the host rebuilds it. That mixes a behaviour change into each planned rebuild, and leaves no plain way to rebuild a sick host.
- A workflow that runs `tofu apply -replace` by hand. It needs no change in git, so the reason for a rebuild is not kept beside the code, and running a pipeline job by hand waits for the owner anyway.
