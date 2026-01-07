---
id: mistake-slash-in-strict-mode
title: Slash in Strict Mode
brief: Strict mode uses bare directives, not slashes
category: mistakes
parent: mistakes
tags: [mistakes, strict-mode, directives]
related: [variables-basics, when-simple]
related-code: []
updated: 2026-01-05
---

Strict mode (.mld) uses bare directives. Markdown mode (.mld.md) uses slashes.

```mlld
>> Wrong (in .mld file)
/var @x = 1
/show @x

>> Correct (in .mld file)
var @x = 1
show @x
```
