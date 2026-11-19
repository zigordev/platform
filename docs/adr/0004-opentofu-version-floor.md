# 0004. Stacks state their OpenTofu version in a language block

- Status: accepted
- Date: 2026-11-19
- Supersedes: none

## Context

The bootstrap stack declared `required_version = "~> 1.13.0"` in `versions.tf`. On 2026-11-19 Renovate read that line as Terraform's version: [#6](https://github.com/zigordev/platform/pull/6) changed it to `~> 1.17.0`, a Terraform release, and merged with every check green. OpenTofu's docs keep the top-level `terraform` block for compatibility with Terraform, and OpenTofu 1.13.9 does not enforce `required_version` in a `.tf` file. `init` and `validate` pass with `< 1.0.0` there, and fail with "Incompatible module" once the same constraint sits in a `.tofu` file. The stack never had a version check that OpenTofu applied. Since 1.12, OpenTofu reads its own constraint from a `language` block, apart from any other tool's.

## Decision

- `mise.toml` pins the exact OpenTofu version, and Renovate proposes its updates.
- Each stack states the lowest OpenTofu version it accepts in `opentofu.tofu`, as `language { compatible_with { opentofu = ">= x.y.z" } }`. OpenTofu checks it at `init`, so CI's `Infra` job fails when the pinned version is below it.
- No `.tf` file sets `required_version`. tflint's `terraform_required_version` rule is off, and Renovate never updates a `required_version`.

## Consequences

- Renovate's updates of the mise pin pass without touching the stacks, because the constraint is a floor.
- Raising the floor is a deliberate edit, made when a stack starts to rely on a newer OpenTofu feature.
- The stacks were already OpenTofu-only because of the state encryption block, so nothing is lost for Terraform.
- The file is named `opentofu.tofu`, never `versions.tofu`: OpenTofu loads a `.tofu` file instead of the `.tf` file with the same name, so `versions.tofu` would hide the providers in `versions.tf`.

## Alternatives considered

- `required_version` in a `terraform` block of a `.tofu` file: OpenTofu enforces it there too, but it is the attribute Renovate and tflint treat as Terraform's, and OpenTofu added the `language` block to keep its own constraint apart.
- Teaching Renovate to look up OpenTofu's releases for `required_version`: the line would still be ignored in a `.tf` file, and a `~>` constraint would make every OpenTofu minor update change the pin and every stack in one PR.
- Renaming every stack file to `.tofu`: a larger change for one constraint, while the linters and Renovate are built around `.tf` files.
