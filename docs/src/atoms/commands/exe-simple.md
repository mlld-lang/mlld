---
id: exe-simple
title: Exe Simple Forms
brief: Define reusable commands, code, and templates
category: commands
parent: exe
tags: [functions, reusable, templates, commands]
related: [exe-blocks, exe-prose, run-basics, variables-basics]
related-code: [interpreter/eval/exe.ts, grammar/patterns/exe.peggy]
updated: 2026-01-05
---

**exe vs var:** `exe` defines functions (takes parameters). `var` creates values (no parameters). Use `exe` when you need to pass arguments; use `var` for computed values.

**Simple forms:**

```mlld
>> Command
exe @list(dir) = cmd {ls -la @dir | head -5}

>> JavaScript
exe @add(a, b) = js { return a + b }

>> Template
exe @greet(name) = `Hello @name!`

>> External template file
exe @welcome(name, role) = template "./prompts/welcome.att"

>> Prose (requires config)
exe @analyze(data) = prose:@config { session "Analyze @data" }
```
