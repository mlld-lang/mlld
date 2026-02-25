---
id: for-filter
qa_tier: 2
title: For with Inline Filter
brief: Filtering during iteration with when clause
category: flow-control
parent: for
tags: [iteration, loops, filtering]
related: [for-arrow, for-skip]
related-code: [interpreter/eval/for.ts]
updated: 2026-01-05
---

**For with inline filter:**

```mlld
var @valid = for @x in @items when @x != null => @x
var @admins = for @u in @users when @u.role == "admin" => @u.name
```
