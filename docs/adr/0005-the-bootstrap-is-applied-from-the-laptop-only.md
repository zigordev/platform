# 0005. The bootstrap is applied from the laptop only

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

An empty AWS account needs a few things before any pipeline can change it: a bucket for OpenTofu's state with its own key, GitHub's sign-in to AWS, a role for plans and a role for applies, and the budget alarm. They form step 3.1 of the build plan, the stack `infra/bootstrap`. The plan says the bootstrap is "applied once from the laptop with your OK, then managed like everything else".

Two facts make it unlike every other stack:

- It holds the pipeline's own way into AWS. A mistake in it can lock the pipeline out, and only the laptop can then repair it.
- It holds the GitHub environment `infrastructure`, whose approval rule guards every apply. Changing an environment needs administrator rights on the repo, which the pipeline does not have and should not get.

Before the restart, the sign-in provider was made by hand and the budget alarm never existed.

## Decision

`infra/bootstrap` is applied from the laptop only, with the owner's signed-in AWS session and GitHub login, after the owner has seen the plan and said yes. The pipeline plans it on every pull request that changes it, so each change is still reviewed as a plan, but it never applies it. Every other stack is applied by the pipeline, after the owner's approval in GitHub.

The owner chose this on 2026-11-23, over the pipeline applying it after the first time.

## Consequences

- The pipeline can never change its own sign-in, its own roles or the rule that makes it wait for the owner.
- No GitHub token with administrator rights is stored anywhere.
- An apply of the bootstrap needs the owner at the laptop. It changes rarely: a new repo that signs in to AWS, or a new budget.
- `docs/cloud-first-deploy.md` holds the exact commands, so the apply is the same each time.

## Alternatives considered

- **The pipeline applies it after the first time, like everything else.** One way for every change, as the plan first said. The GitHub environment would then move to another stack that the laptop applies, and a broken change to the roles would lock the pipeline out until someone repairs it from the laptop.
- **Keep it out of code after the first apply.** Rejected: it is how the sign-in provider ended up made by hand before.
