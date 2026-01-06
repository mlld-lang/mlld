---
id: mistake-interpolation-in-text
title: Interpolation in Text
brief: Plain text requires show or templates in strict mode
category: mistakes
parent: mistakes
tags: [mistakes, strict-mode, templates]
related: [log, templates-basics]
related-code: []
updated: 2026-01-05
---

**In strict mode, plain text is an error. Use `show` or templates:**

```mlld
>> Wrong (strict mode)
Hello @name!

>> Correct
show `Hello @name!`
```
