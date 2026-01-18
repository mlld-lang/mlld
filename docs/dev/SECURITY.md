---
updated: 2026-01-16
tags: #security, #policy, #labels, #guards
related-docs: todo/spec-security-2026-v3.md
related-code: core/policy/*.ts, interpreter/policy/*.ts, interpreter/hooks/*-hook.ts
related-types: core/types/security.ts { SecurityDescriptor, DataLabel }
---

# Security Model

## tldr

mlld prevents prompt injection consequences via label flow control. You can't stop LLMs from being tricked, but you can prevent tricked LLMs from causing harm.

Three layers:
- **Labels** track what data IS (`secret`) and where it CAME FROM (`src:mcp`)
- **Policy** declares what CAN happen (`secret` → deny `op:show`)
- **Guards** enforce with full context (complex validation logic)

Labels propagate automatically. Policy checks are non-bypassable. Guards are optional and bypassable.

## Principles

- **Taint everything** - All data carries `SecurityDescriptor { labels, taint, sources }`
- **Check before execution** - PolicyEnforcer runs before every operation (cmd, show, output, etc.)
- **Non-bypassable core** - Policy layer cannot be disabled, even with `guards: false`
- **Separate concerns** - Op labels for checking (don't propagate), source labels for tracking (do propagate)
- **Explicit credentials** - Auth flows via `using auth:name` or `using @var as ENV` syntax

## Details

### Label Types

| Type | Applied When | Propagates | Example |
|------|--------------|------------|---------|
| User-declared | `var secret @key = ...` | Yes | `secret`, `pii` |
| Source labels | Data entry points | Yes | `src:mcp`, `src:exec`, `src:file` |
| Operation labels | Before execution | No | `op:cmd:git:status` |

**Op labels are for checking, not propagation.** They go in operation context for policy/guard evaluation, then to `sources` for provenance. They do NOT go in output labels/taint.

### Policy Structure

```typescript
PolicyConfig = {
  default?: 'deny' | 'allow';         // Unlabeled data behavior
  auth?: Record<string, AuthConfig>;  // Credential paths
  allow?: Record<string, ...>;        // Capability allowlist
  deny?: Record<string, ...>;         // Capability denylist
  labels?: PolicyLabels;              // Label flow rules
  limits?: PolicyLimits;              // Resource constraints
}

LabelFlowRule = {
  deny?: string[];   // Block flow to these ops
  allow?: string[];  // Permit flow to these ops (for default:deny)
}

AuthConfig = {
  from: string;  // "keychain:path" or "env:VAR"
  as: string;    // Env var name
}
```

**Location:** `core/policy/union.ts` - types and merging

### Enforcement Flow

```
Operation attempted
    ↓
PolicyEnforcer.checkLabelFlow()  ← non-bypassable
    ↓ if allowed
guard-pre-hook                    ← bypassable
    ↓ if allowed
Execute
    ↓
guard-post-hook
```

**Critical:** PolicyEnforcer runs BEFORE guards in every evaluator:
- `interpreter/eval/run.ts`
- `interpreter/eval/show.ts`
- `interpreter/eval/output.ts`
- `interpreter/eval/log.ts`
- `interpreter/eval/exec-invocation.ts`
- `interpreter/eval/pipeline/builtin-effects.ts`

### Credential Injection

**Syntactic sugar:**
```mlld
using auth:claude          → with { auth: "claude" }
using @token as TOOL_KEY   → with { using: { var: "@token", as: "TOOL_KEY" } }
```

**Grammar:** Desugars in `grammar/directives/run.peggy` into WithConfig

**Flow:** `with.auth` or `with.using` present → `flowChannel = 'using'` → bypass label flow check

**Why bypass:** Credentials go to env var (not interpolated into command string). `deny: [op:cmd]` blocks interpolation; `using` avoids it.

### Label Propagation

**File:** `interpreter/hooks/taint-post-hook.ts`

Merges input labels into output automatically. Does NOT merge op labels (those go to sources only).

```typescript
output.security = {
  labels: input.labels,           // Data sensitivity
  taint: input.taint,             // Data sensitivity + source markers
  sources: [...operation.sources] // Provenance trail (includes op info)
}
```

### Policy Merging

When multiple policies compose:
- `deny`: union (denied by ANY)
- `allow`: intersection (allowed by ALL)
- `auth`: last wins (environment-specific)
- `default`: most restrictive wins (defer - see mlld-wmzl.15)

**Location:** `core/policy/union.ts`

## Gotchas

- **Op labels don't propagate** - Only for checking. Don't add to SecurityDescriptor.labels
- **Policy runs before guards** - Must be first in every evaluator
- **Taint != labels** - `taint = labels ∪ sources`. Check policy against taint, not just labels
- **using bypasses deny** - By design. Credentials in env vars, not command strings
- **Guard label modification** - Affects OUTPUT only. Next operation sees modified labels
- **Protected labels** - Only privileged guards can remove `src:*` or `secret`

## Debugging

**Check what labels a value has:**
```mlld
show @data.mx.labels   // ["secret", "pii"]
show @data.mx.taint    // ["secret", "pii", "src:mcp"]
show @data.mx.sources  // ["mcp:fetchData", "transform:json"]
```

**Policy denial errors:**
- Code: `POLICY_LABEL_FLOW_DENIED`
- Message includes: which label, which rule, which operation
- Check `policy.labels.<label>.deny` array

**Guard denial errors:**
- Code: `GUARD_DENIED`
- Message includes: which guard, why denied
- Check guard `when` conditions

**Common issues:**
- "Secret blocked from op:cmd" → use `using @secret as ENV` instead of interpolating
- "src:mcp denied" → check `policy.labels."src:mcp".allow` list
- "Privileged guard can't be bypassed" → by design, remove `with { guards: false }`

## References

- Complete spec: `todo/spec-security-2026-v3.md`
- Implementation plan: `todo/plan-security-2026-v3.md`
- Epic: `bd show mlld-wmzl`
