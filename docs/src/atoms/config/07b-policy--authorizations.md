---
id: policy-authorizations
qa_tier: 2
title: Policy Authorizations
brief: Declarative per-tool authorization with argument constraints for task-scoped enforcement
category: config
parent: policy
tags: [policy, authorizations, allow, guards, security, planner, agent]
related: [security-policies, policy-label-flow, guards-privileged, policy-composition, labels-source-auto]
related-code: [core/policy/authorizations.ts, interpreter/eval/exec/policy-fragment.ts, interpreter/eval/var/tool-scope.ts, interpreter/hooks/guard-pre-hook.ts]
updated: 2026-03-24
---

The `authorizations` section in policy declares which `tool:w` operations are authorized for a task, with per-argument constraints on control args. In the current phase it applies only to `tool:w`. The runtime compiles these into internal privileged guards that enforce a default-deny envelope.

```mlld
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
          recipients: ["mark@example.com"]
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

**Literal value** — uses tolerant comparison (`~=`):

```mlld
var @taskPolicy = {
  authorizations: {
    allow: {
      send_email: {
        args: {
          recipients: ["mark@example.com"]
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
    recipients: { eq: ["mark@example.com"] }
  }
}
```

**One-of** — arg must match any candidate:

```mlld
send_email: {
  args: {
    recipients: { oneOf: [["mark@example.com"], ["sarah@example.com"]] }
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

**Example:** `send_email` declares `recipients`, `cc`, `bcc` as control args. `subject`, `body`, `attachments` are data args.

```json
{
  "authorizations": {
    "allow": {
      "send_email": {
        "args": {
          "recipients": ["mark@example.com"]
        }
      }
    }
  }
}
```

This authorizes `send_email` with `recipients` pinned to `mark@example.com`. Because `cc` and `bcc` are declared control args but omitted from the constraint, they are enforced as empty/null at runtime. The planner doesn't need to mention `subject` or `body` — those are data args.

If the planner had written `"send_email": true`, validation would reject it because `send_email` has declared control args.

## Enforcement

`authorizations` compiles to internal privileged guards. These are the same guards that `defaults.rules` and `labels` produce — they participate in the standard guard override mechanism:

- Matching `allow` can override managed label-flow denials from `defaults.rules` and `labels` only after inherited positive checks still pass. For example, `no-send-to-unknown` still requires the named destination args to carry `known`, and `no-untrusted-privileged` still blocks untrusted privileged calls.
- `locked: true` disables all overrides — authorization entries are still checked, but a matching entry cannot punch through locked denials
- Capability denials (`capabilities.allow/deny/danger`), `env` restrictions, `auth`, and `limits` are separate enforcement paths and are not affected by `authorizations`

Authorization matching is not enough by itself for positive checks. If the planner pins `"acct-1"` as a raw literal, the worker still needs a matching attestation for rules like `no-send-to-unknown`. If the planner pins `@approvedRecipient` and that value carried `known`, the authorization guard carries that attestation requirement forward so the later worker call can satisfy the inherited check.

Authorization denials behave like any other guard denial — they can be caught with `denied =>` handlers and are surfaced through the SDK's existing denial reporting.

## Planner Use

The primary use case is planner-authorized agent execution. A planning LLM produces a JSON authorization fragment. The step script parses it and injects it via `with { policy }`:

```mlld
var @plannerOutput = @planner(@task) | @parse
var @result = @agent(@prompt) with { policy: @plannerOutput }
```

The planner's output should contain only `authorizations` — not `defaults`, `rules`, `locked`, `labels`, `operations`, or other policy sections. Those are developer-controlled. The runtime treats `with { policy }` as a generic policy merge path, so the host is responsible for restricting planner output before injection.

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
