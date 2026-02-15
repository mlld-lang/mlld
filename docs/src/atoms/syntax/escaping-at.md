---
id: escaping-at
title: Escaping @ Symbol
brief: Output literal @ without variable interpolation
category: syntax
parent: escaping
tags: [escaping, templates, special-characters]
related: [templates-basics, templates-external, escaping-defaults]
related-code: []
updated: 2026-02-15
qa_tier: 1
---

**Problem:** Need to output a literal `@` without variable interpolation.

**Solutions:**

```mlld
>> 1. Use \@ escape sequence (recommended)
var @email = `user\@example.com`  >> "user@example.com"

>> 2. Use @@ escape sequence
var @email = `user@@example.com`  >> "user@example.com"

>> 3. String concatenation via variables
var @at = "@"
var @name = "username"
var @handle = `@at@name`          >> "@username"
```

Both `\@` and `@@` work universally in all string and template contexts:

- Backtick strings: `` `user\@example.com` ``
- Double-quoted strings: `"user@@example.com"`
- Single-quoted strings: `'user\@example.com'`
- Double-colon templates: `::user@@example.com::`
- Triple-colon templates: `:::user\@example.com:::`
- Double-bracket templates: `[[user@@example.com]]`
- `.att` template files

The one exception is `cmd {}` blocks, where `@` escaping is not processed by mlld. Content inside `cmd {}` is passed through to the shell verbatim (only `@var` interpolation is applied). Use shell quoting conventions instead.

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
