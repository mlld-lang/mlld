---
id: labels-influenced
qa_tier: 2
title: Influenced Label
brief: Track LLM outputs affected by untrusted data
category: effects
parent: labels
tags: [labels, influenced, llm, untrusted]
related: [labels-overview, labels-source-auto, pattern-audit-guard, pattern-dual-audit]
related-code: [core/policy/builtin-rules.ts]
updated: 2026-03-15
---

Mark LLM outputs as `influenced` when they process untrusted data.

```mlld
policy @p = {
  defaults: {
    rules: ["untrusted-llms-get-influenced"]
  }
}

var untrusted @task = "Review this external input"
exe llm @process(input) = run cmd { claude -p "@input" }

var @result = @process(@task)
show @result.mx.labels  >> ["llm", "untrusted", "influenced"]
```

The rule only auto-applies the label. Enforcement comes from `policy.labels.influenced`.

The rule is not limited to the first prompt argument. If untrusted data reaches an `llm`-labeled executable through any input surface, the output becomes `influenced`:
- prompt text
- structured `messages`
- `system` prompts
- tool definitions or other config objects

**Restrict influenced outputs:**

```mlld
labels: {
  influenced: {
    deny: ["destructive", "exfil"]
  }
}
```

**Requirements for label application:**
- Policy rule `untrusted-llms-get-influenced` enabled
- Executable labeled `llm`
- Any executable input contains `untrusted`

**Notes:**
- Label propagates through interpolation
- Later config arguments count too; `messages`, `system`, and tool config are part of the LLM's input
- Trusted inputs don't trigger the label
- Defense in depth against prompt injection
- See `labels-overview` for label system basics
