# Unified Path AST Specification

## Overview

This document describes the unified path handling system that allows users to seamlessly use both local filesystem paths and URLs in any path context within Mlld directives. The grammar automatically detects and categorizes path types, producing consistent AST structures for interpreter consumption.

## Grammar Entry Point

All path inputs flow through a single `PathExpression` rule that intelligently categorizes paths into one of four subtypes:

1. **filePath** - Local filesystem paths
2. **fileSectionPath** - Local filesystem paths with section markers
3. **urlPath** - Remote URLs (http/https/file protocols)
4. **urlSectionPath** - Remote URLs with section markers

## AST Structure

### Base Path Node Structure

All path nodes share this base structure:

```typescript
{
  type: 'path',
  subtype: 'filePath' | 'fileSectionPath' | 'urlPath' | 'urlSectionPath',
  values: {
    // Type-specific values (see below)
  },
  raw: {
    // Raw string representations
  },
  meta: {
    // Metadata about the path
  }
}
```

### Subtype-Specific Structures

#### 1. filePath
Local filesystem path without section marker.

```typescript
{
  type: 'path',
  subtype: 'filePath',
  values: {
    path: Array<PathPart>  // Array of path segments and variable references
  },
  raw: {
    path: string  // Original path string
  },
  meta: {
    isAbsolute: boolean,      // true if path starts with '/'
    hasExtension: boolean,    // true if path ends with .ext
    extension: string | null, // File extension if present
    hasVariables: boolean     // true if path contains @var references
  }
}
```

Example input: `"./src/config.mld"` or `[@projectDir]/config.mld`

#### 2. fileSectionPath
Local filesystem path with section marker.

```typescript
{
  type: 'path',
  subtype: 'fileSectionPath',
  values: {
    path: Array<PathPart>,  // Array of path segments and variable references
    section: string         // Section identifier after #
  },
  raw: {
    path: string,          // Original path string (without #section)
    section: string        // Section identifier
  },
  meta: {
    isAbsolute: boolean,
    hasExtension: boolean,
    extension: string | null,
    hasVariables: boolean,
    hasSection: true       // Always true for section paths
  }
}
```

Example input: `"./docs/README.md#installation"`

#### 3. urlPath
Remote URL without section marker.

```typescript
{
  type: 'path',
  subtype: 'urlPath',
  values: {
    url: string,           // Full URL including protocol
    protocol: string,      // 'http', 'https', or 'file'
    parts: Array<URLPart>  // Parsed URL segments for variable interpolation
  },
  raw: {
    url: string,          // Full URL
    protocol: string      // Protocol only
  },
  meta: {
    isUrl: true,          // Always true for URLs
    protocol: string,     // Same as values.protocol
    hasVariables: boolean // true if URL contains @var references
  }
}
```

Example input: `"https://api.example.com/v1/data.json"`
With variables: `"https://@apiDomain/v1/@endpoint.json"`

#### 4. urlSectionPath
Remote URL with section marker.

```typescript
{
  type: 'path',
  subtype: 'urlSectionPath',
  values: {
    url: string,           // Full URL including protocol
    protocol: string,      // 'http', 'https', or 'file'
    parts: Array<URLPart>, // Parsed URL segments
    section: string        // Section identifier after #
  },
  raw: {
    url: string,          // Full URL (without #section)
    protocol: string,     // Protocol only
    section: string       // Section identifier
  },
  meta: {
    isUrl: true,
    protocol: string,
    hasVariables: boolean,
    hasSection: true      // Always true for section paths
  }
}
```

Example input: `"https://example.com/docs.md#configuration"`

## PathPart and URLPart Types

### PathPart (for local paths)
```typescript
type PathPart = 
  | { type: 'Text', content: string }              // Regular path segment
  | { type: 'PathSeparator', content: '/' }        // Directory separator
  | { type: 'VariableReference', identifier: string } // @var reference
```

### URLPart (for URLs)
```typescript
type URLPart = 
  | { type: 'Text', content: string }              // Regular URL segment
  | { type: 'VariableReference', identifier: string } // @var reference
```

## Variable Interpolation

Both local paths and URLs support variable interpolation using `@varName` syntax:

- Local path: `"./data/@env/config.json"` 
- URL: `"https://@apiDomain/v1/@version/data.json"`

The `parts` array in the AST preserves these variable references for resolution at runtime.

## Usage Examples

### Import Directive
```mlld
@import {*} from "https://example.com/config.mld"
@import {*} from "./local/config.mld"
@import {auth} from "https://@apiDomain/auth.mld"
```

All produce consistent AST with `path.subtype` indicating the path type.

### Path Assignment
```mlld
@path config = "https://api.example.com/v1/config"
@path local = "./data/config.json"
@path docs = "https://docs.example.com/api.md#authentication"
```

### Text/Add Directives
```mlld
@text readme = [https://raw.githubusercontent.com/user/repo/main/README.md]
@add [./templates/header.md]
@text section = [https://example.com/docs.md#installation]
```

## Interpreter Implementation Guidelines

### 1. Path Resolution

The interpreter should branch on `path.subtype`:

```typescript
async function resolvePath(pathNode: PathNode, env: Environment): Promise<string> {
  // First, resolve any variables in the path
  const resolvedPath = await resolvePathVariables(pathNode, env);
  
  switch (pathNode.subtype) {
    case 'urlPath':
    case 'urlSectionPath':
      // Use URL fetching logic
      const content = await env.fetchURL(resolvedPath);
      if (pathNode.values.section) {
        return extractSection(content, pathNode.values.section);
      }
      return content;
      
    case 'filePath':
    case 'fileSectionPath':
      // Use filesystem logic
      const content = await env.readFile(resolvedPath);
      if (pathNode.values.section) {
        return extractSection(content, pathNode.values.section);
      }
      return content;
  }
}
```

### 2. Variable Resolution

For paths with variables (`meta.hasVariables === true`):

1. Iterate through the `parts` array
2. Resolve any `VariableReference` nodes
3. Reconstruct the final path/URL
4. Proceed with fetching/reading

### 3. Security Considerations

For URL paths:
- Validate against allowed/blocked domains
- Enforce protocol restrictions
- Apply timeout and size limits
- Check URL format after variable resolution

For file paths:
- Validate path traversal attempts
- Check file existence and permissions
- Apply project boundary restrictions

## Benefits of This Approach

1. **Transparent to Users**: Write paths naturally without special syntax
2. **Consistent AST**: Similar structure for all path types
3. **Future-Proof**: Easy to add new protocols (s3://, git://, etc.)
4. **Variable Support**: Uniform variable interpolation across all path types
5. **Section Support**: Consistent section extraction for both files and URLs
6. **Type Safety**: Clear subtype discrimination for interpreter branching

## Migration Notes

- Existing `PathCore` AST nodes map to `filePath` subtype
- Existing `SectionPathCore` nodes map to `fileSectionPath` subtype
- The interpreter's existing path handling can be preserved for file paths
- URL handling is additive, not a breaking change