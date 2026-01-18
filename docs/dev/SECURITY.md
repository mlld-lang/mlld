---
updated: 2026-01-17
tags: #security, #policy, #labels, #guards, #environments
related-docs: todo/spec-security-2026-v3.md
related-code: core/policy/*.ts, interpreter/policy/*.ts, interpreter/hooks/*-hook.ts
related-types: core/types/security.ts { SecurityDescriptor, DataLabel }
---

# Security Model

## tldr

mlld prevents prompt injection consequences via label flow control. You can't stop LLMs from being tricked, but you can prevent tricked LLMs from causing harm.

Four layers:
- **Labels** track what data IS (`secret`) and where it CAME FROM (`src:mcp`)
- **Policy** declares what CAN happen (`secret` → deny `op:show`)
- **Guards** enforce with full context (complex validation logic)
- **Environments** provide execution contexts with isolation and state management

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
  env?: { default?: string };         // Default environment provider
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

## Environments

Environments are THE primitive for execution contexts. They unify:
- **Credentials** - Auth configuration
- **Isolation** - Filesystem, network, resource boundaries
- **Capabilities** - Available tools, MCPs, operations
- **State** - Snapshots, session resume (provider-dependent)

### Environment Providers

Providers are optional - they add isolation. Without a provider, commands run locally. `policy.env.default` supplies a default provider when an env config omits one.

| Provider | Isolation | Snapshots | Use Case |
|----------|-----------|-------------|----------|
| `@mlld/env-docker` | Container | Limited | Process isolation |
| `@mlld/env-sprites` | Cloud | Native | Full isolation + state |

### Usage Patterns

**Environment without provider** (local, different auth):
```mlld
var @devEnv = {
  auth: "claude-dev",
  mcps: ["@github/issues"],
}
```

**Environment with provider** (isolated):
```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"] },
  net: "none",
}
```

**Guard-triggered**:
```mlld
guard before sandboxed = when [
  op:cmd => env @sandbox
  * => deny
]
```

Guards select environments. The guard hook returns the env config, and the run evaluator applies it.

### Provider Interface

Provider modules export a standard interface:

```mlld
// Required: create environment, execute in it, release it
exe @create(opts) = [
  // opts = config minus core fields (provider, auth, taint)
  // Returns: { envName, created: bool }
]

exe @execute(envName, command) = [
  // envName from @create
  // command = { argv, cwd, vars, secrets, stdin? }
  // Returns: { stdout, stderr, exitCode }
]

exe @release(envName) = [...]

// Optional: snapshotting
exe @snapshot(envName, name) = [...]

export { @create, @execute, @release, @snapshot }
```

**createOrExists semantics in @create:**
- `opts.name` specified + exists → `{ envName: opts.name, created: false }`
- `opts.name` specified + not exists → create, `{ envName, created: true }`
- No name → create anonymous, `{ envName: <auto-id>, created: true }`

**Release behavior:**
- When `keep` is true, mlld skips `@release` for that execution

**Core fields** (handled by mlld, not passed to provider):
- `provider` → routes to module
- `auth` → resolves credentials from keychain
- `taint` → applies labels to output

**Opts** (passed to @create): everything else (`fs`, `net`, `image`, etc.)

**Command structure:**
```mlld
{
  argv: ["claude", "-p", "..."],
  cwd: "/app",
  vars: { NODE_ENV: "production" },
  secrets: { ANTHROPIC_API_KEY: "sk-xxx..." },
  stdin: "optional stdin",
}
```

**Result structure:**
```mlld
{
  stdout: "...",
  stderr: "...",
  exitCode: 0,
}
```

### Provider Trust Model

The `provider:` field is an **explicit trust grant**:

| Module type | Gets secrets? | Why |
|-------------|---------------|-----|
| Regular import | No | Just code, no special privileges |
| `provider:` designation | Yes | User explicitly trusts it |

Providers receive actual secret values in `command.secrets`. This is intentional - the provider controls execution, so it must be trusted. If you don't trust a module, don't use it as a provider.

### Source Labels

Data from isolated environments gets labeled:
- `src:env:docker` - from Docker provider
- `src:env:sprites` - from Sprites provider
- (no provider = `src:exec` as normal)

mlld core applies the source label based on provider designation.

### Lifecycle

- Guard-triggered env: `@release` runs after the single operation completes.
- Env blocks: `@release` runs when the block exits.
- Error paths: `@release` runs in a finally block.

### Key Files

- Types: `core/types/environment.ts`
- Providers: `core/env/*.mld`

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
