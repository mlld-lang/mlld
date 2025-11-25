---
updated: 2025-11-13
tags: #arch, #alligator, #content
related-docs: docs/dev/DATA.md, docs/dev/PIPELINE.md
related-code: interpreter/eval/content-loader.ts, interpreter/utils/load-content-structured.ts
related-types: core/types { LoadContentResult, StructuredValue }
---

# Alligator Syntax and Load-Content Output Behavior

## Overview

The alligator syntax (`<file>` or `<pattern>`) in mlld provides powerful content loading capabilities with automatic content extraction. 

**Conceptually**: Think of `<file>` as returning content directly - that's its primary purpose. The metadata (filename, frontmatter, etc.) is available when you need it, but content is the default.

**Implementation detail**: Under the hood, mlld stores the result in a `StructuredValue`. The wrapper's `.data` contains parsed content (string for text, object/array for JSON/JSONL), `.text` mirrors the display string, and `.ctx` flattens common metadata (filename, relative path, url, token counts) so `<file>.ctx.filename` stays available as values flow. Use `.keep`/`.keepStructured` when a JS/Node stage needs the wrapper and its `.ctx`; legacy surface fields like `.filename` and `.content` remain for compatibility.

## Basic Syntax

```mlld
>> Single file
/var @content = <file.md>

>> Glob pattern
/var @files = <*.md>

>> Section extraction
/var @intro = <README.md # introduction>

>> With rename pattern
/var @modules = <*.mld.md # tldr> as "### [@mlld/<>.fm.name](<>.relative)"
```

### AST extraction

```mlld
/var @defs = <service.ts { createUser, (helper) }>
```

The clause inside `{}` selects top-level definitions or definitions that use a name. Parentheses mark usage patterns.
Currently supports JavaScript, TypeScript, Python, Go, Rust, Ruby, Java, C#, Solidity, and C/C++ files. Results include file paths only when using glob patterns, and unmatched patterns yield `null` entries so array ordering matches the original request.

### Detection and Interpolation Rules

- In templates/strings, `<...>` is treated as a file reference only when it contains one of: `.`, `/`, `*`, or `@`.
- This allows XML-like tags such as `<thinking>` to remain literal text.
- Angle brackets always mean “load contents”, not “filename string”. Use quotes for literal paths.

### JSON/JSONL auto-parse
- `<file.json>` and `<file.jsonl>` auto-parse to StructuredValues: `.data` holds parsed object/array, `.text` preserves raw content, `.ctx` keeps path metadata.
- JSONL parses non-empty lines individually. Parse errors include line number and offending line preview.
- Structured access: use `.keepStructured`/`.keep` or the `keepStructured()`/`keep()` helper to retain the StructuredValue/metadata when you need ctx/provenance instead of content-only sugar, and use `.text` when you need the raw string form inside JS/Node.

## The Content Extraction Magic

The key principle: **`<file>` behaves like `<file>.content` automatically in most contexts**

```mlld
/var @doc = <README.md>
/var @docs = <*.md>

>> Single file - these are equivalent:
/show @doc                    << Shows file content
/show @doc.content            << Also shows file content

>> Arrays have different behavior by context:
/show @docs                   << Shows all contents concatenated

>> In templates:
/var @message = `File says: @doc`     << @doc uses .content
/var @allDocs = `Docs: @docs`         << @docs concatenated with newlines

>> In JavaScript:
/exe @process(@doc) = js {
  // 'doc' is the string content, not the object
  return doc.toUpperCase();
}

/exe @processAll(@docs) = js {
  // 'docs' is an array of strings, not concatenated
  return docs.map(d => d.toUpperCase());
}

>> But you can still access metadata when needed:
/show `Filename: @doc.filename`
/show `Has frontmatter: @doc.fm`
```

## Output Behavior

### Direct Display (`/show`)

When using `/show` with alligator-loaded content, the content is automatically extracted:

```mlld
/var @file = <doc.md>
/show @file              << Shows the content, not "[object Object]"

/var @files = <*.md>
/show @files             << Shows all contents concatenated with double newlines
```

### Template Interpolation

Content loaded via alligator syntax automatically extracts content in templates:

```mlld
/var @sections = <*.md # intro> as "## <>.fm.title"
/var @readme = `
# Documentation

@sections

End of document.
`

>> @sections is concatenated, not JSON-serialized
```

## Metadata Surfaces

- `.ctx` surfaces canonical metadata (`filename`, `relative`, `absolute`, `url`, `domain`, `title`, `description`, `tokens`, `tokest`, `fm`, provenance fields such as `source` and `retries`) as mutable runtime state.
- `.data` contains the parsed content (string for text, object/array for JSON/JSONL, structured values for globs); `.keep`/`.keepStructured` preserves wrappers for JS/Node when metadata is required.
- `.text` mirrors the user-visible content string, ensuring display paths never see `[object Object]`.

