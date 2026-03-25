---
id: security
title: Security
brief: Guards, labels, policies, signing, environments, audit logging, and tool provenance
category: security
updated: 2026-03-24
---

mlld's security model prevents the consequences of prompt injection from manifesting. LLMs can be tricked — but labels track facts about data that the runtime enforces regardless of LLM intent.

Most detailed security atoms now live in:
- `effects` (labels, guards, hooks)
- `config` (policy and environment configuration)
- `security` (signing, MCP, patterns, audit)

## Decision Tree

**"I want to..."**

- **Restrict what a module or agent can do** → [policies](#policies): declarative capability rules, label flow restrictions, built-in rules
- **Inspect, transform, or block data at operation time** → [guards](#guards): imperative per-operation logic with before/after hooks
- **Track where data came from and what it contains** → [labels](#labels): automatic provenance, explicit sensitivity and trust classification
- **Authorize specific tools and arguments for a task** → [authorizations](#authorizations): declarative per-tool authorization with control-arg enforcement
- **Create trust boundaries for LLM instructions** → [signing](#signing): integrity for templates and instructions
- **Isolate execution with credentials and resource limits** → [environments](#environments): scoped contexts with filesystem, network, and tool restrictions
- **Logs for observability and forensics** → [audit-logging](#audit-logging): JSONL ledgers for label changes, file writes, tool calls, and signing events

## Labels

Labels are strings attached to values. They are the foundation — guards and policies both operate on labels.

**Four categories:**

| Category | Examples | Applied How | Purpose |
|----------|----------|-------------|---------|
| Sensitivity | `secret`, `sensitive`, `pii` | Declared by developer; `secret` auto-applied from keychain | Classify what data IS |
| Trust | `trusted`, `untrusted` | Declared by developer or via `defaults.unlabeled` | Classify data reliability and risk |
| Attestation | `known`, `known:internal`, `known:*` | Declared by developer, trusted tool results, planner-pinned approved values | Record that a specific value was approved by a trusted source |
| Influence | `influenced` | Auto-applied when an `llm` executable sees untrusted data in any input, including prompt/config fields like `messages` or `system` | Track LLM exposure to tainted data |
| Source | `src:mcp`, `src:cmd`, `src:js`, `src:sh`, `src:py`, `src:file`, `src:network`, `src:keychain`, `dir:/path` | Auto-applied by runtime | Track where data CAME FROM |

Labels propagate through all transformations — template interpolation, method calls, pipelines, collections. You cannot accidentally strip a label by transforming data.

Attestations are value-scoped, unlike taint-style labels such as `untrusted`. A frequent pattern is `known` / `known:internal` for approved send destinations and targeted destructive operations, which pairs with the built-in destination/target rules below.

**Operation labels** (`op:cmd`, `op:sh`, `op:cmd:git:status`) are ephemeral — they exist only during the operation and do not propagate to the result. This is different from the categories above.

**Label metadata** is accessible via `@value.mx`:
- `.mx.labels` — user-declared labels (`secret`, `pii`, `untrusted`)
- `.mx.taint` — union of all labels plus source markers (the full provenance picture)
- `.mx.attestations` — value-scoped approvals such as `known` and `known:*`
- `.mx.sources` — transformation trail (`mcp:createIssue`, `command:curl`)
- `.mx.tools` — tool lineage for this specific value, with audit references

**Atoms:** `labels-overview` (start here), `labels-sensitivity`, `labels-trust`, `labels-influenced`, `labels-source-auto`, `security-automatic-labels`, `security-label-tracking`, `label-modification`

## Guards

Guards are imperative hooks that run before and/or after operations. They inspect data labels and operation context, then allow, deny, retry, or transform.

### Operation Guards (core)

```
before guards → directive executes → after guards
```

**Before phase** — runs before the operation:
- `@input` — the data flowing into the operation
- `@mx.labels`, `@mx.taint` — labels on the input data
- `@mx.op.type`, `@mx.op.name`, `@mx.op.labels` — what operation is about to run
- Actions: `allow`, `allow @transformed` (replace input), `deny "reason"`, `retry "reason"`

**After phase** — runs after the operation returns:
- `@output` — the operation's return value
- `@mx.taint` — labels on the output (including auto-applied source labels)
- Actions: `allow`, `allow @transformed` (replace output), `deny "reason"`, `retry "reason"`

Operation labels are hierarchical: `op:cmd:git` matches all git subcommands (`op:cmd:git:push`, `op:cmd:git:status`, etc.). Guard denials can be caught with `denied =>` handlers for graceful fallback.

### Data Validation Guards

`before LABEL` / `for LABEL` guards fire when labeled data is created — once per labeled value. They validate or sanitize data at entry time. Because no operation context exists at creation time, `denied` handlers do not apply.

### Composition

For operation guards: run top-to-bottom in declaration order. Precedence: `deny` > `retry` > `allow @value` > `allow`. Before-phase transforms are last-wins; after-phase transforms chain sequentially. `always` timing participates in both phases.

### Privileged Guards

Policy-generated guards and guards declared with `privileged` cannot be bypassed with `{ guards: false }`. Only privileged guards can remove protected labels (`secret`, `untrusted`, `src:*`) using `trusted!`, `!label`, or `clear!` syntax.

Guards are regular module exports — they can be imported, composed, and bundled.

**Checkpoint interaction**: Cache hits bypass guard evaluation. After changing guard or policy rules, use `--fresh` to rebuild the cache.

**Atoms:** `security-guards-basics` (start here), `security-guard-composition`, `guards-privileged`, `security-transform-with-allow`, `security-denied-handlers`

## Policies

Policies are declarative. Where guards are per-operation imperative logic, policies define broad rules that apply everywhere.

### Policy Structure

```mlld
policy @p = {
  defaults: { rules: [...], unlabeled: "untrusted" },
  operations: { exfil: ["net:w"], destructive: ["fs:w"] },
  capabilities: { allow: [...], deny: [...], danger: [...] },
  labels: { secret: { deny: ["op:show", "exfil"] } },
  auth: { claude: { from: "keychain:...", as: "ANTHROPIC_API_KEY" } }
}
```

**Key sections:**

| Section | Purpose |
|---------|---------|
| `defaults.rules` | Enable built-in rules: `no-secret-exfil`, `no-sensitive-exfil`, `no-send-to-unknown`, `no-send-to-external`, `no-destroy-unknown`, `no-untrusted-destructive`, `no-untrusted-privileged`, `untrusted-llms-get-influenced` |
| `authorizations` | Per-tool authorization with argument constraints — compiles to internal privileged guards (see below) |
| `defaults.unlabeled` | Auto-label data with no user labels (`"untrusted"` or `"trusted"`) |
| `operations` | Group semantic exe labels (`net:w`) under risk categories (`exfil`, `destructive`, `privileged`) |
| `capabilities.allow` | Allowlist command patterns (general gate) |
| `capabilities.danger` | Dangerous operations requiring explicit opt-in (separate gate — both `allow` AND `danger` must pass) |
| `labels` | Label flow rules — which data labels can flow to which operation labels |
| `auth` | Credential mappings for `using auth:*` injection (sealed paths bypass string interpolation) |

**Policy composition**: `union()` merges configs with intersection for `allow`, union for `deny`, minimum for `limits` — always resolving toward more restrictive.

**Policy vs. guards:** Capability denials (`capabilities.deny`, environment constraints) are hard errors — immediate, uncatchable. Managed label-flow denials (`defaults.rules`, `labels` deny/allow) flow through the guard pipeline and can be overridden by explicit privileged guard `allow` decisions, or caught with `denied =>` handlers. To make a label-flow denial absolute, use `locked: true` on the policy. Use policy for broad restrictions; use privileged guards to punch specific holes.

Built-in send/destroy rules use the same model: label a send operation as `exfil:send` or a targeted destructive operation as `destructive:targeted`, and require the named destination/target args to carry `known` (or `known:internal` for internal-only send destinations).

**Atoms:** `security-policies` (start here), `policy-capabilities`, `policy-operations`, `policy-label-flow`, `policy-authorizations`, `policy-composition`, `policy-auth`

## Authorizations

Authorizations declare which `tool:w` operations are authorized for a specific task, with per-argument constraints on control args. A planning LLM produces a JSON authorization fragment; the runtime validates it, merges it via `with { policy }`, and enforces it by compiling internal privileged guards.

```mlld
var @taskPolicy = {
  authorizations: {
    allow: {
      send_email: { args: { recipients: ["mark@example.com"] } },
      create_file: true
    }
  }
}

var @result = @agent(@prompt) with { policy: @taskPolicy }
```

**Default-deny:** `tool:w` operations not listed in `allow` are denied.

**Argument constraints:** Literal values use tolerant comparison (`~=`), `eq` for explicit matching, `oneOf` for multiple candidates.

**Control-arg enforcement:** Write executables declare security-relevant args with `with { controlArgs: [...] }`. Tool collections can restate or tighten that metadata for a specific exposure. `mlld validate --context tools.mld` catches unconstrained control args as errors before execution. At runtime, args not mentioned in the constraint are always enforced as empty/null — silent omission never becomes an open hole. If trusted control-arg metadata is missing for a `tool:w` executable, every declared parameter is treated as a control arg. `true` (unconstrained) is only valid for tools with no effective control args.

**Override behavior:** Authorization-generated guards are privileged, but they still inherit positive checks from active defaults rules. Matching calls must still satisfy requirements like `known` destinations or the absence of `untrusted` taint unless the base policy itself changes. Planner-pinned approved values can carry `known` attestations into that override path; raw literals cannot. `locked: true` still prevents all overrides.

**Planner contract:** The planner should produce only `{ authorizations: { ... } }`. The host enforces that restriction before injection. Invalid authorization fragments fail closed during `with { policy }` activation, and no partial authorization layer is installed.

**Atoms:** `policy-authorizations` (full syntax and control-arg enforcement)

## Signing

Cryptographic signing defends against prompt injection by letting auditor LLMs verify their instructions are untampered.

**Flow:** sign templates (with placeholders intact) → pass to LLM exe → LLM calls `mlld verify` → confirms instructions are authentic.

**Automation:** Policy `autosign: ["instructions"]` signs instruction templates on creation. `autoverify: true` injects verification instructions and `MLLD_VERIFY_VARS` into `exe llm` calls. Pair with an enforcement guard to require verification.

**Atoms:** `signing-overview` (start here), `sign-verify`, `autosign-autoverify`

## MCP Security

MCP tool outputs automatically carry `src:mcp` taint. No configuration needed — it happens at the interpreter level.

- **Taint tracking** — `src:mcp` propagates through all transformations and cannot be removed (`mcp-security`)
- **Tool lineage** — `.mx.tools` and `@mx.tools.history` preserve which MCP/exe calls produced the current value (`mcp-security`, `tool-call-tracking`)
- **Policy rules** — restrict what MCP-sourced data can do via label flow rules (`mcp-policy`)
- **Guards** — inspect, block, or retry MCP tool calls using `for secret`, `before op:exe`, or `after op:exe` (`mcp-guards`)

**Atoms:** `mcp-security` (start here), `mcp-policy`, `mcp-guards`

## Environments

Environments encapsulate execution contexts with credentials, isolation, tool restrictions, and resource limits.

- **Credential isolation** — `using auth:*` injects secrets as environment variables via sealed paths. Secrets never enter string interpolation and cannot be leaked via prompt injection targeting command templates.
- **Tool restriction** — `tools` allowlists which runtime tools are available; `mcps` controls MCP server access
- **Process isolation** — providers (`@mlld/env-docker`, `@mlld/env-sprites`) sandbox execution. Provider designation is an explicit trust grant.
- **Composition** — `with` derives restricted children that can only narrow parent capabilities (attenuation invariant)

**Atoms:** `box-overview` (start here), `box-config`, `box-blocks`

## Needs Declarations

`needs` declares what a module requires (commands, runtimes, packages) but does not authorize anything. It validates that the environment can satisfy the module before execution. Security enforcement comes from `policy` and `guard`.

**Atoms:** `security-needs-declaration`

## Audit Logging

Two JSONL ledgers record security events:
- `.mlld/sec/audit.jsonl` — label changes, blessings, trust conflicts, file writes with taint, and `toolCall` events
- `.sig/audit.jsonl` — signing, verification, and mutable file updates

Every audit event carries a stable `id`. File reads consult the audit log to restore taint from prior writes, and tool provenance entries keep `auditRef` pointers back to the `toolCall` records. Inside guards, `@mx.tools.history` exposes that value-level lineage alongside the existing execution-level `@mx.tools.calls`.

**Atoms:** `audit-log`, `tool-call-tracking`

## Patterns

Composite patterns that combine multiple security primitives:

- **Audit guard** — signing + influenced labels + policy for single-auditor prompt injection defense (`pattern-audit-guard`)
- **Dual-audit airlock** — two-call information bottleneck where the security decider never sees adversarial content (`pattern-dual-audit`)

## Reading Order

1. `labels-overview` — what labels are and why they matter
2. `labels-sensitivity` — secret, pii, sensitive
3. `labels-trust` — trusted vs untrusted, sticky asymmetry
4. `labels-influenced` — tracking LLM exposure to tainted data
5. `labels-source-auto` — automatic provenance tracking
6. `security-policies` — declaring policy objects
7. `policy-operations` — semantic labels → risk categories
8. `policy-label-flow` — deny/allow rules for data flow (includes hierarchical op:* matching)
9. `policy-authorizations` — task-scoped per-tool authorization with control-arg enforcement
10. `security-guards-basics` — guard syntax, timing, triggers, and security context
11. `signing-overview` → `sign-verify` → `autosign-autoverify`
12. `mcp-security` → `mcp-policy` → `mcp-guards`
13. `box-overview` → `box-config` → `box-blocks`
14. `pattern-audit-guard` → `pattern-dual-audit`
