---
id: policy-authorizations
qa_tier: 2
title: Policy Authorizations
brief: Declarative per-tool authorization with argument constraints for task-scoped enforcement
category: config
parent: policy
tags: [policy, authorizations, allow, guards, security, planner, agent]
related-code: [core/policy/authorizations.ts, interpreter/policy/authorization-compiler.ts, interpreter/eval/exec/policy-fragment.ts, interpreter/env/builtins/policy.ts, interpreter/hooks/guard-pre-hook.ts]
related: [security-policies, policy-label-flow, guards-privileged, policy-composition, labels-source-auto, facts-and-handles, pattern-planner, tool-docs]
updated: 2026-04-15
---

The `authorizations` section has two layers:

- Base policy declares `authorizations.can_authorize` so a role such as `role:planner` can authorize a specific set of tools.
- Runtime task policy carries compiled `authorizations.allow` / `authorizations.deny` constraints that the worker actually runs under.

Control arg values in runtime authorization entries must carry proof (handle, fact label, or `known` attestation). Proofless literals are rejected — the builder soft-drops them with feedback, and direct runtime policy fragments still fail closed.

For surfaced tool catalogs, the trusted argument metadata lives on `inputs: @record`: record `facts` become the tool's effective control args on write surfaces and effective source args on read surfaces.

```mlld
var known @approvedRecipient = "mark@example.com"

policy @workspace = {
  defaults: { rules: ["no-send-to-unknown", "no-destroy-unknown"] },
  operations: {
    "exfil:send": ["tool:w:send_email", "tool:w:share_file"],
    "destructive:targeted": ["tool:w:delete_file"]
  },
  authorizations: {
    deny: ["update_password"],
    can_authorize: {
      role:planner: [@send_email, @create_file]
    }
  }
}

var @built = @policy.build({
  known: {
    send_email: {
      recipients: [@approvedRecipient]
    }
  },
  allow: {
    create_file: true
  }
}, @agentTools) with { policy: @workspace }

var @result = @worker(@prompt) with { policy: @built.policy }
```

The framework reads `can_authorize` from the base policy, validates planner intent with `@policy.build`, and applies the returned runtime policy to the worker call. Policy compilation preserves proof-bearing structured leaves while normalizing the runtime policy. That includes policy fragments coming from variables, field access, imported modules, and `{ ...@basePolicy }` object-spread composition.

## Tool Metadata

For surfaced tool catalogs, the trusted metadata usually lives on the tool entry through `inputs: @record`:

```mlld
record @send_email_inputs = {
  facts: [
    recipients: { type: array, kind: "email" },
    cc: { type: array?, kind: "email" },
    bcc: { type: array?, kind: "email" }
  ],
  data: {
    trusted: [subject: string],
    untrusted: [body: string?]
  },
  exact: [subject],
  optional_benign: [cc, bcc],
  validate: "strict"
}

exe tool:w @send_email(recipients, cc, bcc, subject, body) = @sendMailApi(
  @recipients,
  @cc,
  @bcc,
  @subject,
  @body
)

var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["tool:w:send_email", "exfil:send", "comm:w"],
    can_authorize: "role:planner"
  }
}
```

For record-backed tool catalogs:

- record fields must match the surfaced executable params
- executable params must be covered by either `inputs` or `bind`
- record `facts` become the tool's effective control args on write surfaces
- record `facts` become the tool's effective source args on read-only surfaces
- fact-field `kind` tags and `accepts` overrides drive the proof patterns `@policy.build(...)` accepts for control args
- record `correlate: true` becomes the same-source check for multi-fact write tools
- record `exact` runs at builder time only, `allowlist` / `blocklist` / `update` run at builder and dispatch, `optional_benign` is validator-only, and `correlate` is dispatch-only
- `data.trusted` and `data.untrusted` flow into runtime validation, `@toolDocs()`, MCP annotations, and injected tool notes
- tool catalog `labels` are added to the invoked exe when the surfaced tool is called

`kind` matching is exact string equality. Untagged fact fields fall back to `known` or `fact:*.<argName>`. Use `accepts` on the input-record fact field when a tool needs an explicit pattern list instead of the derived kind set.

`mlld validate --context tools.mld` and runtime activation both use this trusted metadata when checking `policy.authorizations`. Native function-tool calls carry the same metadata through the bridge. Imported tool collections, object fields, and exe-parameter handoffs preserve that trusted metadata, so framework modules can build or re-validate authorizations against the surfaced tool names without importing the underlying executables into local scope.

