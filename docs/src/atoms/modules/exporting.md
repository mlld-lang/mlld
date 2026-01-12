---
id: modules-exporting
title: Exporting from Modules
brief: Explicit exports required
category: modules
parent: modules
tags: [modules, exports, patterns]
related: [modules-creating, modules-importing-registry]
related-code: [interpreter/eval/export.ts, grammar/patterns/export.peggy]
updated: 2026-01-05
qa_tier: 2
---

```mlld
>> Export specific items
export { @upper, @trim, @format }

>> Common pattern: export config object
var @meta = { id: @fm.id, name: @fm.name }
exe @process(data) = [...]

export { @meta, @process }
```
