# 0006. The apply role is an administrator, behind the owner's approval

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

The pipeline signs in to AWS with two roles that the bootstrap creates. The plan role reads, so that a pull request can show what would change. The apply role changes AWS, so that a merged change takes effect.

The infrastructure code will reach EC2, EBS, S3, KMS, IAM, Systems Manager, Parameter Store, SES, Budgets and Cost Explorer by phase 5, and more later. A role that changes IAM roles can, in effect, give itself any right, so a narrow list of services stops mistakes rather than a determined misuse.

The apply role can only be reached from a job that runs in the GitHub environment `infrastructure`, from `main`, after the owner approves that run in GitHub. A sign-in lasts one hour.

## Decision

The apply role holds AWS's managed policy `AdministratorAccess`. What guards it is the way in: only a job in the environment `infrastructure`, only from `main`, only after the owner's approval, and for one hour at most. The plan role holds `ReadOnlyAccess`, and may write nothing but the state's lock file.

The owner chose this on 2026-11-23, over a policy that lists only the services the code uses, and over a boundary that guards the bootstrap's own roles. That boundary is the step up if a second person ever approves.

## Consequences

- A new AWS service in the code needs no change to the roles, so no extra trip through the bootstrap.
- The owner's approval in GitHub is the one control on every change to AWS. Each approval shows the plan that will run.
- A leaked approval, or a mistake in an approved plan, can change anything in the account. The budget alarm and the daily check for odd spending report a cost surprise within a day.

## Alternatives considered

- **A policy that lists only the services the code uses.** Least privilege on paper. Each new service needs a change to the bootstrap first, from the laptop, and the IAM rights the code needs still let the role widen itself.
- **Administrator, plus a permissions boundary that forbids touching the bootstrap's own roles, state and key.** Stronger against a bad plan. It is more code to get right, and a boundary mistake blocks the pipeline.
