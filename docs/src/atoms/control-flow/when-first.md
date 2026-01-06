---
id: when-first
title: When First (Switch-Style)
brief: Stops at first matching condition
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when-simple, when-bare]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

**First form** (stops at first match, like switch):

```mlld
when first [
  @role == "admin" => show "Admin panel"
  @role == "user"  => show "User dashboard"
  * => show "Guest view"           >> wildcard catches all
]
```
