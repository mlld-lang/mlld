---
id: escaping-basics
title: Escaping Overview
brief: Handle special characters and edge cases in templates
category: syntax
parent: escaping
tags: [escaping, templates, special-characters]
related: [escaping-at, escaping-defaults, templates-basics]
related-code: []
updated: 2026-01-11
---

**Special characters:**

| Character | In templates | Solution |
|-----------|--------------|----------|
| `@` | Variable interpolation | `\@` or helper function |
| `` ` `` | Template delimiter | Use `::...::` syntax |
| `::` | Alternate delimiter | Use triple-colon `:::...:::` |
| `{{}}` | Object expression | Use triple-colon escape |

**Escape hatch templates:**

```mlld
>> Triple-colon disables @ detection in file-like patterns
var @xml = :::<USER id="@id">@name</USER>:::

>> Useful for XML/HTML with @ attributes
var @elem = :::<input type="email" placeholder="user@example.com">:::
```

**When to use each:**

- **Backticks** `` `...` `` - Default template, simple interpolation
- **Double-colon** `::...::` - When content has backticks
- **Triple-colon** `:::...:::` - When content triggers file detection (has @ with dots/slashes)
