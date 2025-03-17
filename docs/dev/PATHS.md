# Meld Path Handling

## Overview

Meld provides a flexible path handling system with support for cross-platform portability through special path variables. The system allows standard file system path formats while also providing platform-independent alternatives.

## Path Options

1. **Absolute Paths**
   - Raw absolute paths (e.g., `/home/user/file.txt` or `C:\Users\user\file.txt`) are allowed
   - These are resolved as-is, but may reduce cross-platform portability

2. **Relative Paths**
   - Paths containing `.` or `..` segments are allowed
   - These are resolved relative to the current working directory or base directory

3. **Special Path Variables (Recommended)**
   - `$PROJECTPATH` or `$.` - References the project root directory
   - `$HOMEPATH` or `$~` - References the user's home directory
   - Using these variables improves cross-platform portability

4. **Format Guidelines**
   - Path segments should be separated by forward slashes (not backslashes) for cross-platform compatibility
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

### Example Paths

```meld
# Recommended paths (best for cross-platform compatibility)
@path docs = "$PROJECTPATH/docs"        # Project-relative path
@path config = "$./config"              # Project-relative path (alias syntax)
@path home = "$HOMEPATH/meld"           # Home-relative path
@path data = "$~/data"                  # Home-relative path (alias syntax)

# Standard paths (now allowed)
@path abs = "/absolute/path"            # Absolute path
@path rel = "relative/path"             # Relative path 
@path parent = "../parent/dir"          # Path with parent directory reference
@path current = "./current/dir"         # Path with current directory reference

# Not recommended
@path windows = "C:\\Users\\name\\docs" # Backslashes reduce cross-platform compatibility
```

## Path Resolution

Paths are resolved at runtime through the `PathService`:

1. **Basic Validation**
   - Paths are validated against basic rules (no null bytes, not empty)
   - Special path variables are recognized and processed

2. **Resolution**
   - Special variables are replaced with their absolute path equivalents
   - `$PROJECTPATH/docs` → `/path/to/project/docs`
   - `$HOMEPATH/config` → `/home/user/config`
   - Standard paths are processed according to OS path rules

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
- Right side: Path value (can be any valid filesystem path)

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
@import [$docs/import.mld]             # Import another meld file
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

## Path Portability Considerations

Meld's path handling is designed with cross-platform portability in mind:

1. **Using Special Path Variables (Recommended)**
   - Special variables like `$PROJECTPATH` and `$HOMEPATH` enhance portability
   - They make code more maintainable across different environments

2. **Standard Path Support**
   - Standard paths (absolute, relative, with dot segments) are fully supported
   - This allows for greater flexibility when needed

3. **Consistent Separators**
   - Using forward slashes ensures cross-platform compatibility
   - Avoids Windows-specific path issues

4. **Security**
   - Basic security checks (like null byte detection) are still enforced

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

1. Check that the path is not empty
2. Ensure there are no null bytes in the path
3. Verify you're using forward slashes as separators, not backslashes 
4. Check if any text variables inside the path need resolution