Planner-pinned values can also carry attestation requirements. If a planner pins a `known` recipient or a `known:internal` destination, that requirement is compiled into the authorization guard and reused when inherited positive checks run later.

## Role-based authorization permissions

`authorizations.can_authorize` is developer-declared base policy metadata. It decides which exe role can authorize which tools:

```mlld
policy @workspace = {
  authorizations: {
    deny: ["update_password"],
    can_authorize: {
      role:planner: [@send_email, @create_file]
    }
  }
}
```

Rules:

- Keys must use the exact `role:*` label form. No bare `planner` alias.
- Values are executable refs or surfaced tool names for tools the role may authorize.
- `authorizations.deny` is absolute. A denied tool cannot also be can_authorize.
- `can_authorize` belongs only on the base policy. It is not mergeable runtime policy state.

Authorization identity comes from the caller exe's `role:*` label, not from `with { display }`. Display can shape projected values and tool docs, but it does not change which `can_authorize` entry applies.

Tool catalogs can provide shorthand defaults for that base policy:

```mlld
var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    can_authorize: "role:planner"
  },
  update_password: {
    mlld: @update_password,
    inputs: @update_password_inputs,
    can_authorize: false
  }
}
```

When `@policy.build(...)` or `@policy.validate(...)` runs against `@agentTools`, the builder merges catalog `can_authorize` entries into the active base policy for that surfaced tool set. `false` is shorthand for adding the surfaced tool to `policy.authorizations.deny`.

## Entries

Keys under `authorizations.allow` are exact operation names matching `@mx.op.name`. For MCP-backed tools, use the mlld-side canonical name, not the provider's raw tool name.

At runtime, this allowlist applies only to the active surfaced tool set from `tools:` or tool-collection dispatch. LLM/provider wrappers and internal substrate helpers such as `@claude` internals are not agent-visible tool names, so they are not checked against `authorizations.allow`.

| Form | Meaning |
|---|---|
| Omitted (but in scope) | Denied. Default-deny for unlisted `tool:w` operations. |
| `create_file: true` | Authorized with no argument constraints. Only valid for tools with no effective control args. |
| `send_email: { args: { ... } }` | Authorized. Listed args must satisfy constraints. |

`{}` and `{ args: {} }` are accepted but normalized to `true` with a warning. The canonical form for unconstrained authorization is `true`.

## Argument Constraints

Each constrained argument accepts:

**Proof-bearing literal value** — uses tolerant comparison (`~=`):

```mlld
var known @approvedRecipient = "mark@example.com"

var @taskPolicy = {
  authorizations: {
    allow: {
      send_email: {
        args: {
          recipients: [@approvedRecipient]
        }
      }
    }
  }
}
```

**Explicit eq** — equivalent to bare literal, for clarity:

```mlld
send_email: {
  args: {
    recipients: { eq: [@approvedRecipient] }
  }
}
```

**One-of** — arg must match any candidate:

```mlld
var known @markRecipient = "mark@example.com"
var known @sarahRecipient = "sarah@example.com"

send_email: {
  args: {
    recipients: { oneOf: [[@markRecipient], [@sarahRecipient]] }
  }
}
```

**Explicit attestation carry-through** — planner or host can preserve trusted approval when emitting plain JSON:

```mlld
send_email: {
  args: {
    recipients: {
      eq: ["mark@example.com"],
      attestations: ["known"]
    }
  }
}
```

This is the bridge format for planner/worker handoff. If the planner already verified the pinned value from a trusted source, `attestations` lets the later worker call satisfy inherited positive checks such as `no-send-to-unknown` without re-looking the value up in the worker session.

For planner outputs, prefer the bucketed `resolved` / `known` / `allow` builder input over hand-writing `attestations`.

Tolerant comparison (`~=`) handles string-vs-array, ordering, null equivalence, and subset matching. The worker can do *less* than authorized (fewer recipients) but not *more* (additional unauthorized recipients).

## Control-Arg Enforcement

Tools have an effective set of security-relevant args. For record-backed tool catalogs, write-surface `facts` are the effective control args. The runtime enforces that planners constrain all of them.

**Two enforcement layers:**

**Validation:** `mlld validate --context tools.mld` catches missing constraints before execution:

- An effective control arg that is NOT constrained in the `authorizations` entry is a **validation error**. The planner must pin it with a literal, `eq`, or `oneOf` constraint.
- A tool with effective control args authorized as `true` (unconstrained) is a **validation error**. `true` is only valid for tools with no effective control args.

**Runtime (always):** Whether or not validation ran, the runtime enforces that args not mentioned in the constraint must be empty/null. If the planner doesn't mention `cc` on `send_email`, the runtime enforces that `cc` must be null, `[]`, or absent. This prevents silent omission from becoming an open hole.

- Arguments not declared as control args are unconstrained data args — the worker fills them freely.
- If the planner includes data args in the authorization (title, description, etc.), the runtime strips them at compilation time. Only effective control args are compiled into constraints. The planner doesn't need to know which args are control args vs data args.

## Cross-Arg Correlation: `correlate`

When a write tool has more than one control arg, the runtime can require that all of them came from the same source record. This blocks an attack class where the planner mixes a fact-bearing arg from one record with a fact-bearing arg from a different record — both args have proof, but together they target the wrong thing.

```mlld
record @update_scheduled_transaction_inputs = {
  facts: [id: string, recipient: string],
  data: [amount: number, date: string],
  correlate: true,
  validate: "strict"
}

exe tool:w @updateScheduledTransaction(id, recipient, amount, date) = [...]

var tools @writeTools = {
  update_scheduled_transaction: {
    mlld: @updateScheduledTransaction,
    inputs: @update_scheduled_transaction_inputs
  }
}
```

When `correlate: true` is set on a write-tool input record with multiple fact fields, the runtime checks at dispatch time that every control arg value's `factsources` provenance points to the **same source record instance**. If they don't, the dispatch is denied with `Rule 'correlate-control-args': control args on @<tool> must come from the same source record`.

**The attack this defends against:**

```
User has two scheduled transactions in their account:
  A: pay $500 to landlord on the 15th    (legitimate)
  B: pay $200 to attacker@evil.com       (planted, but real in the bank)

User says "update transaction A's amount to $600."

Without correlation:
  Planner authorizes update_scheduled_transaction(A.id, B.recipient, 600)
  Both args have fact proof — A.id and B.recipient are real fact-bearing values
  no-send-to-unknown sees proof on both, allows the call
  Bank updates transaction A's recipient to attacker@evil.com

With `correlate: true`:
  Same dispatch attempted
  Runtime checks A.id and B.recipient — different source record instances
  Rule 'correlate-control-args' fires: DENIED
```

**How instance identity is determined.** Each fact-bearing value carries a `factsources` entry with up to three identity fields:

- `instanceKey` — the value of the record's declared `key:` field, when the record has one. For string keys the runtime stores the bare value (`tx_001`). For non-string keys it keeps the canonical typed encoding (`number:42`, `object:{...}`) so different key types stay distinguishable.
- `coercionId` — a UUID stamped at `=> record` coercion time, identifying the specific tool call that produced the value.
- `position` — the array position of the value within its coercion's result, distinguishing siblings from the same call when the record has no `key`.

The comparator prefers `instanceKey` when available, falling back to `(coercionId, position)` for keyless records. This means **re-fetching the same record from a separate tool call still correlates correctly** — two `@getTransactionById("tx_001")` calls produce values with different `coercionId`s but the same `instanceKey`, and dispatching control args mixed across the two fetches is allowed because they refer to the same logical record.

**When to use it.** Set `correlate: true` on any write-tool input record whose fact fields together identify a single logical target. Account updates, transaction modifications, message replies, file moves — anywhere multiple args must agree on which entity they're operating on. The framework default for multi-fact write inputs should be `true`; opt out only when the tool genuinely takes unrelated control args.

**What the rule does NOT defend against.** Single-control-arg tools are unaffected (one arg has nothing to correlate against). Tools with `correlate: false` (or unset) skip the check entirely. Values without `factsources` (constructed via mlld code without going through `=> record` coercion) cannot be correlated and the dispatch will be denied with a "missing factsource" reason.

The runtime check fires on both dispatch paths: orchestrator-side direct exec calls and LLM-bridge dispatched tool calls. There is no path that bypasses it.

The factsource identity behavior described here is covered in the record coercion test matrix for `js`, `cmd`, `sh`, `node`, `py`, inline `as record`, and imported MCP-backed wrapper exes.

