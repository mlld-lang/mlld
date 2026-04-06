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
updated: 2026-04-02
---

The `authorizations` section in policy declares which `tool:w` operations are authorized for a task, with per-argument constraints on control args. The runtime compiles these into internal privileged guards that enforce a default-deny envelope.

Control arg values in authorization entries must carry proof (handle, fact label, or `known` attestation). Proofless literals are rejected — the builder soft-drops them with feedback, hand-built `with { policy }` hard-fails.

```mlld
var known @approvedRecipient = "mark@example.com"

policy @base = {
  defaults: { rules: ["no-send-to-unknown", "no-destroy-unknown"] },
  operations: {
    "exfil:send": ["tool:w:send_email", "tool:w:share_file"],
    "destructive:targeted": ["tool:w:delete_file"]
  }
}

var @taskPolicy = {
  authorizations: {
    allow: {
      send_email: {
        args: {
          recipients: [@approvedRecipient]
        }
      },
      create_file: true
    }
  }
}

var @result = @worker(@prompt) with { policy: @taskPolicy }
```

The `with { policy }` merge combines `@taskPolicy` with the ambient `@base` policy. The merged config activates authorization enforcement for the call chain.

## Tool Metadata

The base trusted metadata now lives on the executable declaration itself:

```mlld
exe tool:w @send_email(recipients, cc, bcc, subject) = @sendMailApi(
  @recipients,
  @cc,
  @bcc,
  @subject
) with { controlArgs: ["recipients", "cc", "bcc"] }
```

Tool collections can restate or tighten that metadata for a specific exposure:

```mlld
var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    labels: ["tool:w:send_email"],
    expose: ["recipients", "cc", "bcc", "subject"],
    controlArgs: ["recipients", "cc", "bcc"]
  },
  create_file: {
    mlld: @create_file,
    labels: ["tool:w:create_file"],
    expose: ["title"],
    controlArgs: []
  }
}
```

`controlArgs` must reference visible tool parameters. `mlld validate --context tools.mld` and runtime activation both use this trusted metadata when checking `policy.authorizations`. Native function-tool calls carry the same metadata through the bridge.

Planner-pinned values can also carry attestation requirements. If a planner pins a `known` recipient or a `known:internal` destination, that requirement is compiled into the authorization guard and reused when inherited positive checks run later.

## Entries

Keys under `authorizations.allow` are exact operation names matching `@mx.op.name`. For MCP-backed tools, use the mlld-side canonical name, not the provider's raw tool name.

| Form | Meaning |
|---|---|
| Omitted (but in scope) | Denied. Default-deny for unlisted `tool:w` operations. |
| `create_file: true` | Authorized with no argument constraints. Only valid for tools with no declared control args. |
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

Tools declare which arguments are security-relevant (control args) via `controlArgs`. The runtime consumes exe metadata plus any active tool-collection overrides to enforce that planners constrain all control args.

**Two enforcement layers:**

**Validation:** `mlld validate --context tools.mld` catches missing constraints before execution:

- A declared control arg that is NOT constrained in the `authorizations` entry is a **validation error**. The planner must pin it with a literal, `eq`, or `oneOf` constraint.
- A tool with declared control args authorized as `true` (unconstrained) is a **validation error**. `true` is only valid for tools with no effective control args.
- If trusted control-arg metadata is absent for a `tool:w` executable, validation fails closed by treating every declared parameter as a control arg.

**Runtime (always):** Whether or not validation ran, the runtime enforces that args not mentioned in the constraint must be empty/null. If the planner doesn't mention `cc` on `send_email`, the runtime enforces that `cc` must be null, `[]`, or absent. This prevents silent omission from becoming an open hole.

- Arguments not declared as control args are unconstrained data args — the worker fills them freely.
- If the planner includes data args in the authorization (title, description, etc.), the runtime strips them at compilation time. Only declared control args are compiled into constraints. The planner doesn't need to know which args are control args vs data args.

## Update and Payload Arg Enforcement

Two additional exe metadata fields refine write tool contracts:

### `updateArgs`

Declares which args are mutable fields on the target:

```mlld
exe tool:w @updateScheduledTransaction(id, recipient, amount, date, subject, recurring) = [...]
  with {
    controlArgs: ["id", "recipient"],
    updateArgs: ["amount", "date", "subject", "recurring"]
  }
```

`controlArgs` identifies the target. `updateArgs` are the actual changes. The runtime rejects update calls with no non-null `updateArgs` values — "update with no changed fields." The builder drops update tools authorized with `allow: ["toolName"]` when `updateArgs` is declared (issue: `no_update_fields`).

`updateArgs` must be disjoint from `controlArgs`.

### `exactPayloadArgs`

Declares which payload fields must be explicitly user-provided text:

```mlld
exe tool:w @sendDirectMessage(recipient, body) = [...]
  with {
    controlArgs: ["recipient"],
    exactPayloadArgs: ["body"]
  }
```

