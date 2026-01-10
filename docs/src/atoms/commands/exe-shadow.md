---
id: exe-shadow
title: Exe Shadow Environments
brief: Expose JS helpers to all code blocks
category: commands
parent: exe
tags: [functions, javascript, environment, reusable]
related: [exe-simple, run-basics]
related-code: [interpreter/eval/exe.ts, interpreter/env/ShadowEnvironment.ts]
updated: 2026-01-05
---

**Shadow environments** (expose JS helpers):

```mlld
exe @double(n) = js { return n * 2 }
exe @cap(s) = js { return s[0].toUpperCase() + s.slice(1) }
exe js = { double, cap }  >> expose to all js blocks

var @out = js { cap("hello") + ": " + double(5) }  >> "Hello: 10"
```
