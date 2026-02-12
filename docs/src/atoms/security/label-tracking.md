---
id: security-label-tracking
title: Label Tracking
brief: How labels flow through operations
category: security
parent: labels
aliases: [label]
tags: [security, labels, tracking, flow]
related: [audit-log, security-guards-basics, security-automatic-labels]
related-code: [core/security/taint.ts]
updated: 2026-02-05
qa_tier: 2
---

Labels propagate through all transformations automatically.

```mlld
>> Method calls preserve labels
var secret @key = "sk-123"
var @trimmed = @key.trim()
show @trimmed.mx.labels    // ["secret"]
```

**Templates:** Interpolated values carry labels to the result.

```mlld
var secret @token = "abc"
var @msg = `Token: @token`
show @msg.mx.labels        // ["secret"]
```

**Collections:** Items retain labels; collection has union.

```mlld
var secret @key = "sk-123"
var @arr = [@key, "public"]
show @arr.mx.labels        // ["secret"]
```

**Pipelines:** Labels accumulate through stages.

```mlld
var secret @seed = "data"
var @result = @seed | @transform | @process
show @result.mx.labels     // ["secret"]
```

**File I/O:** When labeled data is written to disk, the audit log records the taint. Reading the file restores it.

```mlld
var secret @token = "sk-live-123"
output @token to "@root/tmp/demo.txt"

var @loaded = <@root/tmp/demo.txt>
show @loaded.mx.labels     // ["secret"]
```

The audit log stores a `write` event with the taint set. On subsequent reads, mlld consults the log and applies the recorded labels. See [audit-log](audit-log.md) for the ledger format.

**Note:** If `@loaded.mx.labels` shows `[]`, check that you declared the sensitivity label on the original variable (e.g., `var secret @token`). Labels are not inferred from content—they must be declared explicitly.
