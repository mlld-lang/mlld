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

Privileged label removal uses guard actions with `with { addLabels, removeLabels }`:

```mlld
guard privileged @bless after secret = when [
  * => allow with { addLabels: ["trusted"], removeLabels: ["untrusted", "secret"] }
]
```

Policy guards are automatically privileged. User-defined guards are privileged when declared with the `privileged` prefix or `with { privileged: true }`. Privilege applies to guard declarations; exe functions do not have a privileged mode.

| Guard action | Privilege? | Effect |
|--------------|------------|--------|
| `allow with { addLabels: ["trusted"] }` | No | Adds `trusted` (trust conflict policy still applies) |
| `allow with { removeLabels: ["untrusted"] }` | Yes | Removes `untrusted` |
| `allow with { addLabels: ["trusted"], removeLabels: ["untrusted"] }` | Yes | Blessing: removes `untrusted`, adds `trusted` |
| `allow with { removeLabels: ["secret"] }` | Yes | Removes protected label |

**Trust label asymmetry:**

| Syntax | Privilege? | Effect |
|--------|------------|--------|
| `=> untrusted @var` | No | Replaces trusted (taint flows down) |
| `=> trusted @var` | No | Adds trusted; warning if conflict |
| `allow with { removeLabels: ["untrusted"] }` | Yes | Removes untrusted |
| `allow with { removeLabels: ["label"] }` | Yes | Removes specific label in guard action |

**Protected labels:**

These labels require privilege to remove:
- `secret` - Prevents self-blessing of sensitive data
- `untrusted` - Tracks trust state
- `src:mcp`, `src:exec`, `src:file`, `src:network` - Provenance tracking

Attempting to remove protected labels without privilege throws `PROTECTED_LABEL_REMOVAL` error.

**Factual labels:**

Labels starting with `src:` are factual provenance labels. They are part of `.mx.taint` and may not appear in `.mx.labels`. Use `.mx.taint` for source checks such as `src:mcp` and `src:exec`.

**Guard context:**

After guards receive `@output` with the operation result:

```mlld
guard @validateMcp after src:mcp = when [
  @output.data?.valid => allow @output
  * => deny "Invalid MCP response"
]
```

The guard uses `after` timing to process output. Label removals in guard actions require privileged guards.

**Trust conflict behavior:**

Controlled by `policy.defaults.trustconflict`:
- `warn` (default) - Log warning, keep both labels, treat as untrusted
- `error` - Throw error
- `silent` - No warning, keep both labels
