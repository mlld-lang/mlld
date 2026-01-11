---
id: escaping-at
title: Escaping @ Symbol
brief: Output literal @ without variable interpolation
category: syntax
parent: escaping
tags: [escaping, templates, special-characters]
related: [templates-basics, escaping-defaults]
related-code: []
updated: 2026-01-11
---

**Problem:** Need to output a literal `@` without variable interpolation.

**Solutions:**

```mlld
>> 1. Use a helper function
exe @at(name) = js { return "@" + name }
var @mention = @at("username")    >> "@username"

>> 2. Use escape sequence in templates
var @email = `user\@example.com`  >> "user@example.com"

>> 3. String concatenation
var @at = "@"
var @handle = `@at``username`     >> "@username"
```

**Common use cases:**
- Email addresses in output
- Social media @mentions
- Literal @ in generated code