## Input Policy Sections

Input records can refine write-tool contracts with top-level policy sections:

### `update`

`update: [field, ...]` declares the mutable fields on the target:

```mlld
record @update_scheduled_transaction_inputs = {
  facts: [id: string, recipient: string],
  data: [amount: number?, date: string?, subject: string?, recurring: boolean?],
  update: [amount, date, subject, recurring],
  validate: "strict"
}

var tools @writeTools = {
  update_scheduled_transaction: {
    mlld: @updateScheduledTransaction,
    inputs: @update_scheduled_transaction_inputs,
    labels: ["tool:w:update_scheduled_transaction", "bank:w", "update:w"]
  }
}
```

`facts` identify the target. `update` lists the actual changes. The runtime rejects update calls with no non-null `update` fields, and the validator requires the surfaced tool to carry `update:w` in `labels`.

### `exact`

`exact: [field, ...]` declares payload fields that must come from the user's task text verbatim:

```mlld
record @send_direct_message_inputs = {
  facts: [recipient: string],
  data: [body: string],
  exact: [body],
  validate: "strict"
}
```

When `@policy.build(@intent, @tools, { task: @query })` is called, listed fields are checked against the task text (case-insensitive, trimmed). Values not found in the task text are rejected.

### `allowlist`, `blocklist`, and `optional_benign`

- `allowlist: { field: @set }` restricts a field to a named set
- `blocklist: { field: @set }` rejects values that appear in a named set
- `optional_benign: [field, ...]` acknowledges optional fact fields whose omission is harmless and suppresses the validator advisory

`allowlist` and `blocklist` can both apply to the same field. The value must satisfy both checks.

**Example:** `send_email` treats `recipients`, `cc`, and `bcc` as control args because they are fact fields. `subject`, `body`, and `attachments` are data args.

```json
{
  "authorizations": {
    "allow": {
      "send_email": {
        "args": {
          "recipients": {
            "eq": ["mark@example.com"],
            "attestations": ["known"]
          }
        }
      }
    }
  }
}
```

This authorizes `send_email` with `recipients` pinned to `mark@example.com` and carries the required proof forward. Because `cc` and `bcc` are also control args but omitted from the constraint, they are enforced as empty/null at runtime. The planner does not need to mention `subject` or `body` — those are data args.

If the planner had written `"send_email": true`, validation would reject it because `send_email` has effective control args.

## Enforcement

`authorizations` compiles to internal privileged guards. These are the same guards that `defaults.rules` and `labels` produce — they participate in the standard guard override mechanism:

- Matching `allow` can override managed label-flow denials from `defaults.rules` and `labels` only after inherited positive checks still pass. For example, `no-send-to-unknown` still requires destination args to carry fact proof or `known`. `no-untrusted-destructive` and `no-untrusted-privileged` scope to control args when effective control-arg metadata exists — tainted data args (body, title) don't block the authorized operation.
- `locked: true` disables all overrides — authorization entries are still checked, but a matching entry cannot punch through locked denials
- Capability denials (`capabilities.allow/deny/danger`), `env` restrictions, `auth`, and `limits` are separate enforcement paths and are not affected by `authorizations`

Authorization matching is not enough by itself for positive checks, and proofless raw literals do not make it to dispatch. `@policy.build` drops them with issues, and hand-built `with { policy }` fragments hard-fail compilation. If the planner pins `@approvedRecipient` and that value carried `known`, or uses the bucketed `known` shape, the authorization guard carries that attestation forward so the later worker call can satisfy inherited positive checks.

Authorization denials behave like any other guard denial — they can be caught with `denied =>` handlers and are surfaced through the SDK's existing denial reporting. Record-backed dispatch denials such as `allowlist_mismatch`, `blocklist_match`, `no_update_fields`, and `proofless_control_arg` also reach `denied =>`; inside the handler, inspect `@mx.denial.code`, `@mx.denial.phase`, `@mx.denial.tool`, and `@mx.denial.field`.

Authorization denial reasons distinguish the cause:

- `policy.authorizations.unlisted` — tool was never authorized
- `policy.authorizations.compile_dropped` — tool was authorized but the entry was dropped during compilation (ambiguity, proof loss)
- `policy.authorizations.args_mismatch` — tool was authorized but the compiled authorization constraint did not match the dispatched control-arg values

