# 0011. The only way into the host is AWS Systems Manager

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

The plan gives the host no inbound port: visitors arrive through the Cloudflare Tunnel, and a person arrives through AWS Systems Manager. The agent of Systems Manager runs on the host and calls out to AWS, so it needs no open port, and AWS checks every session against the owner's sign-in.

The agent needs an instance role. AWS's managed policy for it, `AmazonSSMManagedInstanceCore`, also allows `ssm:GetParameter` on every parameter. With it, any process on the host as root could read every secret in Parameter Store, the GitHub App's key of [record 0008](0008-the-pipeline-changes-github-through-one-github-app.md) among them.

On 2026-11-23 the owner accepted this record by answering "Merge" to the question whether to merge platform#26, which accepts records 0009 to 0011.

## Decision

- The host's security group lets nothing in, and the network's default security group holds no rule at all.
- The host has no SSH key, and its SSH server is switched off and masked at the first boot.
- The host's role holds the actions of `AmazonSSMManagedInstanceCore` without `ssm:GetParameter` and `ssm:GetParameters`. A later step that needs a parameter adds read access to that product's own path only.
- The metadata service answers only with a session token, and its hop limit is 1, so a container never reaches the role.
- A session is not recorded. AWS CloudTrail's free event history keeps who opened a session and when, for 90 days.

## Consequences

- A port scan of the host finds nothing, and a key that leaks opens nothing.
- When the agent of Systems Manager breaks, nobody gets in. The host is rebuilt instead, as [record 0009](0009-the-host-is-built-at-its-first-boot-and-rebuilt-on-a-change.md) allows.
- A shell needs the owner's AWS sign-in and either the AWS console or the Session Manager plugin for the AWS command line.
- What was typed in a session is not kept. That keeps secrets and personal data on screen out of any log, as the core rules require.

## Alternatives considered

- **SSH with a key, behind a security group open to one address.** The familiar way, but a key to store and rotate, and a port that answers.
- **Record every session to S3 or CloudWatch Logs.** The enterprise way, and under a cent a month here, but a recording keeps whatever a session shows, secrets and users' data included.
- **The managed policy as it is.** One line instead of a policy, but every secret in the account readable from the host.