Example:

```mlld
/var @readme = <README.md>
/show `Path: @readme.ctx.relative`
/show `Tokens: @readme.ctx.tokens (est: @readme.ctx.tokest)`
/show `Frontmatter title: @readme.ctx.fm.title`
```

### JavaScript Function Parameters

When load-content StructuredValues are passed to JavaScript functions, they automatically unwrap to their `.data`:

```mlld
/var @config = <config.json>

/exe @parseConfig(@config) = js {
  return JSON.stringify({
    type: typeof config,
    hasFilename: 'filename' in config,
    name: config.name
  });
}

>> If you need metadata in JS, pass `.keep`:
/exe @processFile(@config.keep) = js {
  return JSON.stringify({
    filename: config.ctx.filename,
    tokens: config.ctx.tokens
  });
} 
```

### Structured Value Behavior

- Load-content results are stored as `StructuredValue` wrappers with `.text` (string view), `.data` (content), and `.ctx` (metadata).
- Display paths (templates, `/show`, pipelines) automatically use `.text`, so visible output stays content-focused.
- Access metadata via `.ctx`; pass `.keep`/`.keepStructured` into JS/Node when code needs both `.data` and metadata.
- Field access resolves through the underlying data while `.text` continues to mirror the content-first behaviour documented above.

## Type System Integration

### Single file loads

Single file loads create a `StructuredValue` whose `.data` stores the file content (string for text, object/array for JSON/JSONL):
- `.text` equals the file content string
- `.ctx.filename`, `.ctx.relative`, `.ctx.absolute`, and `.ctx.url` surface path info
- `.ctx.fm` exposes frontmatter when present; `.ctx.tokens`/`.ctx.tokest` surface token metrics

### LoadContentResultArray

Glob patterns create a `StructuredValue` that wraps a `LoadContentResultArray`:
- `.text` concatenates contents with double newlines
- `.ctx.length` reports the number of entries while `asData(@files)` keeps the raw array
- Each element stays tagged so downstream pipelines retain provenance

### RenamedContentArray

When using the `as "pattern"` syntax:
- Creates a `RenamedContentArray` with formatted content
- Custom `.content` getter applies the rename pattern
- Maintains proper concatenation behavior in templates

## Variable Type Preservation

The mlld type system preserves special behaviors through Variable internal metadata:

```typescript
// Variables store array type hints inside .internal
{
  type: 'array',
  internal: {
    arrayType: 'load-content-result' | 'renamed-content'
  }
}
```

This internal metadata enables the interpreter to:
1. Preserve custom toString() and content getters
2. Apply correct behavior during template interpolation
3. Maintain type information through variable resolution

## Resolution Contexts

The alligator syntax automatically extracts content in these contexts:

### Display Context (`/show`)
- LoadContentResult objects show their content
- Arrays concatenate with double newlines
- No JSON serialization or "[object Object]"

### Template Interpolation
- `@variable` in templates uses the content automatically
- Arrays with custom behaviors use their content getters
- Special handling for LoadContentResultArray and RenamedContentArray

### JavaScript Parameters
- Single LoadContentResult objects are unwrapped to their `.content` string
- LoadContentResultArray objects are unwrapped to arrays of content strings
- Maintains consistency with mlld's content-first approach

### Pipeline Input
- Content is extracted as raw strings automatically
- Arrays are joined before pipeline processing
- Metadata is not passed through pipelines

## Implementation Details

### Behavior Preservation

The interpreter preserves array behaviors through:

1. **Variable Creation** (`/interpreter/eval/var.ts`):
   - Re-applies behaviors after Variable creation
   - Uses `extractVariableValue` from variable-migration

2. **Variable Resolution** (`/interpreter/utils/variable-resolution.ts`):
   - Checks for special array types via `.internal.arrayType`
   - Preserves behaviors during value extraction

3. **Template Interpolation** (`/interpreter/core/interpreter.ts`):
   - Type guards check for LoadContentResultArray/RenamedContentArray
   - Uses content getters instead of JSON serialization

### Type Guards

```typescript
// Check for special array types
function isLoadContentResultArray(value: any): value is LoadContentResultArray {
  return Array.isArray(value) && 
         value.__variable?.internal?.arrayType === 'load-content-result';
}

function isRenamedContentArray(value: any): value is RenamedContentArray {
  return Array.isArray(value) && 
         value.__variable?.internal?.arrayType === 'renamed-content';
}
```

## Common Patterns

### Building Documentation

```mlld
>> Load all module docs with formatting
/var @modules = <modules/*.md # description> as "### <>.fm.name\n<>.content"

>> Create README
/var @readme = `
# Project Modules

@modules

Generated by mlld
`

/output @readme to "README.md"
```

