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

Privileged guards can remove protected labels:

```mlld
guard privileged @bless after secret = when [
  * => allow with { removeLabels: ["secret"] }
]
```

Policy guards are automatically privileged. User-defined guards are privileged when declared with the `privileged` prefix or `with { privileged: true }`.

| Privileged action | Example | Effect |
|-------------------|---------|--------|
| Blessing | `=> trusted! @var` | Remove untrusted, add trusted |
| Label removal | `=> !pii @var` | Remove specific label |
| Clear labels | `=> clear! @var` | Remove all non-factual labels |

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

After guards receive `@output` with the operation result:

```mlld
guard @validateMcp after src:mcp = when [
  @output.data?.valid => allow @output
  * => deny "Invalid MCP response"
]
```

The guard uses `after` timing to process output. Blessing (`trusted!`) and label removal (`!label`) require privileged guards.

**Trust conflict behavior:**

Controlled by `policy.defaults.trustconflict`:
- `warn` (default) - Log warning, keep both labels, treat as untrusted
- `error` - Throw error
- `silent` - No warning, keep both labels