When `@policy.build(@intent, @tools, { task: @query })` is called, `exactPayloadArgs` values are checked against the task text (case-insensitive, trimmed). Values not in the task text are rejected (issue: `payload_not_in_task`). This applies to values in `resolved`, `known`, and flat intent.

`exactPayloadArgs` must be a subset of non-control params. It may overlap with `updateArgs`.

### Combined example

```mlld
exe tool:w @updateScheduledTransaction(id, recipient, amount, date, subject, recurring) = [...]
  with {
    controlArgs: ["id", "recipient"],
    updateArgs: ["amount", "date", "subject", "recurring"],
    exactPayloadArgs: ["subject"]
  }
```

- `id` and `recipient` need proof (handles)
- At least one of `amount`, `date`, `subject`, `recurring` must have a value
- `subject` must appear in the user's task text

All three metadata fields use restrict-only override semantics on tool collections.

**Example:** `send_email` declares `recipients`, `cc`, `bcc` as control args. `subject`, `body`, `attachments` are data args.

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

This authorizes `send_email` with `recipients` pinned to `mark@example.com` and carries the required proof forward. Because `cc` and `bcc` are declared control args but omitted from the constraint, they are enforced as empty/null at runtime. The planner doesn't need to mention `subject` or `body` — those are data args.

If the planner had written `"send_email": true`, validation would reject it because `send_email` has declared control args.

## Enforcement

`authorizations` compiles to internal privileged guards. These are the same guards that `defaults.rules` and `labels` produce — they participate in the standard guard override mechanism:

- Matching `allow` can override managed label-flow denials from `defaults.rules` and `labels` only after inherited positive checks still pass. For example, `no-send-to-unknown` still requires destination args to carry fact proof or `known`. `no-untrusted-destructive` and `no-untrusted-privileged` scope to control args when `controlArgs` is declared — tainted data args (body, title) don't block the authorized operation.
- `locked: true` disables all overrides — authorization entries are still checked, but a matching entry cannot punch through locked denials
- Capability denials (`capabilities.allow/deny/danger`), `env` restrictions, `auth`, and `limits` are separate enforcement paths and are not affected by `authorizations`

Authorization matching is not enough by itself for positive checks, and proofless raw literals do not make it to dispatch. `@policy.build` drops them with issues, and hand-built `with { policy }` fragments hard-fail compilation. If the planner pins `@approvedRecipient` and that value carried `known`, or uses the bucketed `known` shape, the authorization guard carries that attestation forward so the later worker call can satisfy inherited positive checks.

Authorization denials behave like any other guard denial — they can be caught with `denied =>` handlers and are surfaced through the SDK's existing denial reporting.

Authorization denial reasons distinguish the cause:

- `policy.authorizations.unlisted` — tool was never authorized
- `policy.authorizations.compile_dropped` — tool was authorized but the entry was dropped during compilation (ambiguity, proof loss)
- `policy.authorizations.args_mismatch` — tool was authorized but args don't match the constraint

When an array control arg has one ambiguous element, only that element is dropped — the rest of the array and the tool entry are preserved. Ambiguous matches that resolve to the same canonical value are treated as equivalent and kept.

## Deny list

`authorizations.deny` prevents specific tools from ever being planner-authorized:

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

No generated dispatch shims or routing exes needed. The tool collection metadata (params, controlArgs, expose/bind shaping) is the source of truth for both policy matching and arg spreading.

Handle-bearing values inside `@step.args` are preserved through collection dispatch and arg spreading. Objects such as `{ handle: "h_abc123" }` or `{ preview: "m***@example.com", handle: "h_abc123" }` stay intact until dispatch-time resolution, so planner-selected collection calls behave the same way as direct tool calls.

## Policy builder

`@policy.build(@intent, @tools, @options?)` validates planner intent against tool metadata and active policy:

```mlld
var @plannerResult = @planner(@task) | @parse
var @auth = @policy.build(@plannerResult.authorizations, @writeTools, { task: @task })
var @result = @worker(@task) with { policy: @auth.policy }
```

For allow-only writes, the returned `policy` is already dispatch-ready. The builder preserves the active policy scaffold (`defaults`, `operations`, existing `authorizations.deny`, and similar host-controlled sections) and adds the compiled `authorizations.allow` fragment on top. Callers do not need to reconstruct a step policy manually:

```mlld
var @base = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { destructive: ["tool:w:delete_draft"] },
  authorizations: { deny: ["delete_draft"] }
}

var @built = @policy.build({ allow: ["create_draft"] }, @writeTools) with {
  policy: @base
}

show @writeTools["create_draft"](@step.args) with { policy: @built.policy }
```

Imported `var tools` collections are valid inputs here. The builder uses the collection's stored authorization metadata first, so callers do not need to redundantly import every underlying executable just to build or validate auth.

