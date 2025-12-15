---
updated: 2025-12-15
tags: #arch, #alligator, #content
related-docs: docs/dev/DATA.md, docs/dev/PIPELINE.md
related-code: interpreter/eval/content-loader.ts, interpreter/utils/load-content-structured.ts
related-types: core/types { StructuredValue }
---

# Alligator Syntax (Angle Bracket Content Loading)

## tldr

`<file>` loads content. Everything is StructuredValue with `.text` (display), `.data` (parsed), `.ctx` (metadata). Auto-unwraps to content in mlld contexts. Use `.keep` when passing to JS/Node.

## Detection Rules

In templates/strings, `<...>` is treated as a file reference only when it contains: `.`, `/`, `*`, or `@`.

This allows XML-like tags such as `<thinking>` to remain literal text. Angle brackets always mean "load contents", not "filename string". Use quotes for literal paths.

## StructuredValue Contract

All alligator loads return StructuredValue wrappers:

- `.text`: Display string (auto-unwrapped in mlld contexts)
- `.data`: Parsed content (string for text, object/array for JSON/JSONL)
- `.ctx`: Metadata (filename, relative, absolute, url, fm, tokens, tokest, etc.)
- `.keep`: Preserves wrapper when passing to JS/Node

## Basic Syntax

```mlld
/var @readme = <README.md>
/show @readme                    # Content
/show @readme.ctx.filename       # "README.md"

/var @docs = <docs/*.md>
/show @docs                      # Concatenated with \n\n
/show @docs.ctx.fileCount        # 15

/var @intro = <README.md # introduction>

/var @modules = <*.mld.md # tldr> as "### [@mlld/<>.fm.name](<>.relative)"
```

## JSON/JSONL Auto-Parse

JSON and JSONL files auto-parse. `.data` holds parsed, `.text` holds raw:

```mlld
/var @pkg = <package.json>
/show @pkg.data.name            # "mlld"
/show @pkg.text                 # Raw JSON string
/show @pkg                      # Raw JSON (uses .text)

/var @logs = <events.jsonl>
/show @logs.data[0].message     # First event message
/show @logs.text                # Raw JSONL
```

JSONL parses non-empty lines individually. Parse errors include line number and offending line preview.

## Glob Patterns

Glob patterns return StructuredValue with `type='array'`:

```mlld
/var @docs = <docs/*.md>
/show @docs                     # Concatenated with \n\n
/show @docs.ctx.fileCount       # Number of files
```

Each element retains metadata so downstream pipelines preserve provenance.

## AST Extraction

Extract top-level definitions from code files:

```mlld
/var @defs = <service.ts { createUser, (helper) }>
```

The clause inside `{}` selects top-level definitions or definitions that use a name. Parentheses mark usage patterns. Supports JavaScript, TypeScript, Python, Go, Rust, Ruby, Java, C#, Solidity, and C/C++. Results include file paths only when using glob patterns. Unmatched patterns yield `null` entries.

## Metadata Access in mlld

Metadata is accessible in mlld contexts via `.ctx`:

```mlld
/var @readme = <README.md>
/show @readme.ctx.filename       # "README.md"
/show @readme.ctx.relative       # "README.md"
/show @readme.ctx.tokens         # 1523
/show @readme.ctx.tokest         # ~1500

/var @doc = <doc.md>
/show @doc.ctx.fm.title          # Frontmatter title
/show @doc.ctx.fm.author         # Frontmatter author

/var @url = <https://example.com>
/show @url.ctx.url               # "https://example.com"
/show @url.ctx.domain            # "example.com"
/show @url.ctx.title             # Page title
```

Token estimates come from shared helper (`core/utils/token-metrics.ts`). Same heuristics apply whether string originates from `<file>` loads, `/var` assignments, or downstream evaluations. Every variable exposes metrics via `.ctx`.

## Passing to JS/Node

StructuredValue auto-unwraps to `.data` when passed to JS/Node. Use `.keep` to preserve wrapper and metadata:

```mlld
/var @config = <config.json>

# Auto-unwraps to .data
/exe @parseConfig(@config) = js {
  return JSON.stringify({
    type: typeof config,           # "object"
    name: config.name              # Direct property access
  });
}

# Use .keep to preserve metadata
/exe @processFile(@config.keep) = js {
  return JSON.stringify({
    filename: config.ctx.filename,
    tokens: config.ctx.tokens,
    name: config.data.name
  });
}
```

Apply `.keep` at call site, not at variable creation. Single variable works everywhere.

## Auto-Unwrapping Behavior

StructuredValue auto-unwraps to `.text` in these contexts:

1. **Template interpolation**:
   ```mlld
   /var @doc = <README.md>
   /var @msg = `Content: @doc`     # Uses .text
   ```

2. **Display with /show**:
   ```mlld
   /show @file                     # Shows .text, not "[object Object]"
   ```

3. **Pipeline input**:
   ```mlld
   /var @file = <doc.md>
   /show @file | grep "pattern"    # .text passed to pipeline
   ```

Auto-unwraps to `.data` when passed to JS/Node (unless `.keep` is used).

## Common Patterns

### Documentation Assembly

```mlld
/var @modules = <modules/*.md # description> as "### <>.fm.name\n<>.content"
/var @readme = `
# Project Modules

@modules

Generated by mlld
`
/output @readme to "README.md"
```

### Metadata Processing

```mlld
/var @file = <config.json>
/exe @validate(@file.keep) = js {
  return `${file.ctx.filename} has ${file.ctx.tokens} tokens`;
}
```

### Section Collection

```mlld
/var @usage = <docs/*.md # usage>
/show `
# Usage Guide

@usage
`
```

## Gotchas

- **Array behavior**: In templates, arrays concatenate with `\n\n`. In JS, arrays unwrap to array of `.data` values.
- **JSON.stringify**: Stringifying a StructuredValue in JS (when passed with `.keep`) yields full object structure.
- **Field access**: `@file.ctx.filename` accesses metadata. `@file` in templates uses `.text`.
- **Type checking**: In JS, unwrapped content type depends on `.data` (string for text, object for JSON, array for JSONL).
