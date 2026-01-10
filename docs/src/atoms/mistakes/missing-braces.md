---
id: mistake-missing-braces
title: Missing Braces
brief: Commands always need braces
category: mistakes
parent: mistakes
tags: [mistakes, commands, syntax]
related: [run-basics]
related-code: []
updated: 2026-01-05
---

Commands always need braces.

```mlld
>> Wrong
run cmd echo "hello"

>> Correct
run cmd {echo "hello"}
```
