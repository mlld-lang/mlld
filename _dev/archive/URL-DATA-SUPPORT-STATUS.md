# URL Support in @data Directive - Status Report

## Summary

The `@data` directive now has full URL support through its embedded directives (`@add` and `@run`). URLs are correctly parsed and categorized at the grammar level.

## Implementation Details

### What Was Updated

1. **Updated `AddCore` in `grammar/core/add.peggy`**:
   - Changed from `PathCore` to `PathExpression`
   - Added support for both `path.values.path` and `path.values.url`
   - Preserves `pathSubtype` in metadata for URL detection

### How It Works

When using URLs in `@data` directives:

```meld
@data config = {
  "localFile": @add ./config.json,
  "remoteFile": @add https://example.com/config.json,
  "apiData": @run `curl https://api.example.com/data`
}
```

The AST correctly identifies:
- Local paths: `pathSubtype: 'filePath'`
- URLs: `pathSubtype: 'urlPath'`, `isUrl: true`, `protocol: 'https'`

### Test Results

```bash
# Standalone @add with URL
@add https://example.com/file.md

# AST Output:
{
  meta: {
    path: {
      isUrl: true,
      protocol: 'https',
      hasVariables: false,
      pathSubtype: 'urlPath'  # ✓ Correctly identified
    }
  }
}
```

## Complex Data Design Compatibility

The implementation aligns with the Complex Data Assignment Design document:

### ✅ Supported Features
1. **Embedded Directives**: `@run` and `@add` work within data structures
2. **URL Paths**: URLs are properly recognized in embedded `@add` directives
3. **Lazy Evaluation**: Directives are stored but not executed until accessed
4. **Nested Structures**: Objects and arrays can contain directives with URLs
5. **Metadata Preservation**: URL detection metadata flows through to the interpreter

### Example Use Cases

```meld
# Configuration with Remote Resources
@data config = {
  "docs": @add https://docs.example.com/latest/config.md,
  "schema": @add https://api.example.com/schema.json,
  "version": @run `curl -s https://api.example.com/version`
}

# API Response Aggregation
@data apiData = {
  "users": @run `curl https://api.example.com/users`,
  "posts": @run `curl https://api.example.com/posts`,
  "stats": {
    "source": "https://api.example.com",
    "data": @run `curl https://api.example.com/stats`
  }
}
```

## Interpreter Integration

The interpreter can now:
1. Check `directive.meta.path.pathSubtype` to determine if a path is a URL
2. Use `directive.meta.path.protocol` to handle different URL schemes
3. Branch logic based on `isUrl: true` flag

## Notes

- URLs in string literals (e.g., `"url": "https://example.com"`) are just strings, not parsed as paths
- Only URLs in directive contexts (`@add`, `@import`, etc.) get special URL parsing
- The `@run` directive can execute commands with URLs (e.g., `curl` commands) but doesn't parse the URL itself
- All existing tests continue to pass - no regressions introduced