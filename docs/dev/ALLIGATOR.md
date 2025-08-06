# Alligator Syntax and Load-Content Output Behavior

## Overview

The alligator syntax (`<file>` or `<pattern>`) in mlld provides powerful content loading capabilities with automatic content extraction. 

**Conceptually**: Think of `<file>` as returning content directly - that's its primary purpose. The metadata (filename, frontmatter, etc.) is available when you need it, but content is the default.

**Implementation detail**: Under the hood, mlld returns a LoadContentResult object, but in most contexts it automatically behaves as if you accessed its `.content` property - this is syntactic sugar that makes working with loaded content seamless. This means `<file>` acts like `<file>.content` automatically, while still allowing access to `<file>.filename`, `<file>.fm`, and other metadata when needed.

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

### JavaScript Function Parameters

When LoadContentResult objects are passed to JavaScript functions, they automatically unwrap to their content:

```mlld
/var @config = <config.json>

/exe @parseConfig(@config) = js {
  // 'config' here is the string content, not the LoadContentResult object
  return JSON.parse(config);
}

>> If you need the full object with metadata:
/exe @processFile(@config.content, @config.filename, @config.fm) = js {
  // Explicitly pass the properties you need
  console.log(`Processing ${filename}`);
  return content;
}
```

## Type System Integration

### LoadContentResult

Single file loads create a `LoadContentResult` object:
- Has a `.content` property containing the file content
- Includes metadata: `filename`, `relative`, `absolute`, `fm` (frontmatter)
- Auto-converts to string using the content

### LoadContentResultArray

Glob patterns create a `LoadContentResultArray`:
- Custom `.content` getter that concatenates all file contents
- Custom `toString()` method for proper string conversion
- Each element is a `LoadContentResult`

### RenamedContentArray

When using the `as "pattern"` syntax:
- Creates a `RenamedContentArray` with formatted content
- Custom `.content` getter applies the rename pattern
- Maintains proper concatenation behavior in templates

## Variable Type Preservation

The mlld type system preserves special behaviors through Variable metadata:

```typescript
// Variables store metadata about array types
{
  type: 'array',
  metadata: {
    arrayType: 'load-content-result' | 'renamed-content'
  }
}
```

This metadata enables the interpreter to:
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
   - Checks for special array types via metadata
   - Preserves behaviors during value extraction

3. **Template Interpolation** (`/interpreter/core/interpreter.ts`):
   - Type guards check for LoadContentResultArray/RenamedContentArray
   - Uses content getters instead of JSON serialization

### Type Guards

```typescript
// Check for special array types
function isLoadContentResultArray(value: any): value is LoadContentResultArray {
  return Array.isArray(value) && 
         value.__variable?.metadata?.arrayType === 'load-content-result';
}

function isRenamedContentArray(value: any): value is RenamedContentArray {
  return Array.isArray(value) && 
         value.__variable?.metadata?.arrayType === 'renamed-content';
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
/show `File: @file.filename`
/show `Path: @file.relative`
/show `Content: @file.content`

>> With frontmatter
/show `Title: @file.fm.title`
/show `Author: @file.fm.author`
```

## Content Load Object Types

### LoadContentResult
Single file load result with rich metadata:
- `content`: File contents (auto-unwrapped in JS/Node functions)
- `filename`, `relative`, `absolute`: Path information
- `tokest`/`tokens`: Token counts
- `fm`: Frontmatter (markdown files)
- `json`: Parsed JSON (JSON files)

### LoadContentResultArray
Array of LoadContentResult objects:
- Auto-unwraps to array of content strings in JS/Node
- Custom `toString()` joins with `\n\n`
- `.content` getter returns concatenated content

### RenamedContentArray
Created by rename patterns (`<*.md> as "pattern"`):
- Array of pre-formatted strings
- Custom `toString()` for concatenation

### LoadContentResultURL
Extended LoadContentResult for URLs:
- All LoadContentResult properties plus:
- `url`, `domain`, `title`, `description`
- `status`, `statusText`, `contentType`
- `text`, `md`, `html`: Converted formats

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

The metadata shelf preserves LoadContentResult metadata when arrays are passed through JavaScript functions. When LoadContentResultArray is unwrapped to content strings for JS, the shelf stores the original objects and restores them when matching content returns.

### Principles

- Transparent restoration (JS functions don't need modification)
- Content-based matching (uses content string as key)
- Automatic cleanup (shelf clears after each operation)
- Preserves auto-unwrap semantics (JS still receives strings)

### Details

When LoadContentResult objects pass through JS functions:

1. **Storage Phase**: Before unwrapping, `autoUnwrapLoadContent()` stores LoadContentResult objects on the shelf
2. **Execution Phase**: JS function receives unwrapped content strings, processes them normally
3. **Restoration Phase**: When JS returns an array, `metadataShelf.restoreMetadata()` checks each string against the shelf
4. **Cleanup Phase**: Shelf is cleared to prevent memory leaks

Key components:
- `interpreter/eval/metadata-shelf.ts` - Core shelf implementation
- `autoUnwrapLoadContent()` - Entry point for storage
- `restoreMetadata()` - Restoration logic after JS execution

### Gotchas

- Only restores when content strings match exactly
- Shelf must be cleared after each operation
- Currently only in exec-invocation.ts (needs integration in exe.ts, run.ts)

## Debugging

Enable debug output to trace array behavior:

```bash
MLLD_DEBUG=true mlld script.mld
```

This shows:
- Array type detection in interpolation
- Variable metadata preservation
- Content getter availability