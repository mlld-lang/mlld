---
id: security-denied-handlers
title: Denied Handlers
brief: Handle denied operations gracefully
category: effects
parent: guards
tags: [security, guards, denied, error-handling]
related: [security-guards-basics, when]
related-code: [interpreter/eval/guard.ts, interpreter/eval/when.ts]
updated: 2026-03-16
qa_tier: 2
---

The `denied` keyword is a when-condition that tests if we're in a denied context. Use it to handle guard denials gracefully.

- `deny "reason"` — guard action that blocks an operation
- `denied` — when-condition that matches inside a denied handler

```mlld
guard before op:run = when [
  @input.any.mx.labels.includes("secret") => deny "Secrets blocked from shell"
  * => allow
]

exe @safe(value) = when [
  denied => `[blocked] @mx.guard.reason`
  * => @value
]
```

`denied` handlers catch denials from guards, managed policy label-flow denials (`defaults.rules`, `labels` deny/allow), and direct input-record dispatch checks such as `proofless_control_arg`, `allowlist_mismatch`, `blocklist_match`, `no_update_fields`, and `correlate_mismatch`. When one of those paths denies an operation, the exe's `when` block can match `denied` and provide a fallback value. Capability denials (`capabilities.deny`, environment constraints) are hard errors and cannot be caught.

When you run mlld through the SDK or `mlld live --stdio`, guard and managed policy label-flow denials are also surfaced as structured observability data. Streamed executions emit a `guard_denial` event immediately, and structured execute results collect the payload in `result.denials`, whether the denial was handled by `denied =>` or terminated the call. Input-record dispatch denials use the same `denied =>` surface inside mlld, but if they go uncaught the outer `when` wrapper preserves the inner error snapshot on `error.details.originalError`.

**Accessing guard context:**

```mlld
exe @handler(value) = when [
  denied => show "Blocked: @mx.guard.reason"
  denied => show "Guard: @mx.guard.name"
  denied => show "Labels: @mx.labels.join(', ')"
  * => show @value
]
```

Input-record denials populate `@mx.denial` with structured fields:

```mlld
var @result = when [
  denied => `@mx.denial.code:@mx.denial.phase:@mx.denial.tool:@mx.denial.field`
  * => @tools.send_email("mallory@example.com", "Hello")
]
```

Common fields are `code`, `phase`, `direction`, `tool`, `field`, and `hint`.

Named operation inputs are available in denied handlers through `@mx.args`, just like in guard bodies:

```mlld
exe @send(url, payload) = when [
  denied => show "Denied sending to @mx.args.url: @mx.guard.reason"
  * => cmd curl -X POST @url -d @payload
]
```

**Negating denied:**

```mlld
exe @successOnly(value) = when [
  !denied => @value
]
```

If a `when` action throws and no `denied` arm catches it, SDK callers can inspect the wrapped error's inner snapshot:

```ts
try {
  await execute(script);
} catch (error: any) {
  console.log(error.details?.originalError?.class);
  console.log(error.details?.originalError?.code);
}
```
