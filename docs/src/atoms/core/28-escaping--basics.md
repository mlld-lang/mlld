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
qa_tier: 1
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
>> Triple-colon disables all @ interpolation — treats @ as literal text
var @xml = :::<USER id="@id">@name</USER>:::

>> Useful for XML/HTML with @ attributes
var @elem = :::<input type="email" placeholder="user@example.com">:::
```

**When to use each:**

- **Backticks** `` `...` `` - Default template, simple interpolation
- **Double-colon** `::...::` - When content has backticks
- **Triple-colon** `:::...:::` - When content triggers file detection (has @ with dots/slashes)

## See Also

- [Escaping @ Symbols](./escaping-at.md) - `\@` and `@@` patterns for literal at-sign output.
- [Escaping Defaults](./escaping-defaults.md) - Default interpolation/escape behavior.
- [Templates Basics](./templates-basics.md) - Template forms and interpolation rules.
