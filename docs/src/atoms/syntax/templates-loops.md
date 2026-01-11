---
id: templates-loops
title: Loops in Templates
brief: For loops inside template bodies
category: syntax
parent: templates
tags: [templates, loops, for]
related: [for-block, templates-basics]
related-code: [interpreter/eval/template.ts, interpreter/eval/for.ts]
updated: 2026-01-11
qa_tier: 2
---

**Template-embedded vs top-level:** Control flow inside templates uses bare `for`/`end` at line start. Top-level directives are separate statements.

```mlld
>> TOP-LEVEL: for as a directive (produces output directly)
for @item in @items => show `- @item.name`

>> TEMPLATE-EMBEDDED: for inside template body
var @toc = `
for @item in @items
- @item.name
end
`
```

**Key differences:**

| Context | Syntax | Notes |
|---------|--------|-------|
| Top-level | `for @x in @y => action` | Directive on own line |
| In template | `for @x in @y` ... `end` | Must be at line start in template |

**Template-embedded rules:**
- `for` and `end` must start at column 1 of their line inside the template
- No `=>` arrow - the lines between `for` and `end` are the body
- Works with `when` too:

```mlld
var @report = `
when @items.length > 0
## Items Found
for @item in @items
- @item.name
end
end
`
```
