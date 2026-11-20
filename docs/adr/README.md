# Decision records

This repo's decisions. The estate-wide decisions, including the platform's stack (ADRs 0013 to 0016), live in [toolkit's decision records](https://github.com/zigordev/toolkit/blob/main/docs/adr/README.md).

| #                                                     | Decision                                                                                | Status                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------- |
| [0001](0001-hybrid-local-platform.md)                 | The local platform runs shared services in Docker and apps as processes                 | partly superseded by 0006 |
| [0002](0002-app-registry-provisions-databases.md)     | The app registry provisions one database and role per app                               | accepted                  |
| [0003](0003-encrypted-state-and-ci-roles.md)          | OpenTofu state lives encrypted in S3, and CI plans and applies through GitHub's sign-in | partly superseded by 0005 |
| [0004](0004-opentofu-version-floor.md)                | Stacks state their OpenTofu version in a language block                                 | accepted                  |
| [0005](0005-merges-apply-the-approved-plan.md)        | Merges apply the plan the owner approved                                                | accepted                  |
| [0006](0006-local-platform-runs-released-apps.md)     | The local platform runs the apps other apps call, from their released images            | accepted                  |
| [0007](0007-flagd-serves-each-apps-flags.md)          | flagd serves each app's flags from its registry folder                                  | accepted                  |
| [0008](0008-local-only-apps-in-the-registry.md)       | Local-only apps live in the registry                                                    | accepted                  |
| [0009](0009-alloy-receives-browser-telemetry.md)      | Alloy receives browser telemetry                                                        | accepted                  |
| [0010](0010-dashboards-are-code-from-the-registry.md) | Dashboards are code, generated from the registry                                        | accepted                  |
| [0011](0011-alert-rules-are-code-with-runbooks.md)    | Alert rules are code, with runbooks                                                     | accepted                  |
| [0012](0012-database-roles-have-guardrails.md)        | Database roles have guardrails                                                          | accepted                  |

A new decision is a new record from [the template](template.md) with the next number, added here in the same PR. Accepted records are never edited.
