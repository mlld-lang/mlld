---
id: escaping-at
title: Escaping @ Symbol
brief: Output literal @ without variable interpolation
category: syntax
parent: escaping
tags: [escaping, templates, special-characters]
related: [templates-basics, templates-external, escaping-defaults]
related-code: []
updated: 2026-01-31
qa_tier: 1
---

**Problem:** Need to output a literal `@` without variable interpolation.

**Solutions:**

```mlld
>> 1. Use \@ escape sequence (recommended)
var @email = `user\@example.com`  >> "user@example.com"

>> 2. Use @@ in template interpolation contexts
var @email = `user@@example.com`  >> "user@example.com"

>> 3. String concatenation via variables
var @at = "@"
var @name = "username"
var @handle = `@at@name`          >> "@username"
```

Use `\@` as the default approach. `@@` works only in template interpolation contexts (`\`...\``, `::...::`, and `.att` files).

**In .att template files:**

```att
>> prompts/email.att
Contact: user@@example.com
Follow @@username on Twitter
```

**Common use cases:**
- Email addresses in output
- Social media @mentions
- mlld code examples in prompts
- Literal @ in generated code
