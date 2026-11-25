# 0028. The shared services read each app's Kafka password from the app's own parameter

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

Toolkit's record 0041 gives each app a Kafka user of its own, with a password that the owner creates in Parameter Store, and that the deploy hands to the app. Record 0027 makes the job `kafka-setup`, which the deploy of the shared services runs, create each user from the variable `KAFKA_PASSWORD_<USER>`. So one password has two readers: the app's own deploy, under `/<product>/`, and the deploy of the shared services, which reads only `/platform/` names.

On 2026-11-25 the owner chose between two copies of each password, one copy read by both, and a job that creates the password and writes it for the app. In their words: "B, one copy". The deploy script lives in the host's user data, so the change rebuilds the host, about 7 minutes offline. Told so, the owner kept it: "Keep B".

## Decision

- **An app's Kafka password lives once**, at `/<product>/KAFKA_PASSWORD`, stored by the owner.
- **A line of `stack/.env.production.example` may name it**, as `KAFKA_PASSWORD_<USER>=/<product>/KAFKA_PASSWORD`. The deploy of the shared services then reads that parameter, and hands it to the job under the line's name. Every other line stays `NAME=`, read at `/platform/NAME`.
- **Only the shared services may do that, and only for a Kafka password.** The deploy script refuses any other value, and the same value in a product's file, before it changes anything.
- **`infra/deploy` lets the host read exactly the parameters those lines name**, and no copy under `/platform`.

## Consequences

- The owner stores each app's password once, and a change of it reaches the broker with the next deploy of the shared services, which the job applies.
- The deploy of the shared services fails with `missing-secrets` while a named password is absent, so the owner stores it before the merge that names it.
- The host may read one parameter of each product that has a Kafka user, beside its own path.
- This change rebuilt the host once. Any later change to the deploy script does too.

## Alternatives considered

- **Two copies.** No code change, but the owner stores every password twice, and a mismatch locks the app out of Kafka.
- **The job creates the password and writes it for the app.** Nobody handles it, but the host would need the right to write secrets, which the owner creates themself, and an app's first deploy would wait for one of the shared services.
