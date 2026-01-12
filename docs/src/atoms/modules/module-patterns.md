---
id: modules-patterns
title: Module Patterns
brief: Common module organization patterns
category: modules
parent: modules
tags: [modules, patterns, exports, organization]
related: [modules-exporting, modules-creating]
related-code: [interpreter/eval/export.ts]
updated: 2026-01-05
---

**Module patterns:**

```mlld
>> Library module
exe @haiku(prompt) = @prompt | cmd { claude -p --model haiku }
exe @sonnet(prompt) = @prompt | cmd { claude -p --model sonnet }
export { @haiku, @sonnet }

>> Config/agent module
var @meta = { id: @fm.id, name: @fm.name }
var @prompts = { primary: @primaryPrompt, optional: @optionalPrompt }
export { @meta, @prompts }

>> Gate module
exe @gate(response, instruction, message) = [...]
export { @gate }
```