`args_mismatch` is the generic compiled-policy mismatch code. Input-record section checks such as `allowlist` and `blocklist` keep their section-specific reasons (`allowlist_mismatch`, `blocklist_match`) so runtime reports can tell "the policy constraint did not match" apart from "the dispatched value violated the input-record contract."

When an array control arg has one ambiguous element, only that element is dropped — the rest of the array and the tool entry are preserved. Ambiguous matches that resolve to the same canonical value are treated as equivalent and kept.

When debugging "why was this dispatch denied," the policy denial hint includes a pointer to `@mx.policy.active` — the ambient accessor that returns structured descriptors for the policies active in the current execution context (`{ name, locked, source }` per active policy). Use this from a guard, a probe, or a test to verify which policies are actually layered into the current dispatch and which one (or several) issued the denial. See `builtins-ambient-mx`.

## Deny list

`authorizations.deny` prevents specific tools from ever being authorized, even if a role lists them under `can_authorize`:

```mlld
policy @base = {
  defaults: { rules: ["no-send-to-unknown", "no-untrusted-destructive"] },
  authorizations: {
    deny: ["update_password", "update_user_info"]
  }
}
```

Denied tools are rejected in both `@policy.build` and `with { policy }` compilation. Authorizations open narrow windows in policy — `deny` prevents certain windows from ever opening.

## Dynamic dispatch from tool collections

Tool collections support dynamic invocation by key with policy enforcement:

```mlld
@writeTools["send_email"](@args) with { policy: @taskPolicy }
```

Policy matches against the **collection key** (`send_email`), not the underlying exe name. Arg objects are spread to named params using the tool's metadata. This is the recommended pattern for policygen-style loops where the planner selects a tool by name:

```mlld
var @auth = @policy.build(@step.authorizations, @writeTools)
show @writeTools[@step.write_tool](@step.args) with { policy: @auth.policy }
```

No generated dispatch shims or routing exes needed. The tool collection metadata (`inputs`, params, bind shaping, or legacy control/source arg overrides) is the source of truth for both policy matching and arg spreading.

Handle-bearing values inside `@step.args` are preserved through collection dispatch and arg spreading. Objects such as `{ handle: "h_abc123" }` or `{ preview: "m***@example.com", handle: "h_abc123" }` stay intact until dispatch-time resolution, so planner-selected collection calls behave the same way as direct tool calls.

## Policy builder

`@policy.build(@intent, @tools, @options?)` validates planner intent against tool metadata and active policy:

```mlld
var @plannerResult = @planner(@task) | @parse
var @auth = @policy.build(@plannerResult.authorizations, @writeTools, { task: @task })
var @result = @worker(@task) with { policy: @auth.policy }
```

By default, the builder reads its base policy scaffold from the active environment. Pass `basePolicy` in `@options` when framework code needs to build against an explicit policy object instead of the current env scope:

```mlld
var @auth = @policy.build(@plannerResult.authorizations, @writeTools, {
  task: @task,
  basePolicy: @agent.basePolicy
})
```

`basePolicy` may come from literals, field access, exe-returned objects, imported module values, or variable-held policy fragments composed with object spread. The builder materializes nested arrays/objects before normalizing the policy scaffold, while preserving proof-bearing leaves used by `authorizations`, so values like exe-returned rule lists or fact-bearing recipient lists are accepted directly.

For allow-only writes, the returned `policy` is already dispatch-ready. The builder preserves that base policy scaffold (`defaults`, `operations`, existing `authorizations.deny`, and similar host-controlled sections) and adds the compiled `authorizations.allow` fragment on top. Callers do not need to reconstruct a step policy manually:

```mlld
var @base = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { destructive: ["tool:w:delete_draft"] },
  authorizations: { deny: ["delete_draft"] }
}

var @built = @policy.build({ allow: { create_draft: true } }, @writeTools) with {
  policy: @base
}

show @writeTools["create_draft"](@step.args) with { policy: @built.policy }
```

Imported `var tools` collections are valid inputs here. Plain arrays of executable refs are also accepted and auto-normalized by executable name. The builder uses stored authorization metadata first when it exists, so callers do not need to redundantly import every underlying executable just to build or validate auth.

The builder reads the active policy from the environment (deny list, rules, operations). Framework code checks `can_authorize` before calling the builder and strips any stray `can_authorize` field from runtime intent so the builder contract stays strict. It returns `{ policy, valid, issues, report }`:

