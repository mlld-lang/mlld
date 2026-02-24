---
id: for-collection
title: For Collection Form
brief: Collecting results from iteration
category: control-flow
parent: for
tags: [iteration, loops, arrays]
related: [for-arrow, for-block]
related-code: [interpreter/eval/for.ts]
updated: 2026-01-05
---

**Collection form** (returns results):

```mlld
var @doubled = for @x in [1,2,3] => @x * 2     >> [2, 4, 6]
var @names = for @user in @users => @user.name
```
