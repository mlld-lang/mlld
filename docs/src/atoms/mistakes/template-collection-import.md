---
id: mistake-template-collection-import
title: Template Collection Import
brief: Template collections need parameters and directories
category: mistakes
parent: mistakes
tags: [mistakes, templates, imports, modules]
related: [modules-import-templates, exe-simple]
related-code: []
updated: 2026-01-05
---

**Template collections need parameters and directories:**

```mlld
>> Wrong
import { @tpl } from "./file.att"           >> single file
import templates from "./agents" as @agents  >> missing params

>> Correct
exe @tpl(x) = template "./file.att"          >> single file
import templates from "./agents" as @agents(message, context)
```
