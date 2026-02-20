---
id: mistake-return-statement
title: Return Statement
brief: mlld uses => for returns
category: mistakes
parent: mistakes
tags: [mistakes, blocks, return, syntax]
related: [exe-blocks]
related-code: []
updated: 2026-01-05
---

mlld has no `return`. Use `=> value` in executable blocks and scripts.

```mlld
>> Wrong
exe @calc(x) = [
  let @result = @x * 2
  return @result
]

>> Correct
exe @calc(x) = [
  let @result = @x * 2
  => @result
]

>> Script return
=> "final output"
```