- `policy` — valid auth fragment, ready for `with { policy }`
- `valid` — boolean
- `issues` — array of `{ tool, reason, arg?, element? }` describing what was dropped
- `report` — compiler diagnostics describing strips, repairs, dropped entries/elements, ambiguity, compiled proofs, and any omitted tools that were auto-promoted to tool-level allow

`options.task` is optional. When present and non-empty on either `@policy.build(...)` or `@policy.validate(...)`, `known` bucket string/number literals must appear in the task text (case-insensitive substring match). Handle wrappers in `known` are rejected under task validation and must move to `resolved`.

What the builder checks:

- Denied tools → dropped (`denied_by_policy`)
- Unknown tools → dropped (`unknown_tool`)
- Bucketed intent from influenced sources → rejected (`bucketed_intent_from_influenced_source`)
- `true` for tools with effective control args in flat / raw `authorizations.allow` form → dropped (`requires_control_args`)
- `allow: { tool: true }` in bucketed intent → explicit tool-level authorization
- Omitted bucketed tools whose input records have no fact fields, or whose fact fields are all listed in `optional_benign`, are auto-promoted to tool-level allow and recorded in `report.autoAllowedTools`
- Proofless control arg values → tool dropped (`proofless_control_arg`)
- `exact` mismatch against `options.task` → tool dropped (`exact_not_in_task`)
- `allowlist` mismatch → tool dropped (`allowlist_mismatch`)
- `blocklist` match → tool dropped (`blocklist_match`)
- update tool with no non-null update fields → tool dropped (`no_update_fields`)
- `known` values from influenced sources → dropped (`known_from_influenced_source`)
- `known` literals missing from the provided task text → dropped (`known_not_in_task`)
- Handle wrappers in `known` while task validation is enabled → dropped (`known_contains_handle`)
- `resolved` and `known` on the same tool+arg → `known` dropped (`superseded_by_resolved`)
- Mixed flat + bucketed top-level fields → rejected (`invalid_authorization`)
- Unrecognized bucketed top-level fields → rejected (`invalid_authorization`)
- `can_authorize` in runtime intent → rejected (`invalid_authorization`)
- Non-control args → silently stripped

Builder and validator results are additive:

```json
{
  "policy": { "authorizations": { "allow": {} } },
  "valid": false,
  "issues": [ ... ],
  "report": {
    "strippedArgs": [ ... ],
    "repairedArgs": [ ... ],
    "droppedEntries": [ ... ],
    "droppedArrayElements": [ ... ],
    "ambiguousValues": [ ... ],
    "compiledProofs": [ ... ],
    "autoAllowedTools": [ ... ]
  }
}
```

`report` is runtime-native compiler diagnostics. Use it to distinguish "the planner asked for something invalid" from "the runtime repaired or stripped part of the intent successfully."

### Bucketed intent shape

The planner structures its authorization output by proof source:

```json
{
  "resolved": {
    "append_to_file": { "file_id": "h_upt8mo" },
    "send_email": { "recipients": ["h_2l5r36"] }
  },
  "known": {
    "send_email": {
      "recipients": {
        "value": "john@example.com",
        "source": "user asked to email john"
      }
    }
  },
  "allow": {
    "create_file": true
  }
}
```

Three buckets:

- **`resolved`** — values from tool results. Every non-empty control arg value must be either a resolvable handle or a direct fact-bearing value carrying `fact:*` proof. Bare proofless literals are rejected.
- **`known`** — values the user explicitly provided. Attested as `known`. Optional `source` field for audit logging (never compiled into policy).
- **`allow`** — explicit tool-level authorization. Use object form: `{ "tool_name": true }`. This remains valid even when the tool has effective control args, because the planner is authorizing the whole tool rather than pinning per-arg constraints.

When a surfaced tool's input record has no fact fields, or every fact field is optional and listed in `optional_benign`, bucketed intent may omit that tool entirely. `@policy.build` auto-promotes it to tool-level allow and records the decision in `report.autoAllowedTools`. This auto-allow behavior is bucketed-intent-only; flat runtime intent remains explicit.

`can_authorize` is not a fourth bucket. It stays on the developer-owned base policy and never belongs in planner-produced runtime intent.

