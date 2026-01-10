---
id: mistake-nested-func-in-shell
title: Nested Functions in Shell
brief: Don't call mlld functions inside shell commands
category: mistakes
parent: mistakes
tags: [mistakes, shell, functions]
related: [run-basics, run-stdin]
related-code: []
updated: 2026-01-05
---

Don't call mlld functions inside shell commands.

```mlld
>> Wrong
run cmd {
  RESULT=$(@helper("x"))
  echo $RESULT
}

>> Correct
var @r = @helper("x")
run @r | { cat }
```
