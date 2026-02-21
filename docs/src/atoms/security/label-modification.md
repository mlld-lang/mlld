---
id: label-modification
title: Label Modification
brief: Add, remove, and modify security labels on return values
category: security
tags: [labels, trust, security, guards, privileged]
related: [security-guards-basics, security-automatic-labels, security-policies]
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
  * => allow with { addLabels: ["trusted"], removeLabels: ["untrusted", "secret"] }
]
```

Policy guards are automatically privileged. User-defined guards are privileged when declared with the `privileged` prefix or `with { privileged: true }`. Privilege applies to guard declarations; exe functions do not have a privileged mode.

| Privileged action | Syntax | Effect |
|-------------------|--------|--------|
| Blessing | `=> trusted! @var` | Remove untrusted, add trusted |
| Label removal | `=> !pii @var` | Remove specific label |
| Multi-label removal | `=> !pii,!internal @var` | Remove multiple labels |
| Clear labels | `=> clear! @var` | Remove all non-factual labels |

The shorthand syntax (`trusted!`, `!label`, `clear!`) ONLY works inside privileged guards. It does not work in exe blocks, when blocks, or non-privileged guards. Attempting to use it outside a privileged guard context throws a privilege error.

```mlld
>> Privileged guard — shorthand works here
guard privileged @sanitize after secret = when [
  @output.verified => trusted! @output
  @output.public   => !secret @output
  *                 => deny "Unverified secret data"
]

>> Non-privileged guard — shorthand does NOT work
guard @attempt after secret = when [
  * => trusted! @output
]
>> Error: LABEL_PRIVILEGE_REQUIRED — trusted! requires privileged guard context

>> Exe block — shorthand does NOT work
exe @tryBless(data) = [
  => trusted! @data
]
>> Error: LABEL_PRIVILEGE_REQUIRED — trusted! requires privileged guard context
```

Guards also support `allow with { ... }` action syntax for privileged label modifications:

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
| `=> trusted! @var` | Yes | Blessing: removes untrusted |
| `=> !label @var` | Yes | Removes specific label |
| `=> clear! @var` | Yes | Removes all non-factual labels |

**Protected labels:**

These labels require privilege to remove:
- `secret` - Prevents self-blessing of sensitive data
- `untrusted` - Tracks trust state
- `src:*` (all source labels: `src:mcp`, `src:cmd`, `src:sh`, `src:js`, `src:py`, `src:file`, `src:network`, `src:keychain`, etc.) - Provenance tracking

Attempting to remove protected labels without privilege throws `PROTECTED_LABEL_REMOVAL` error.

**Factual labels:**

Labels starting with `src:` are factual provenance labels. They are part of `.mx.taint` and may not appear in `.mx.labels`. Use `.mx.taint` for source checks such as `src:mcp` and `src:cmd`. `clear!` does not remove factual labels.

**Guard context:**

After guards receive `@output` with the operation result:

```mlld
guard @validateMcp after src:mcp = when [
  @output.data?.valid => allow @output
  * => deny "Invalid MCP response"
]
```

The guard uses `after` timing to process output. Blessing and label removal require privileged guards using `allow with { addLabels, removeLabels }` syntax.

**Trust conflict behavior:**

Controlled by `policy.defaults.trustconflict`:
- `warn` (default) - Log warning, keep both labels, treat as untrusted
- `error` - Throw error
- `silent` - No warning, keep both labels