### Collecting Sections

```mlld
>> Extract all "Usage" sections
/var @usage = <docs/*.md # usage>

>> Display concatenated
/show @usage

>> Or use in template
/show `
# Usage Guide

@usage
`
```

### File Metadata Access

```mlld
/var @file = <config.json>

>> Access metadata
/show `File: @file.ctx.filename`
/show `Path: @file.ctx.relative`
/show `Content: @file`

>> With frontmatter
/show `Title: @(asData(@file).fm.title)`
/show `Author: @(asData(@file).fm.author)`
```

## Content Load Object Types

### LoadContentResult
Single file load result with rich metadata stored inside `.data` and flattened via `.ctx`:
- `content`: File contents (auto-unwrapped in JS/Node functions)
- `filename`, `relative`, `absolute`, `url`, `domain`, `title`, `description`: Access with `@file.ctx.<field>`
- `tokest`/`tokens`: Token metrics available via `.ctx`
- `fm`, `json`: Structured data retrieved from `asData(@file)`

Token estimates come from the shared helper (`core/utils/token-metrics.ts`), so the same heuristics apply whether a string originates from `<file>` loads, `/var` assignments, or downstream guard evaluations. Every variable exposes these metrics via `.ctx` (for example `@doc.ctx.tokens` / `@doc.ctx.tokest`).

### LoadContentResultArray
Array of LoadContentResult objects:
- Auto-unwraps to array of content strings in JS/Node
- Custom `toString()` joins with `\n\n`
- `.content` getter returns concatenated content
- `asData(@files)` preserves the original array so `.ctx.length` and provenance remain consistent

### RenamedContentArray
Created by rename patterns (`<*.md> as "pattern"`):
- Array of pre-formatted strings
- Custom `toString()` for concatenation

### LoadContentResultURL
Extended LoadContentResult for URLs:
- All LoadContentResult properties accessible through `asData(@urlResult)`
- `.ctx.url`, `.ctx.domain`, `.ctx.title`, `.ctx.description`, `.ctx.status`, `.ctx.contentType`
- `.ctx.html`, `.ctx.text`, `.ctx.md`: Converted formats available without touching `.text`

## Auto-unwrapping Behavior

LoadContentResult objects automatically unwrap to their `.content` property when:

1. **Passed to JavaScript/Node functions**:
   ```mlld
   /var @file = <doc.md>
   /exe @process(@input) = js {
     // 'input' is string content, not object
     return input.toUpperCase();
   }
   ```

2. **Used in template interpolation**:
   ```mlld
   /var @doc = <README.md>
   /var @msg = `Content: @doc`  // Uses .content
   ```

3. **Displayed with /show**:
   ```mlld
   /show @file  // Shows content, not "[object Object]"
   ```

## Gotchas and Edge Cases

1. **Explicit Property Access**: When you explicitly access `.content`, you get the raw string without any special behaviors
2. **Array Behavior Differences**: Arrays behave differently in templates (concatenated) vs JavaScript (array of strings)
3. **JSON Serialization**: If you `JSON.stringify()` a LoadContentResult in JavaScript, you'll get the full object structure
4. **Type Checking**: In JavaScript, the unwrapped content is a string, so `typeof` returns "string", not "object"
5. **Auto-unwrapping**: Only happens for LoadContentResult objects passed as parameters - field access preserves the object

## Metadata Shelf Architecture

### tldr

The metadata shelf preserves LoadContentResult metadata when passed through JavaScript functions. Works automatically for both arrays and single files - exact content matching for arrays, auto-restoration for transformed single files.

### Principles

- Transparent restoration (JS functions don't need modification)
- Automatic for arrays (content-based matching)
- Automatic for single files (metadata reattachment after transformation)
- Preserves auto-unwrap semantics (JS still receives strings)

### Details

**Arrays**: Exact content matching - if JS returns same strings, metadata restored
**Single Files**: Auto-restoration - if JS transforms content, metadata automatically reattached to result

Key components:
- `interpreter/eval/auto-unwrap-manager.ts` - Centralized shelf with AsyncLocalStorage
- `AutoUnwrapManager.executeWithPreservation()` - Wraps JS execution
- `MetadataShelf.restoreMetadata()` - Handles both arrays and single files

### Pipeline Integration

Pipeline stages wrap execution with `executeWithPreservation()` to preserve metadata through transformations:

```typescript
// Pipeline execution with metadata preservation
const result = await AutoUnwrapManager.executeWithPreservation(async () => {
  return await executeCommandVariable(commandVar, args, pipelineEnv, currentOutput);
});
```

## Debugging

Enable debug output to trace array behavior:

```bash
MLLD_DEBUG=true mlld script.mld
```

This shows:
- Array type detection in interpolation
- Variable metadata preservation
- Content getter availability
