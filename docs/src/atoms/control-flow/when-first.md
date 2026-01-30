---
id: when-first
title: When (First-Match)
brief: Stops at first matching condition
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when-simple, when-bare]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
qa_tier: 2
---

**First-match form** (switch-style):

```mlld
when [
  @role == "admin" => show "Admin panel"
  @role == "user"  => show "User dashboard"
  * => show "Guest view"           >> wildcard catches all
]
```

The `first` modifier is accepted and does not change behavior.
