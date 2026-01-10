---
id: templates-loops
title: Loops in Templates
brief: For loops inside template bodies
category: syntax
parent: templates
tags: [templates, loops, for]
related: [for-block, templates-basics]
related-code: [interpreter/eval/template.ts, interpreter/eval/for.ts]
updated: 2026-01-05
---

**Loops in templates:**

```mlld
var @toc = `
for @item in @items
- @item.name
end
`
```

Note: `for` and `end` must be at line start inside template body.
