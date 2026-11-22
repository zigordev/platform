# Decision records

Each significant decision about this repo gets one short record: the context, the decision, its consequences and the alternatives that were not taken. A record is written for a reader who was not there.

The records are numbered from 0001. An accepted record is never edited: a new record supersedes it by naming it, and this index then marks the old one as superseded.

The decisions that shape the whole platform are not here. They are recorded once, [in toolkit](https://github.com/zigordev/toolkit/blob/main/docs/adr/README.md), and [record 0001](0001-this-repo-records-its-own-decisions.md) says where the line runs.

To add one, use the `write-decision-record` skill, or copy [its template](../../.claude/skills/write-decision-record/template.md) to `NNNN-short-title.md` with the next free number, and add a row here in the same pull request.

| #                                                            | Decision                                                        | Date       | Status   |
| ------------------------------------------------------------ | --------------------------------------------------------------- | ---------- | -------- |
| [0001](0001-this-repo-records-its-own-decisions.md)          | This repo records its own decisions, and toolkit the platform's | 2026-11-22 | accepted |
| [0002](0002-the-shared-services-are-one-compose-project.md)  | The shared services are one Compose project with fixed names    | 2026-11-22 | accepted |
| [0003](0003-the-docker-proxy-is-socket-proxy.md)             | The Docker proxy is socket-proxy                                | 2026-11-22 | accepted |
| [0004](0004-dashboards-and-alerts-are-code-pushed-by-gcx.md) | Dashboards and alert rules are code, pushed by gcx              | 2026-11-22 | accepted |
