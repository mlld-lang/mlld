---
id: audit-log
title: Audit Log
brief: Event ledgers with stable IDs, tool calls, and signing records
category: security
parent: audit-log
tags: [audit, security, labels, signing, taint]
related: [labels-overview, label-modification, signing-overview, policy-label-flow, security-label-tracking]
related-code: [core/security/AuditLogger.ts, core/security/AuditLogIndex.ts, core/security/sig-adapter.ts, interpreter/utils/audit-log.ts]
updated: 2026-03-23
qa_tier: 2
---

mlld records security events in two JSONL audit ledgers:

- `.mlld/sec/audit.jsonl` for label and taint events managed by mlld
- `.sig/audit.jsonl` for signing and verification events managed by `@disreguard/sig`

Each line is a JSON object with a stable `id`, timestamp, and event type.

```json
{"id":"6b2a0f8d-fb2b-420d-9c15-1dd9ad18f9e2","ts":"2026-03-23T08:42:21.123Z","event":"toolCall","tool":"verify","args":{"value":"..."},"ok":true,"resultLength":12,"duration":8,"labels":["safe"],"taint":["src:mcp"],"sources":["mcp:verify"]}
```

**Common fields:**

| Field | Meaning |
| --- | --- |
| `id` | Stable UUID for the audit event |
| `ts` | ISO timestamp of the event |
| `event` | Event type |

**mlld audit log (`.mlld/sec/audit.jsonl`):**

| Event | Fields | Notes |
| --- | --- | --- |
| `label` | `var`, `add`, `by` | Label additions from `/label` or guards |
| `bless` | `var`, `add`, `remove`, `by` | Privileged label changes that remove labels |
| `conflict` | `var`, `labels`, `resolved` | Trusted/untrusted conflict resolution |
| `write` | `path`, `taint`, `writer` | File writes with taint provenance |
| `toolCall` | `tool`, `args`, `ok`, `resultLength`, `duration`, `labels`, `taint`, `sources`, `detail` | Exe/native tool body execution with timing and result summary |

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

**Tool-call ledger vs value provenance:**

- `toolCall.args` in the audit ledger stores the full argument payload for debugging and forensics.
- `toolCall` events are written only when the tool body actually executes; pre-guard and param-flow short-circuits do not emit them.
- `toolCall.duration` measures tool-body execution only. It excludes guard handling, `with`-clause processing, and downstream pipelines.
- Value-level provenance lives separately on `@value.mx.tools` and `@mx.tools.history`.
- Provenance entries are lightweight: `{ name, args, auditRef }`.
- In provenance, `args` contains parameter names only, and `auditRef` points back to the audit event `id`.

**Inspecting the ledger:**

```sh
tail -n 20 .mlld/sec/audit.jsonl
jq 'select(.event == "write")' .mlld/sec/audit.jsonl
jq 'select(.event == "toolCall")' .mlld/sec/audit.jsonl
jq 'select(.event == "label")' .mlld/sec/audit.jsonl
jq 'select(.event == "verify" or .event == "verify-fail")' .sig/audit.jsonl
```

**Programmatic querying in mlld:**

```mlld
var @audit = <@root/.mlld/sec/audit.jsonl>
exe @findToolCalls(events) = js {
  return events.filter(e => e.event === "toolCall");
}
show @findToolCalls(@audit) | @parse
```

**Note:** When working with audit events in mlld, use `@event | @parse` or a JS function to access the `taint` field, since `.taint` on a variable accesses the variable's metadata, not the JSON property.

Audit logging is non-blocking. When audit writes fail, mlld logs a warning and continues execution.
