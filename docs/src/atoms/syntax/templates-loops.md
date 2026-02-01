---
id: templates-loops
title: Loops in Templates
brief: For loops inside template bodies
category: syntax
parent: templates
tags: [templates, loops, for]
related: [for-block, templates-basics]
related-code: [interpreter/eval/template.ts, interpreter/eval/for.ts]
updated: 2026-02-01
qa_tier: 2
---

**Template-embedded vs top-level:** Control flow inside templates uses `/for` and `/end` with slash prefix. Top-level directives are separate statements.

```mlld
>> TOP-LEVEL: for as a directive (produces output directly)
for @item in @items => show `- @item.name`

>> TEMPLATE-EMBEDDED: /for inside template body
var @items = ["alpha", "beta", "gamma"]
var @toc = ::
/for @item in @items
- @item
/end
::
show @toc
```

**Key/value form in templates:**

```mlld
/for @k, @v in @items
- @k: @v
/end
```

**Key differences:**

| Context | Syntax | Notes |
|---------|--------|-------|
| Top-level | `for @x in @y => action` | Directive on own line |
| In template | `/for @x in @y` ... `/end` | Slash prefix required at line start |

**Template-embedded rules:**
- `/for` and `/end` must start at column 1 of their line inside the template
- No `=>` arrow - the lines between `/for` and `/end` are the body
- Only `/for` and `/end` are valid inside templates - no other directives
