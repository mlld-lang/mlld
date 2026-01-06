---
id: mistake-at-for-directives
title: Using @ for Directives
brief: Directives don't use @ prefix
category: mistakes
parent: mistakes
tags: [mistakes, directives, syntax]
related: [run-basics, variables-basics]
related-code: []
updated: 2026-01-05
---

**Directives don't use `@` prefix:**

```mlld
>> Wrong
@run cmd {echo "hello"}
var @result = @run cmd {echo "hello"}

>> Correct
run cmd {echo "hello"}
var @result = cmd {echo "hello"}
```
