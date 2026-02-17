---
id: escaping-at
title: Escaping @ Symbol
brief: Output literal @ without variable interpolation
category: syntax
parent: escaping
tags: [escaping, templates, special-characters]
related: [templates-basics, templates-external, escaping-basics]
related-code: []
updated: 2026-02-16
qa_tier: 1
---

Use `\@` or `@@` to output a literal `@`. Works in all string and template contexts.

```mlld
var @email = `user\@example.com`  >> "user@example.com"
var @email = `user@@example.com`  >> "user@example.com"
```

In `.att` template files:

```att
Contact: user@@example.com
Follow @@username on Twitter
```

The exception is `sh {}` / `bash {}` blocks — content is passed to the shell verbatim with no `@` processing.
