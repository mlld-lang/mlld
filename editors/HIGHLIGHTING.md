---
updated: 2025-07-29
tags: #editors, #syntax, #highlighting
related-docs: editors/README.md, docs/dev/LANGUAGE-SERVER.md
related-code: grammar/syntax-generator/build-syntax.js
related-types: grammar/ast/types { NodeType }
---

# mlld Syntax Highlighting

## tldr

Syntax highlighting rules for mlld's template/quote types and interpolation patterns. mlld has six distinct contexts for text, each with specific interpolation rules. Backticks, double-colon, and double quotes all interpolate `@var` and `<file.md>`. Only triple-colon uses `{{var}}`. Single quotes are the only literal text context. File references (`<file.md>`) are distinct from XML tags (`<tag>`) except in triple-colon templates where everything is XML.

## Principles

- Context determines interpolation - not all `@var` or `{{var}}` should highlight
- Semantic meaning drives visual distinction - templates vs literals vs commands
- File references (alligator syntax) are visually distinct from XML
- Consistent highlighting across all editors (VSCode, Vim, web)

## Details

### Template/Quote Types and Interpolation Rules

#### 1. Backtick Templates `` `...` ``
- **Interpolates**: `@var`, `<file.md>`
- **Does NOT interpolate**: `{{var}}`
- **Highlighting**:
  - Backticks: Template delimiter color
  - `@var`: Variable reference color (distinct)
  - `<file.md>`, `<*.md>`, `<@var>`: Alligator syntax color (distinct from XML)
  - Regular text: Template text color

#### 2. Double-Colon Templates `::...::`
- **Interpolates**: `@var`, `<file.md>`
- **Does NOT interpolate**: `{{var}}`
- **Purpose**: Escape for when you need backticks in content
- **Highlighting**: Same as backtick templates

#### 3. Triple-Colon Templates `:::...:::`
- **Interpolates**: `{{var}}` (ONLY here!)
- **Does NOT interpolate**: `@var`, `<file.md>` (treated as XML if they match XML pattern)
- **XML highlighted**: `<tag>`, `</tag>`, `<tag_name>` - anything that looks like XML
- **Purpose**: For social media content with many @ symbols
- **Highlighting**:
  - `{{var}}`: Variable reference color (only in triple-colon)
  - `<tag>`, `</tag>`: XML color (brackets + text as one color)
  - `<file.md>`: Also shown as XML (not alligator) in this context
  - `@something`: Plain text (NOT highlighted as variable)

#### 4. Double Quotes `"..."`
- **Always interpolates**: `@var`, `<file.md>`
- **Does NOT interpolate**: `{{var}}`
- **Highlighting**: Same as backtick templates
  - `@var`: Variable reference color
  - `<file.md>`: Alligator syntax color
  - Regular text: String text color

#### 5. Single Quotes `'...'`
- **Never interpolates**: Everything is literal text
- **Highlighting**: Single solid color for quotes and entire content
- **No special highlighting** for `@var`, `{{var}}`, or `<file.md>`

#### 6. Command Contexts
- **`/run {...}`** and **`/run "..."`**: Interpolates `@var`, `<file.md>`
- **`/run '...'`**: NO interpolation - single solid color (literal)
- **`= run {...}`** and **`= /run {...}`**: Same interpolation as `/run`
- **Language-specific** (`/run js {...}`, `/run python {...}`):
  - Use native language highlighting ONLY
  - NO mlld interpolation - code is passed directly to interpreter
  - `@var` and `<file.md>` are treated as part of the language syntax
- **Highlighting**:
  - Plain `run {…}` or `run "..."`: Shell syntax + mlld interpolation
  - `run '...'`: Single color literal text
  - `run js {…}`: Pure JavaScript syntax highlighting (no mlld)
  - `run python {…}`: Pure Python syntax highlighting (no mlld)

### Key Distinctions

#### XML vs Alligator Syntax
- **XML** (only in templates/interpolating contexts):
  - Pattern: `<tag>`, `</tag>`, `<tag_name>` (no special chars)
  - Highlighting: Entire tag (brackets + text) as one XML color
  - Only highlighted inside templates or interpolating quotes

- **Alligator** (file references):
  - Pattern: Contains `.`, `/`, `*`, or `@` (e.g., `<file.md>`, `<*.md>`, `<@var>`)
  - Highlighting: Distinct "alligator syntax" color (different from XML)
  - Same contexts as `@var` interpolation

#### Special Alligator Features
- `<file.md # Section>`: Each part highlighted differently:
  - `<` and `>`: Alligator bracket color
  - `file.md`: Alligator file color
  - `#`: Section marker color
  - `Section`: Section name color

#### Variable Reference Colors
- `@var` in backticks/double-colon/interpolating contexts: Variable color
- `{{var}}` in triple-colon only: Variable color (possibly same or distinct)
- These should NEVER be highlighted outside their valid contexts

## Gotchas

- NEVER highlight `@var` in single quotes (only context where it's literal)
- Double quotes ALWAYS interpolate `@var` and `<file.md>` (not just in commands)
- `{{var}}` ONLY works in triple-colon templates
- In triple-colon templates, `<file.md>` is treated as XML, not alligator syntax
- XML tags without special chars (`<div>`) are plain text outside templates/interpolating contexts
- File references require `.`, `*`, `/`, or `@` to distinguish from XML