---
id: labels-influenced
title: Influenced Label
brief: Track LLM outputs affected by untrusted data
category: security
parent: security
tags: [labels, influenced, llm, untrusted]
related: [labels-overview, labels-source-auto, pattern-audit-guard, pattern-dual-audit]
related-code: [core/policy/builtin-rules.ts]
updated: 2026-02-01
---

Mark LLM outputs as `influenced` when they process untrusted data.

```mlld
var @policyConfig = {
  defaults: {
    rules: ["untrusted-llms-get-influenced"]
  }
}
policy @p = union(@policyConfig)

var untrusted @task = "Review this external input"
exe llm @process(input) = run cmd { claude -p "@input" }

var @result = @process(@task)
show @result.mx.labels  >> ["llm", "untrusted", "influenced"]
```

The rule only auto-applies the label. Enforcement comes from `policy.labels.influenced`.

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
- Input contains `untrusted` label

**Notes:**
- Label propagates through interpolation
- Trusted inputs don't trigger the label
- Defense in depth against prompt injection
- See `labels-overview` for label system basics
