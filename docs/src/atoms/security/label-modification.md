---
id: label-modification
title: Label Modification
brief: Add, remove, and modify security labels on return values
category: security
tags: [labels, trust, security, guards, privileged]
related: [guards-basics, automatic-labels, policies]
related-code: [interpreter/eval/label-modification.ts, grammar/tests/label-modification-grammar.test.ts]
updated: 2026-01-24
qa_tier: 2
---

Label modification syntax applies security labels to return values.

**Add labels:**

```mlld
exe @classify(data) = [
  let @processed = @data | @transform
  => pii @processed
]

exe @markMultiple(data) = [
  => pii,internal @data
]
```

Multiple labels separated by commas.

**Trust modification:**

```mlld
>> Downgrade trust (always allowed)
exe @taint(data) = [
  => untrusted @data
]

>> Add trusted (warning if already untrusted)
exe @suggest(data) = [
  => trusted @data
]
```

Adding `untrusted` replaces any existing `trusted` label. Adding `trusted` to already untrusted data triggers a warning (configurable via `policy.defaults.trustconflict`).

**Privileged operations:**

```mlld
>> Blessing - remove untrusted, add trusted (privileged)
guard privileged @validate after src:mcp = when [
  @schema.valid(@output) => trusted! @output
  * => deny "Invalid schema"
]

>> Remove specific label (privileged)
guard privileged @strip after pii = when [
  @sanitized(@output) => !pii @output
  * => allow @output
]

>> Clear all non-factual labels (privileged)
guard privileged @reset after processed = when [
  * => clear! @output
]
```

Privileged operations require the guard to be declared as privileged.

**Trust label asymmetry:**

| Syntax | Privilege? | Effect |
|--------|------------|--------|
| `=> untrusted @var` | No | Replaces trusted (taint flows down) |
| `=> trusted @var` | No | Adds trusted; warning if conflict |
| `=> trusted! @var` | Yes | Blessing: removes untrusted |
| `=> !label @var` | Yes | Removes specific label |
| `=> clear! @var` | Yes | Removes all non-factual labels |

**Protected labels:**

These labels require privilege to remove:
- `secret` - Prevents self-blessing of sensitive data
- `untrusted` - Tracks trust state
- `src:mcp`, `src:exec`, `src:file`, `src:network` - Provenance tracking

Attempting to remove protected labels without privilege throws `PROTECTED_LABEL_REMOVAL` error.

**Factual labels:**

Labels starting with `src:` are factual - they record provenance facts. `clear!` does not remove factual labels.

**Guard context:**

```mlld
guard privileged @validateMcp after src:mcp = when [
  @output.data?.valid => trusted! @output
  * => deny "Invalid MCP response"
]
```

The guard uses `after` timing to process output and applies blessing if validation passes.

**Trust conflict behavior:**

Controlled by `policy.defaults.trustconflict`:
- `warn` (default) - Log warning, keep both labels, treat as untrusted
- `error` - Throw error
- `silent` - No warning, keep both labels
