---
id: audit-log
title: Audit Log
brief: Event ledgers for labels, taint, and signatures
category: security
parent: security
tags: [audit, security, labels, signing, taint]
related: [labels-overview, label-modification, signing-overview, policy-label-flow, security-label-tracking]
related-code: [core/security/AuditLogger.ts, core/security/AuditLogIndex.ts, core/security/sig-adapter.ts, interpreter/utils/audit-log.ts]
updated: 2026-02-05
qa_tier: 2
---

mlld records security events in two JSONL audit ledgers:

- `.mlld/sec/audit.jsonl` for label and taint events managed by mlld
- `.sig/audit.jsonl` for signing and verification events managed by `@disreguard/sig`

Each line is a JSON object with a timestamp and an event type.

```json
{"ts":"2026-02-05T08:42:21.123Z","event":"write","path":"/project/output.txt","taint":["secret","src:network"],"writer":"src:network"}
```

**Common fields:**

| Field | Meaning |
| --- | --- |
| `ts` | ISO timestamp of the event |
| `event` | Event type |

**mlld audit log (`.mlld/sec/audit.jsonl`):**

| Event | Fields | Notes |
| --- | --- | --- |
| `label` | `var`, `add`, `by` | Label additions from `/label` or guards |
| `bless` | `var`, `add`, `remove`, `by` | Privileged label changes that remove labels |
| `conflict` | `var`, `labels`, `resolved` | Trusted/untrusted conflict resolution |
| `write` | `path`, `taint`, `writer` | File writes with taint provenance |

**sig audit log (`.sig/audit.jsonl`):**

| Event | Fields | Notes |
| --- | --- | --- |
| `sign` | `file`, `hash`, `identity` | File/content signing |
| `verify` | `file`, `hash`, `detail` | Successful verification |
| `verify-fail` | `file`, `hash`, `detail` | Verification failure reason |
| `update` | `file`, `hash`, `identity`, `provenance` | Authorized mutable file update |
| `update_denied` | `file`, `identity`, `detail`, `provenance` | Rejected mutable file update |

**How taint is used:**

- File reads and imports consult the audit log to restore taint from prior `write` events.
- `taint` records the label/taint set applied to the written data.
- `writer` stores the first available source tag when present. When no source tag is available (e.g., for inline-declared values), `writer` is `null`.

**Inspecting the ledger:**

```sh
tail -n 20 .mlld/sec/audit.jsonl
jq 'select(.event == "write")' .mlld/sec/audit.jsonl
jq 'select(.event == "label")' .mlld/sec/audit.jsonl
jq 'select(.event == "verify" or .event == "verify-fail")' .sig/audit.jsonl
```

**Programmatic querying in mlld:**

```mlld
var @audit = <@root/.mlld/sec/audit.jsonl>
exe @findWrites(events) = js {
  return events.filter(e => e.event === "write");
}
show @findWrites(@audit) | @parse
```

**Note:** When working with audit events in mlld, use `@event | @parse` or a JS function to access the `taint` field, since `.taint` on a variable accesses the variable's metadata, not the JSON property.

Audit logging is non-blocking. When audit writes fail, mlld logs a warning and continues execution.
