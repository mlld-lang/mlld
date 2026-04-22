---
id: guard-resume
title: Guard Resume
brief: Continue an LLM conversation to repair output without re-firing tools
category: effects
parent: guards
aliases: [resume, guard-resume]
tags: [guards, resume, llm, tools]
related: [security-guards-basics, security-guard-composition, checkpoint-resume]
related-code: [interpreter/eval/exec-invocation.ts, interpreter/hooks/guard-runtime-evaluator.ts]
updated: 2026-04-22
---

`resume` continues an existing LLM conversation with a correction message. Unlike `retry`, no tools re-fire and the LLM sees its prior tool calls and results.

```mlld
guard after op:named:myWorker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => resume "Return valid JSON. Errors: @output.mx.schema.errors"
  @output.mx.schema.valid == false => deny "Still invalid after resume"
  * => allow
]
```

By default, a resumed call runs with `tools = []` and no auto-provisioned `@shelve`. This makes resume safe for exes that called write tools — the LLM can fix its text output but cannot issue new tool calls against dead handles from the prior turn.

## Resume with tools

When the resumed call needs access to specific tools (e.g., a terminal-only tool like `compose` or `blocked` that doesn't re-fire writes), pass them via a with-clause:

```mlld
var @composeTools = ["compose", "blocked"]

guard after op:named:planner = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => resume "Fix the output structure" with { tools: @composeTools }
  * => allow
]
```

The bridge mints fresh handles for the provided tools. Handles from the prior turn are dead — the LLM gets a new mint table scoped to the explicit tool set. Auto-provisioned `@shelve` remains disabled; the caller's tool list is the complete set.

## When to use each action

| Situation | Action |
|---|---|
| Read-only exe with malformed output | `retry` is fine |
| Write-tool exe with malformed final text | `resume` (no tools) |
| Write-tool exe needs terminal tools on the repair pass | `resume` with tools |
| Write-tool exe needs to re-attempt the writes themselves | Not a guard concern — restart the orchestration step |

## Inspecting resume state

Read `@mx.llm.resume` from a guard or post-call code. Returns `null` outside a resumed call, or a structured object (`{ sessionId, provider, continuationOf, attempt }`) during a resume continuation.

```mlld
guard after op:named:worker = when [
  @mx.llm.resume != null && @mx.guard.try >= 2 => deny "Gave up after resume"
  * => allow
]
```
