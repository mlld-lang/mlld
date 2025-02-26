# Meld Path Handling

## Overview

Meld uses a strict path handling system for security and portability. All paths in Meld that reference the filesystem must follow specific conventions to ensure they are secure and platform-independent.

## Path Requirements

1. **No Absolute Paths**
   - Raw absolute paths (e.g., `/home/user/file.txt` or `C:\Users\user\file.txt`) are not allowed
   - All paths must use special path variables

2. **No Relative Paths with Dot Segments**
   - Paths containing `.` or `..` segments are prohibited
   - These can lead to directory traversal vulnerabilities and reduce code portability

3. **Special Path Variables**
   - `$PROJECTPATH` or `$.` - References the project root directory
   - `$HOMEPATH` or `$~` - References the user's home directory

4. **Proper Format**
   - Special path variables must be followed by a forward slash (`/`)
   - Path segments must be separated by forward slashes (not backslashes)
   - Variables are resolved to absolute paths at runtime

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

## Examples

### Valid Paths

```meld
@path docs = "$PROJECTPATH/docs"        # Project-relative path
@path config = "$./config"              # Project-relative path (alias syntax)
@path home = "$HOMEPATH/meld"           # Home-relative path
@path data = "$~/data"                  # Home-relative path (alias syntax)
```

### Invalid Paths

```meld
@path bad1 = "/absolute/path"           # Raw absolute path - not allowed
@path bad2 = "relative/path"            # Relative path without special variable - not allowed
@path bad3 = "$PROJECTPATH/../outside"  # Contains .. segment - not allowed
@path bad4 = "./config"                 # Contains . segment - not allowed
@path bad5 = "$PROJECTPATH\\docs"       # Backslashes not allowed - use forward slashes
```

## Path Resolution

Paths are resolved at runtime through the `PathService`:

1. **Validation**
   - Paths are validated against strict rules
   - Validation errors provide clear messages about what's wrong

2. **Resolution**
   - Special variables are replaced with their absolute path equivalents
   - `$PROJECTPATH/docs` → `/path/to/project/docs`
   - `$HOMEPATH/config` → `/home/user/config`

3. **Normalization**
   - Paths are normalized according to platform conventions
   - Forward slashes are converted to the appropriate separator if needed

## Path in Directives

### @path Directive

The `@path` directive defines path variables:

```meld
@path docs = "$PROJECTPATH/docs"
@path templates = "$PROJECTPATH/templates"
```

- Left side: Variable name (without the $ prefix)
- Right side: Path value (must follow path requirements)

### @embed Directive

```meld
@embed [path]
@embed [path # section_text]
```

### @import Directive

```meld
@import [path]
```

### Using Path Variables

Path variables can be used in various directives:

```meld
@path docs = "$PROJECTPATH/docs"
@embed [$docs/file.md]                  # Embed content from a file
@run [cat $docs/file.md]                # Run command with path argument
@import [$docs/import.meld]             # Import another meld file
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
- Relative paths (`../`, `./`) are preserved in test contexts only
- Single segment paths without `$` get `./` prefix

## Path Service

The `PathService` handles all path operations:

- **Validation**: Ensures paths follow security rules
- **Resolution**: Replaces special variables with actual paths
- **Test Mode**: Supports test environment with mock paths

### Test Mode

For testing, `PathService` provides a test mode:

```typescript
// Enable test mode
pathService.enableTestMode();

// Set custom paths for testing
pathService.setProjectPath('/test/project');
pathService.setHomePath('/test/home');
```

In test mode, paths are validated but not required to exist on the filesystem.

## Security Considerations

Meld's path handling is designed with security in mind:

1. **No Directory Traversal**
   - Prohibiting `..` segments prevents directory traversal attacks

2. **No Raw Absolute Paths**
   - Requiring special variables ensures paths stay within intended boundaries

3. **Explicit Path Origins**
   - All paths explicitly state their origin ($PROJECTPATH or $HOMEPATH)
   - This makes code more maintainable and secure

4. **Consistent Separators**
   - Forward slashes ensure cross-platform compatibility
   - Avoids Windows-specific path issues

## Best Practices

1. **Define Path Variables at the Top**
   - Group path definitions at the beginning of your file

2. **Use Descriptive Names**
   - Choose variable names that clearly indicate their purpose
   - e.g., `templates`, `config`, `docs`

3. **Validate with PathService**
   - Use `PathService.validatePath()` when implementing custom directives

4. **Keep Paths Organized**
   - Structure projects with a clear directory hierarchy
   - Use consistent naming conventions

## Common Issues

### Path Not Found

If you get a "path not found" error:

1. Check that the path variable is defined correctly
2. Verify that the special path variable ($PROJECTPATH or $HOMEPATH) is correct
3. Ensure the referenced path exists on disk

### Invalid Path Format

If you get an "invalid path format" error:

1. Make sure the path starts with `$PROJECTPATH/` or `$HOMEPATH/`
2. Check for any `.` or `..` segments
3. Verify you're using forward slashes, not backslashes
4. Ensure you're not using raw absolute paths