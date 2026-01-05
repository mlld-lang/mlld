---
updated: 2026-01-04
tags: #editors, #syntax, #highlighting
related-docs: editors/README.md, docs/dev/LANGUAGE-SERVER.md
related-code: grammar/syntax-generator/build-syntax.js
---

# mlld Syntax Highlighting Spec

Canonical highlighting rules for mlld. Used by both LSP semantic tokens and regex-based highlighters.

## Template Types and Interpolation

| Template | Syntax | Interpolates |
|----------|--------|--------------|
| Backtick | `` `Hello @name` `` | `@var`, `<file.md>` |
| Double-colon | `::Hello @name::` | `@var`, `<file.md>` |
| Triple-colon | `:::Hello {{name}}:::` | `{{var}}` only |
| Double quotes | `"Hello @name"` | `@var`, `<file.md>` |
| Single quotes | `'Hello @name'` | Nothing (literal) |

## Key Rules

1. **`@var` only interpolates in backticks, `::`, double quotes, and command contexts**
2. **`{{var}}` only works in triple-colon `:::`**
3. **Single quotes never interpolate** - everything is literal
4. **`<file.md>` (alligator)** vs **`<tag>` (XML)**: Alligator contains `.`, `/`, `*`, or `@`

## Token Types

| Element | LSP Token | Regex Class |
|---------|-----------|-------------|
| `var`, `show`, `exe`, etc. | `keyword` | `directive` |
| `@variable` | `variable` | `variable` |
| `@var.field` | `variable` + `property` | `variable` + `field-access` |
| `let`, `done`, `continue` | `keyword` | `block-keyword` |
| `=>` | `operator` | `arrow-operator` |
| `\|`, `\|\|` | `operator` | `pipe-operator` |
| `<file.md>` | `string` | `alligator` |
| `>> comment` | `comment` | `comment` |
| `"string"` | `string` | `string-interpolated` |
| `'literal'` | `string` | `string-literal` |
| `cmd { }` | `keyword` + `string` | `operator` + content |

## Command Contexts

```mlld
exe @build() = cmd { npm run build }    << shell, @var interpolates
exe @calc() = js { return 1 + 2 }       << pure JS, no @var
exe @run() = python { print("hi") }     << pure Python, no @var
```

Language-specific blocks (`js`, `python`, `sh`) use native language highlighting only.

## XML vs Alligator

**Alligator** (file references): Contains `.`, `/`, `*`, or `@`
```
<file.md>     << alligator
<src/*.ts>    << alligator
<@var>        << alligator
```

**XML**: Simple tag syntax (no special chars)
```
<user>        << XML (only in triple-colon templates)
</response>   << XML
```

**Section syntax**: `<file.md # Section>` highlights each part distinctly.

## Gotchas

- NEVER highlight `@var` in single quotes
- Double quotes ALWAYS interpolate (not just in commands)
- `{{var}}` ONLY works in triple-colon `:::`
- In triple-colon, `<file.md>` becomes XML, not alligator