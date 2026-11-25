# 0027. The broker formats its own storage, and one list holds its topics, users and rules

- Status: proposed
- Date: 2026-11-25
- Supersedes: none

## Context

Toolkit's records 0039 to 0043 put one Kafka broker in `@zigordev/stack` and on the host. Every client signs in with SCRAM-SHA-512 as a user of its own. A job in `platform` applies the topics, the users and their rules as code, and a topic is never made by its first use. On 2026-11-25 the owner chose to build it on the laptops and on the host at once.

A trial on 2026-11-25 with the official image `apache/kafka:4.4.0` found four things that the records do not settle:

- The image ignores `STORAGE_FORMAT_ARGS`, which only Kafka's main branch documents. So the image cannot make the first SCRAM user itself, and without one, nobody can sign in.
- With a SASL listener, the image's own script refuses to start unless `KAFKA_OPTS` is set.
- The image turns on JMX by default, which breaks its own class-sharing archive and opens an unauthenticated local door.
- The stack's rule forbids mounting a file from the package folder, as record 0002 says. So the list of topics, users and rules has to travel in a setting.

## Decision

- **The broker formats its own storage** before the image's start. The format makes two users, `admin` for the broker itself and `setup` for the job, from the passwords in its settings. On every later start the format finds the storage formatted and does nothing.
- **The controller's port listens inside its container only.** The controller signs in as the unnamed user, which is a super user, so no other container can reach that port.
- **One list, `KAFKA_SETUP` in `stack/compose.yaml`, holds the topics, users and rules**, one per line:
  - `topic <name> <partitions>`
  - `user <name>`
  - `allow <user> <operation> topic|group <name> [prefixed]`
- **The job `kafka-setup` only adds.** It takes each user's password from `KAFKA_PASSWORD_<NAME>`, and it never deletes a topic, a user or a rule. A topic holds data, so a removal is a step by hand, with the owner's yes.
- **On the laptop a second listener**, `localhost:9094`, serves an app that runs outside a container, as the agent's port 4318 does. Production has none.
- JMX is off, and the heap is 512 MiB inside a limit of 1 GiB. The broker used 397 MiB at rest on 2026-11-25.

## Consequences

- A product gets its topics, user and rules from one place, in a pull request to this repo, and the deploy applies them.
- The passwords of `admin` and `setup` are written only at the first format. Changing one later also takes `kafka-configs.sh --alter` on the broker.
- What the list no longer holds stays on the broker until someone removes it by hand. Nothing checks that drift yet.
- An app's own password has to reach the job and the app. Where it lives is decided when the first app needs one, in step 5.4.
- When an official image supports `STORAGE_FORMAT_ARGS`, the format step can move into the image's own start.

## Alternatives considered

- **A login file mounted into the container.** It breaks record 0002's rule, and it puts a secret on disk.
- **Make the first user through the controller's unnamed access after the start.** It works, but it adds a step that races with the job.
- **A job that also deletes what the list no longer holds.** It keeps the broker exactly as written, but one wrong line would delete a topic and its data.
- **A job in Node.js on `@platformatic/kafka`.** It is one more image to keep, and Kafka code outside `@zigordev/events`, which toolkit's record 0040 rules out for apps.
