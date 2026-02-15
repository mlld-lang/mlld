---
id: templates-external
title: External Template Files (.att)
brief: Use exe with template keyword for .att files
category: syntax
parent: templates
tags: [templates, files, att, interpolation]
related: [exe-simple, modules-import-templates, mistake-att-angle-bracket, escaping-at]
related-code: [interpreter/eval/exe.ts, grammar/patterns/exe.peggy]
updated: 2026-01-31
qa_tier: 2
---

For templates longer than a simple paragraph, use `.att` files with the `exe ... = template` pattern:

```mlld
exe @welcome(name, role) = template "./prompts/welcome.att"
exe @systemPrompt(context) = template "./prompts/system.att"

>> Call like any other function
show @welcome("Alice", "admin")
```

The `.att` file uses `@var` for interpolation and supports full mlld syntax inside:

```att
>> prompts/welcome.att
Hello @name!

Your role: @role

/for @perm in @role.permissions
- @perm
/end
```

**Key points:**

- Parameters from `exe @func(params)` are automatically available as `@param` in the template
- `.att` supports `<file.md>` references and `/for ... /end` template loops
- In template content, use condensed pipe syntax (`@value|@pipe`) to avoid ambiguity
- Relative `<file>` paths inside a template file resolve from that template file's directory
- Use `@@` or `\@` to output a literal `@` symbol (e.g., `user@@example.com`)
- Never load `.att` files with angle brackets - use `exe ... = template` instead

**When to use external templates:**

- Prompts longer than 2-3 lines
- Templates with complex structure or loops
- Reusable prompt components
- Agent system prompts

**Alternative syntax - .mtt files:**

If `.att` syntax conflicts with your content, use `.mtt` files instead. Common case: prompts that include `@path/to/file` references for LLMs to interpret:

```mlld
exe @codeReview(files, instructions) = template "./prompts/review.mtt"
```

```mtt
>> prompts/review.mtt - uses {{var}} syntax
Review these files: {{files}}

{{instructions}}

Reference @src/utils.ts and @tests/utils.test.ts for context.
```

The `@src/utils.ts` stays literal - mlld won't try to interpolate it.

| Extension | Variable syntax | File refs | Use when |
|-----------|----------------|-----------|----------|
| `.att` | `@var` | `<file.md>` | Default, mlld-style |
| `.mtt` | `{{var}}` | None | Content has `@path` or `<tag>` meant for LLMs |

| Feature | `.att` | `.mtt` |
|---------|--------|--------|
| Pipes in template body | Condensed only (`@var|@pipe`) | Not supported |
| Loops | `/for ... /end` | Not supported |
