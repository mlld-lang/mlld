---
id: pattern-agent-definition
title: Agent Definition Pattern
brief: Define agent configuration modules
category: patterns
parent: patterns
tags: [patterns, agents, configuration, modules]
related: [modules-creating, modules-exporting, exe-simple]
related-code: []
updated: 2026-01-05
---

**Define agent configuration modules:**

```mlld
---
id: my-agent
name: My Agent
---

var @meta = {
  id: @fm.id,
  name: @fm.name,
  workDir: "/path/to/work"
}

exe @systemPrompt(context) = template "./prompts/system.att"
exe @primaryPrompt(msg, ctx) = template "./prompts/primary.att"

var @prompts = {
  primary: @primaryPrompt
}

export { @meta, @prompts, @systemPrompt }
```
