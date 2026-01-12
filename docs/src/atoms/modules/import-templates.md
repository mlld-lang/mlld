---
id: modules-import-templates
title: Template Collections
brief: Import directories of template files
category: modules
parent: importing
tags: [modules, imports, templates, collections]
related: [modules-import-types, templates-basics, templates-external]
related-code: [interpreter/eval/import.ts, core/resolvers/TemplateCollectionResolver.ts]
updated: 2026-01-12
---

**Template collections** import an entire directory of `.att` files as a callable namespace:

```mlld
import templates from "@base/agents" as @agents(message, context)

>> Access templates by name (bracket or dot notation)
show @agents["alice"](@msg, @ctx)           >> agents/alice.att
show @agents.support["helper"](@msg, @ctx)  >> agents/support/helper.att
```

**Directory structure example:**

```
agents/
  alice.att          >> @agents["alice"](msg, ctx)
  bob.att            >> @agents["bob"](msg, ctx)
  support/
    helper.att       >> @agents.support["helper"](msg, ctx)
    escalate.att     >> @agents.support["escalate"](msg, ctx)
```

**Key rules:**

- All templates in a collection share the same parameter signature
- Filenames with hyphens become underscores: `json-pretty.att` → `@tpl["json_pretty"]`
- Use dot notation for directories, brackets for template names
- Collections require parameters in the `as @name(params)` clause

**When to use collections:**

- Multiple templates with the same interface (agent prompts, formatters)
- Dynamic template selection based on runtime values
- Organizing related templates by category

For single templates, use `exe @func(params) = template "file.att"` instead.
