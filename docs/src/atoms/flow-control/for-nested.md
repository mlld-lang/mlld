---
id: for-nested
title: Nested For Loops
brief: For loops inside for loops
category: control-flow
parent: for
tags: [iteration, loops]
related: [for-arrow]
related-code: [interpreter/eval/for.ts]
updated: 2026-01-05
qa_tier: 2
---

**Nested for:**

```mlld
for @x in ["A","B"] => for @y in [1,2] => show `@x-@y`
>> Output: A-1, A-2, B-1, B-2
```
