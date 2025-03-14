# Path Handling in Meld

This document details how paths are structured, processed, and used within Meld.

## Path Object Structure

Internally, paths in Meld are represented as structured objects:

```javascript
{
  // Original unmodified path string
  raw: "path/to/file.md",
  
  // Normalized version (often with ./ prefix added)
  normalized: "./path/to/file.md",
  
  // Detailed breakdown of the path
  structured: {
    // Base path component (., .., $HOMEPATH, $PROJECTPATH, etc.)
    base: ".",
    
    // Path segments as array
    segments: ["path", "to", "file.md"],
    
    // Variables found in the path
    variables: {
      // Text variables like ${variable_name}
      text: ["variable_name"],
      
      // Special variables like $HOMEPATH, $PROJECTPATH
      special: ["HOMEPATH", "PROJECTPATH"],
      
      // Path variables like $variable
      path: ["variable"]
    },
    
    // Flag for current working directory paths
    cwd: true
  }
}
```

## Path Variables

Three types of variables can be used in paths:

```
$path                         Path variable reference
$HOMEPATH or $~               Special path variable (home directory)
$PROJECTPATH or $.            Special path variable (project root)
```

## Path Rules

- Special path variables must be followed by `/` when used for paths
- Forward slashes as separators
- Cannot be empty
- All paths must be absolute (via `$HOMEPATH/$PROJECTPATH`)
- Working directory only affects initial `$PROJECTPATH`
- Relative paths not allowed for security

## Path Usage in Directives

### @embed
```
@embed [path]
@embed [path # section_text]
```

### @import
```
@import [path]
```

### @path
```
@path identifier = "$HOMEPATH/path"
@path identifier = "$~/path"
@path identifier = "$PROJECTPATH/path"
@path identifier = "$./path"
```

## Path Variable Extraction

The parser extracts variables from paths using regex patterns:
- Text variables: `\${([a-zA-Z0-9_]+)}`
- Special variables: `\$([A-Z][A-Z0-9_]*|~|\.)`
- Path variables: `\$([a-z][a-zA-Z0-9_]*)`

## Path Normalization

Paths are normalized according to these rules:
- Current working directory paths get `./` prefix
- `$~/` is normalized to `$HOMEPATH/`
- `$./` is normalized to `$PROJECTPATH/`
- Relative paths (`../`, `./`) are preserved in test contexts
- Single segment paths without `$` get `./` prefix

## Path Validation

Paths are validated for:
- No relative segments (`../`, `./`) outside of test contexts
- Must start with special variable for `@path` directive
- Cannot be empty
- Must follow filesystem path conventions

## Examples

```meld
// Basic path usage
@embed [$HOMEPATH/docs/file.md]
@import [$PROJECTPATH/includes/header.md]

// Path variables
@path docs = "$HOMEPATH/documents"
@embed [$docs/readme.md]

// With text variables
@embed [$PROJECTPATH/${project}/docs/guide.md]

// Special variable aliases
@path config = "$~/config"
@path project = "$./src"

// Path in structured object
@data fileInfo = {{
  path: "$PROJECTPATH/data.json",
  type: "json"
}}
```

## Invalid Path Patterns

```
// Invalid - relative paths not allowed
@embed [../file.md]
@embed [./file.md]

// Invalid - path variables cannot use field access
$path.field

// Invalid - path variables cannot use formatting
$path>>(format)

// Invalid - @path must start with special variable
@path docs = "documents"
```

## Path Error Handling

- Invalid path references (not using `$HOMEPATH/$PROJECTPATH`) are fatal errors
- Missing or inaccessible referenced files are fatal errors
- Relative paths not allowed for security reasons

## Path Resolution Process

1. Parse raw path string
2. Extract and validate variables
3. Determine base path component
4. Split into segments
5. Normalize path format
6. Create structured path object
7. Validate against security rules
8. Resolve to filesystem path during execution 