The entire bucketed intent must come from uninfluenced sources. The clean planner produces the intent. Influenced workers produce data for reasoning, not authorization. This is a hard invariant — the builder rejects intent from influenced sources.

**Where user-typed payload values go.** User-provided literal values — update fields like `new_start_time: "14:00"`, payload values like `subject: "Q4 Review"` — belong in `known`, keyed by the tool they satisfy. If the user's task is "reschedule my 2pm meeting to 3pm," then `event_id: h_abc` (from a prior resolve phase) goes in `resolved.reschedule_calendar_event.event_id` and `new_start_time: "15:00"` (from the user's task text) goes in `known.reschedule_calendar_event.new_start_time`. The runtime validates both buckets against the tool's input record: `facts` define control args, `update` defines the mutation set, and `exact` checks task-text grounding.

If a planner produces a request with separate `authorizations` and `literal_inputs` (or equivalent) fields, merge `literal_inputs` into the `known` bucket before calling `@policy.build`. Without this merge, the builder sees control args (via `resolved`) but no payload values, and the `update` check fails with `no_update_fields`. The fix is not to read tool metadata in orchestration code and synthesize a richer intent — it's to put the user's literal values in the right bucket. `known` is the primitive for uninfluenced user-provided payloads; use it.

The builder also accepts flat and nested runtime intent shapes:

```json
{ "send_email": { "recipients": "h_2l5r36" }, "create_file": true }
```

Flat and bucketed intent must not be mixed in the same object. The builder rejects mixed shapes loudly instead of silently dropping top-level tool entries.

For array control args, proof is checked per element. Proofless elements are dropped individually. If the same tool+arg appears in both `resolved` and `known`, `resolved` wins and an issue is emitted.

### Planner retry via guard

Use `@policy.validate` in a guard to retry the planner when its auth has issues:

```mlld
exe @plan(task) = @claude(@task, { tools: @allTools }) with { display: "role:planner" }

guard after @validateAuth for op:named:plan = when [
  @policy.validate(@output, @writeTools).valid == false && @mx.guard.try < 2
    => retry "Fix authorization: @policy.validate(@output, @writeTools).issues. Report: @policy.validate(@output, @writeTools).report"
  * => allow
]
```

The planner prompt is: "Put handle values or direct fact-bearing tool results in `resolved`. Put values the user explicitly provided in `known`. Put tool-level authorizations in `allow`."

## Framework-managed dispatch

The supported planner flow is: base policy declares `can_authorize`, planner emits runtime authorization intent, framework validates it with `@policy.build`, then the worker runs with the compiled policy:

```mlld
var @plannerOutput = @planner(@task) | @parse
var @built = @policy.build(@plannerOutput.authorizations, @writeTools) with { policy: @workspace }
var @result = @worker(@prompt) with { policy: @built.policy }
```

The planner's output should contain only runtime authorization intent — not `can_authorize`, `defaults`, `rules`, `locked`, `labels`, `operations`, or other developer-controlled policy sections.

## Validation

`mlld validate --context tools.mld` checks authorizations fragments:

- Every `authorizations.allow` key must resolve to a known surfaced tool or exe in context
- Every constrained arg name must exist on that tool's surfaced parameter list
- An effective control arg omitted from the `args` constraint is an error
- A tool with effective control args authorized as `true` is an error

That validation is scoped to actual policy surfaces: `/policy` declarations and statically analyzable `@policy.build(...)` / `@policy.validate(...)` callsites. Ordinary data objects may still use a field named `authorizations`; they stay plain data until framework code passes them to the policy builder or validator.
- If trusted control-arg metadata is missing for a `tool:w` exe, every declared parameter is treated as a control arg
- `{}` and `{ args: {} }` produce normalization warnings

Invalid fragments fail closed: if validation fails, the policy is not activated, the exe call fails with a structured error, and the host decides recovery.

## Composition

When multiple active policy layers have `authorizations`, they compose via the standard "most restrictive wins" rule:

| Aspect | Rule |
|---|---|
| Allowed operations | Intersection (both must authorize) |
| Constraints per operation | Conjunction (all must pass) |

`true` merged with a constrained entry becomes the constrained entry. Incompatible constraints (e.g., `eq: "a"` and `eq: "b"`) are valid config but no runtime value can satisfy them — the call is denied.

See `policy-composition` for general merge rules. See `guards-privileged` for the override mechanism.
