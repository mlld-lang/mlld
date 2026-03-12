---
id: module-patterns
qa_tier: 2
title: Module Patterns
brief: Common module organization patterns
category: modules
tags: [modules, patterns, exports, organization]
related: [modules-exporting, modules-creating]
related-code: [interpreter/eval/export.ts]
updated: 2026-01-05
---

**Module patterns:**

```mlld
>> Library module (wraps a core exe with shortcuts)
import { @claude } from @mlld/claude
exe llm @haiku(prompt) = @claude(@prompt, { model: "haiku" })
exe llm @sonnet(prompt) = @claude(@prompt, { model: "sonnet" })
export { @haiku, @sonnet }

>> Config/agent module
var @meta = { id: @fm.id, name: @fm.name }
var @prompts = { primary: @primaryPrompt, optional: @optionalPrompt }
export { @meta, @prompts }

>> Gate module
exe @gate(response, instruction, message) = [...]
export { @gate }
```
