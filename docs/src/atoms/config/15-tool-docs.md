---
id: tool-docs
title: Tool Docs
brief: Generate explicit planner and worker tool documentation from mlld tool metadata
category: config
tags: [tools, planner, worker, agents, docs, prompts]
related: [pattern-planner, policy-authorizations, facts-and-handles]
related-code: [interpreter/fyi/tool-docs.ts, interpreter/eval/exec/tool-metadata.ts, interpreter/env/builtins/fyi.ts]
updated: 2026-04-02
---

`@toolDocs()` renders tool metadata into prompt-ready text or JSON. It is the explicit, non-MCP path for planner or worker prompt assembly.

Use it when you want to show the model exactly which tools are available, which args are control args, and how authorization intent should be shaped.

## Explicit planner docs

For planner prompts, use `audience: "planner"` with the tool collection the planner is allowed to reason about:

```mlld
/exe tool:w @sendEmail(recipient, subject, body) = run cmd {
  email-cli send --to @recipient --subject @subject --body @body
} with { controlArgs: ["recipient"] }

/var tools @writeTools = {
  send_email: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"],
    optional: ["body"],
    description: "Send an outbound email"
  }
}

/var @plannerToolDocs = @toolDocs(@writeTools, { audience: "planner" })
```

Planner-mode text includes:

- tool descriptions
- visible args
- control args
- payload args
- required vs optional args
- the `resolved` / `known` / `allow` authorization bucket reference

That makes it suitable for direct system-prompt assembly in planner-only contexts, even when there is no MCP bridge.

## No-argument form

If the current scope already has tools, `@toolDocs()` can infer them:

```mlld
/exe tool:w @sendEmail(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
}

/var @toolList = [@sendEmail]

/exe llm @planner(prompt, config) = @toolDocs({ audience: "planner" }) with {
  display: "planner"
}

/var @docs = @planner("List tools", { tools: @toolList })
```

The no-arg form reads scoped tool collections, scoped executable arrays, or active LLM tool metadata.

## Explicit vs injected docs

`@toolDocs()` is richer than the compact `<tool_notes>` block injected for MCP-backed calls:

- Use explicit `@toolDocs()` when you are building your own planner or worker prompt.
- Use injected tool notes when the runtime is bridging tools into an LLM call automatically.

Injected notes stay compact on purpose. Explicit docs can be fuller because they are authored directly into your prompt.
