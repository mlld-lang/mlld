---
id: audit-log
title: Audit Log
brief: Event ledger for labels, signatures, and file taint
category: security
parent: security
tags: [audit, security, labels, signing, taint]
related: [labels-overview, label-modification, signing-overview, policy-label-flow]
related-code: [core/security/AuditLogger.ts, core/security/AuditLogIndex.ts, interpreter/utils/audit-log.ts]
updated: 2026-02-05
qa_tier: 2
---

mlld writes a JSONL audit ledger at `.mlld/sec/audit.jsonl` in each project. Each line is a JSON object with a timestamp and an event type.

```json
{"ts":"2026-02-05T08:42:21.123Z","event":"write","path":"/project/output.txt","taint":["secret","src:network"],"writer":"src:network"}
```

**Common fields:**

| Field | Meaning |
| --- | --- |
| `ts` | ISO timestamp of the event |
| `event` | Event type |

**Event types and fields:**

| Event | Fields | Notes |
| --- | --- | --- |
| `label` | `var`, `add`, `by` | Label additions from `/label` or guards |
| `bless` | `var`, `add`, `remove`, `by` | Privileged label changes that remove labels |
| `conflict` | `var`, `labels`, `resolved` | Trusted/untrusted conflict resolution |
| `sign` | `var`, `hash`, `by` | Template signing |
| `verify` | `var`, `result`, `caller` | Signature verification outcome |
| `write` | `path`, `taint`, `writer` | File writes with taint provenance |

**How taint is used:**

- File reads and imports consult the audit log to restore taint from prior `write` events.
- `taint` records the label/taint set applied to the written data.
- `writer` stores the first available source tag when present.

**Inspecting the ledger:**

```sh
tail -n 20 .mlld/sec/audit.jsonl
jq 'select(.event == "write")' .mlld/sec/audit.jsonl
jq 'select(.event == "label")' .mlld/sec/audit.jsonl
```

Audit logging is non-blocking. When audit writes fail, mlld logs a warning and continues execution.
