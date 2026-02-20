---
id: for-arrow
title: For Arrow Form
brief: Single-action iteration with =>
category: control-flow
parent: for
tags: [iteration, loops]
related: [for-block, for-collection]
related-code: [interpreter/eval/for.ts, grammar/patterns/for.peggy]
updated: 2026-01-05
qa_tier: 1
---

**Arrow form:**

```mlld
for @item in @items => show `Processing @item`
for @n in [1,2,3] => log @n
```
