# Alligator Enhancement Spec: Glob Support & Metadata

**Status: ✅ IMPLEMENTED** - See docs/dev/GLOB-META-IMPLEMENTATION.md for implementation details

## Overview

This spec describes enhancements to the alligator syntax (`<...>`) to support:
1. Glob patterns for loading multiple files
2. Rich metadata for all loaded content
3. Lazy token counting (estimated and exact)
4. Lazy parsing of frontmatter and JSON

## Syntax

### Basic Syntax (Unchanged)
```mlld
<file.md>                       # Single file
<path/to/file.json>            # Path with directories  
<https://example.com/data>     # URL
<file.md # Section>            # Section extraction
<@PROJECTPATH/docs/*.md>       # With resolver
<@./relative/path.txt>         # Short alias for PROJECTPATH
```

### New Glob Patterns
```mlld
<*.md>                         # All .md files in current directory
<**/*.test.ts>                 # All test files recursively
<docs/**/*.md>                 # All markdown in docs tree
<{src,lib}/**/*.js>           # Multiple directories
<tests/[0-9]*.test.js>        # Numbered test files
```

## Return Types

### Single File Returns: `LoadContentResult`
```typescript
interface LoadContentResult {
  // Always available
  content: string;              // File contents (or section if extracted)
  filename: string;             // "README.md"
  relative: string;             // "./docs/README.md"
  absolute: string;             // "/Users/adam/project/docs/README.md"
  
  // Lazy-evaluated properties
  get tokest(): number;         // Estimated tokens (KB-based)
  get tokens(): number;         // Exact tokens (tiktoken)
  get fm(): any | undefined;    // Frontmatter (markdown only)
  get json(): any | undefined;  // Parsed JSON (JSON files only)
}
```

### Glob Returns: `LoadContentResult[]`
- Returns array of `LoadContentResult` objects
- Empty array if no matches
- Sections: Files without the requested section are skipped (not included)

## Usage Examples

### Basic File Loading
```mlld
# Single file - returns LoadContentResult
/var @readme = <README.md>
/show @readme.content           # File contents
/show @readme.filename          # "README.md"
/show @readme.relative          # "./README.md"
/show @readme.absolute          # "/Users/adam/project/README.md"
/show @readme.tokest           # ~1500 (estimated)
/show @readme.tokens           # 1523 (exact)
```

### Frontmatter Access
```mlld
/var @post = <blog/post.md>
/show @post.fm.title           # "My Blog Post"
/show @post.fm.author          # "Jane Doe"
/show @post.fm.tags            # ["tech", "tutorial"]
/when @post.fm.published => /show @post.content
```

### JSON File Access
```mlld
/var @config = <package.json>
/show @config.json.name        # "my-project"
/show @config.json.version     # "1.0.0"
/show @config.json.dependencies.mlld  # "^2.0.0"
```

### Glob Patterns
```mlld
# Load all markdown files
/var @docs = <docs/**/*.md>
/show `Found @docs.length documentation files`

# Access individual files
/show @docs.0.content          # First file's content
/show @docs.0.filename         # First file's name

# Iterate over files
/show foreach @doc(@docs) {
  ## @doc.filename (@doc.tokest tokens)
  @doc.content
}
```

### Section Extraction with Globs
```mlld
# Extract "Installation" sections from all docs
/var @installs = <docs/**/*.md # Installation>

# Files without "Installation" sections are skipped
/show foreach @install(@installs) {
  From @install.filename:
  @install.content
}
```

### Token-Aware Processing
```mlld
# Filter large files using fast estimation
/var @docs = <**/*.md>
/var @largeDocs = foreach @doc(@docs) {
  /when @doc.tokest > 4000 => @doc
}

# Get exact count for context window planning
/var @totalTokens = 0
/when foreach @doc(@largeDocs) {
  /var @totalTokens = @totalTokens + @doc.tokens
}
/show `Total tokens: @totalTokens`
```

### Complex Filtering
```mlld
# Published posts only
/var @posts = <blog/**/*.md>
/var @published = foreach @post(@posts) {
  /when @post.fm.published => @post
}

# Sort by date (would need a sort helper)
/show foreach @post(@published) {
  [@post.fm.title](@post.relative) - @post.fm.date
}
```

## Implementation Details

### Grammar Changes

1. Add to `grammar/deps/grammar-core.js`:
```javascript
isGlobPattern(path) {
  return /[\*\?\{\}\[\]]/.test(path);
},

createPathMetadata(rawPath, parts) {
  return {
    hasVariables: parts.some(p => p && p.type === NodeType.VariableReference),
    isAbsolute: rawPath.startsWith('/'),
    hasExtension: /\.[a-zA-Z0-9]+$/.test(rawPath),
    extension: rawPath.match(/\.([a-zA-Z0-9]+)$/)?.[1] || null,
    isGlob: this.isGlobPattern(rawPath)  // NEW
  };
}
```

### Interpreter Changes

1. Update `interpreter/eval/content-loader.ts`:
   - Check `source.meta?.isGlob` to detect glob patterns
   - Use `fast-glob` for pattern matching
   - Return `LoadContentResult` or `LoadContentResult[]`
   - Implement lazy getters for all metadata

2. Update type handling throughout:
   - `LoadContentEvaluator` returns `string | LoadContentResult | LoadContentResult[]`
   - Variable access needs to handle metadata property access

### Token Estimation

**Estimated tokens (`tokest`):**
- Text files (.md, .txt): 750 tokens/KB
- Code files (.js, .ts, .py, etc.): 500 tokens/KB  
- Data files (.json, .xml, .yaml): 400 tokens/KB

**Exact tokens (`tokens`):**
- Uses tiktoken with GPT-4 encoding
- Lazy loads tiktoken on first access
- Cached after computation

### Error Handling

- **No matches**: Glob returns empty array (not an error)
- **Missing section**: File skipped in results (not included)
- **Invalid frontmatter/JSON**: Property returns `undefined`
- **File access errors**: Throw with specific file path

## Future Considerations

1. **Sorting**: Glob results sorted by filename by default
2. **Limits**: No limits initially, can add later if needed
3. **Caching**: Each file's metadata cached on first access
4. **Performance**: Lazy evaluation prevents unnecessary parsing

## Migration

This is backward compatible - existing alligator usage continues to work, returning strings. The new metadata is only available when accessed.