The builder reads the active policy from the environment (deny list, rules, operations). It returns `{ policy, valid, issues, report }`:

- `policy` — valid auth fragment, ready for `with { policy }`
- `valid` — boolean
- `issues` — array of `{ tool, reason, arg?, element? }` describing what was dropped
- `report` — compiler diagnostics describing strips, repairs, dropped entries/elements, ambiguity, and compiled proofs

`options.task` is optional. When present and non-empty on either `@policy.build(...)` or `@policy.validate(...)`, `known` bucket string/number literals must appear in the task text (case-insensitive substring match). Handle wrappers in `known` are rejected under task validation and must move to `resolved`.

What the builder checks:

- Denied tools → dropped (`denied_by_policy`)
- Unknown tools → dropped (`unknown_tool`)
- Bucketed intent from influenced sources → rejected (`bucketed_intent_from_influenced_source`)
- `true` for tools with `controlArgs` → dropped (`requires_control_args`)
- Proofless control arg values → tool dropped (`proofless_control_arg`)
- `known` values from influenced sources → dropped (`known_from_influenced_source`)
- `known` literals missing from the provided task text → dropped (`known_not_in_task`)
- Handle wrappers in `known` while task validation is enabled → dropped (`known_contains_handle`)
- `resolved` and `known` on the same tool+arg → `known` dropped (`superseded_by_resolved`)
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
    "compiledProofs": [ ... ]
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
  "allow": ["create_file"]
}
```

Three buckets:

- **`resolved`** — values from tool results. Every non-empty control arg value must be a resolvable handle. Bare literals are rejected — handles are the only proof a value came from a tool.
- **`known`** — values the user explicitly provided. Attested as `known`. Optional `source` field for audit logging (never compiled into policy).
- **`allow`** — tools needing no argument constraints. Validated against `controlArgs` metadata.

The entire bucketed intent must come from uninfluenced sources. The clean planner produces the intent. Influenced workers produce data for reasoning, not authorization. This is a hard invariant — the builder rejects intent from influenced sources.

**Where user-typed payload values go.** User-provided literal values — update fields like `new_start_time: "14:00"`, payload values like `subject: "Q4 Review"` — belong in `known`, keyed by the tool they satisfy. If the user's task is "reschedule my 2pm meeting to 3pm," then `event_id: h_abc` (from a prior resolve phase) goes in `resolved.reschedule_calendar_event.event_id` and `new_start_time: "15:00"` (from the user's task text) goes in `known.reschedule_calendar_event.new_start_time`. The runtime validates both buckets against the tool's `controlArgs` / `updateArgs` / `exactPayloadArgs` metadata.

If a planner produces a request with separate `authorizations` and `literal_inputs` (or equivalent) fields, merge `literal_inputs` into the `known` bucket before calling `@policy.build`. Without this merge, the builder sees control args (via `resolved`) but no payload values, and the `updateArgs` check fails with `no_update_fields`. The fix is not to read tool metadata in orchestration code and synthesize a richer intent — it's to put the user's literal values in the right bucket. `known` is the primitive for uninfluenced user-provided payloads; use it.

The builder also accepts flat and nested intent shapes for backward compatibility:

```json
{ "send_email": { "recipients": "h_2l5r36" }, "create_file": true }
```

For array control args, proof is checked per element. Proofless elements are dropped individually. If the same tool+arg appears in both `resolved` and `known`, `resolved` wins and an issue is emitted.

### Planner retry via guard

Use `@policy.validate` in a guard to retry the planner when its auth has issues:

```mlld
exe @plan(task) = @claude(@task, { tools: @allTools }) with { display: "planner" }

guard after @validateAuth for op:named:plan = when [
  @policy.validate(@output, @writeTools).valid == false && @mx.guard.try < 2
    => retry "Fix authorization: @policy.validate(@output, @writeTools).issues. Report: @policy.validate(@output, @writeTools).report"
  * => allow
]
```

The planner prompt is: "Put handle values from tool results in `resolved`. Put values the user explicitly provided in `known`. Put tools that need no arguments in `allow`."

## Direct planner use

`with { policy }` still works for hand-built auth. The same proof rules apply — proofless control args are hard-rejected at compilation:

```mlld
var @plannerOutput = @planner(@task) | @parse
var @result = @agent(@prompt) with { policy: @plannerOutput }
```

The planner's output should contain only `authorizations` — not `defaults`, `rules`, `locked`, `labels`, `operations`, or other policy sections. Those are developer-controlled.

## Validation

`mlld validate --context tools.mld` checks authorizations fragments:

- Every `authorizations.allow` key must resolve to a known exe in context
- Every constrained arg name must exist on that exe's parameter list
- A declared control arg omitted from the `args` constraint is an error
- A tool with declared control args authorized as `true` is an error
- If trusted `controlArgs` are missing for a `tool:w` exe, every declared parameter is treated as a control arg
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
