# 0019. A deploy is one command per target, and the host checks what it runs

- Status: proposed
- Date: 2026-11-24
- Supersedes: none

## Context

Step 3.7 of the build plan asks for this deploy path. The pipeline asks the host, through AWS Systems Manager, to run one commit of one app. One deploy runs at a time per app, and a run that was overtaken skips itself. Only images our own pipeline built may run, and a bad version rolls back.

Three ways in had to be closed:

- A stolen deploy role.
- A commit that is not on `main`. GitHub serves a fork's commits through the parent repo's address, so a commit that the repo's address serves can still be someone else's.
- A registry tag that is pushed again between the check and the pull.

docker-rollout v0.14 (MIT, 2026-07-12) starts a service's new container beside the old one, waits for its health, runs a hook in the old one, then stops it. When a service runs no container yet, it starts one without waiting for its health. Its script also sets a variable of its own named `VERSION`: on 2026-11-24 a trial on the laptop showed that a rolled-out container then got `v0.14` as its version instead of the commit.

EC2 takes at most 16 KB of user data. With the deploy script, the host's files came to 35 KB on 2026-11-24, and to 12 KB compressed.

On 2026-11-24 the owner chose where the version record lives ([record 0020](0020-the-host-records-each-deployed-version-in-parameter-store.md)), and how the host gets AWS's command-line tool, in their words: "AWS's snap (Recommended)".

## Decision

- **One command and one role per target.** A target is the shared services, or a product whose entry in `infra/products.json` names its repo. Each gets the command document `platform-deploy-<target>` and the role of the same name.
- **The document fixes everything but three values.** It names the target, its repo and its compose folder. The caller passes only the action, the commit and the images, and each is held to a pattern.
- **The role trusts one environment.** It trusts only GitHub's subject for the environment `production` of the target's repo, which runs from `main` only. It may send its own document to the host, found by its tag, and read the result.
- **The host checks before it changes anything.** `platform-deploy` holds one lock per target and fetches `main` of the repo. It refuses a commit that is not on `main`, and skips one that is older than the running version. It reads the compose files and `.env.production.example` from that commit. It refuses a missing secret by name, an image of ours without a verified digest, and an outside image without its digest.
- **The host runs exactly what was verified.** It pulls our images by digest and tags them with the commit on the host. It fills in the compose files once, with the version and the secrets, into one file under `/run` that only root can read, and every later step, docker-rollout included, runs that file with nothing left to fill in. The file goes when the deploy ends. It starts the data stores, runs the jobs, and rolls out each service that Traefik routes with docker-rollout. When a step fails it puts the previous version back. It records a version only after every step has passed.
- **The answer is one line.** The last line of output is the result, in one fixed format. The output stays short and never holds a secret.
- **A new host brings back what was recorded.** A service that starts with Docker brings back every recorded version on a host that runs none of a target's containers, the shared services first.
- **The host gets its tools at the first boot.** That is git, jq, the AWS CLI from AWS's snap (track v2/stable), and docker-rollout at one commit, checked against its hash. The user data is compressed.

## Consequences

- A stolen role can only run a commit of `main` of its own repo again, or roll its own target back.
- The toolkit workflow verifies the build records, and the host pins what it verified, so a tag pushed again changes nothing.
- A change to the deploy script rebuilds the host, as every file under `host/root` does ([record 0009](0009-the-host-is-built-at-its-first-boot-and-rebuilt-on-a-change.md)). The compressed user data leaves about 4 KB of room.
- An OpenTofu upgrade that compresses differently would rebuild the host too, and its plan would show it.
- A product's compose files must meet the rules that `docs/cloud-first-deploy.md` lists.

## Alternatives considered

- **The host reads the files from GitHub's raw address.** It serves a fork's commits too. Telling them apart would take GitHub's API, which allows 60 calls an hour without a token.
- **The workflow sends the compose files with the command.** A command's size is limited, and the trust would move to the runner.
- **The host verifies the build records itself.** That needs Sigstore's tools on the host, and the pipeline already verifies them.
- **The script reaches the host through Systems Manager, not the user data.** A change would then need no rebuild. But it adds parts, and the service that brings deploys back at boot would race the delivery. It stays possible later.
- **Uncompressed user data.** It is over EC2's limit.
