---
layout: docs.njk
title: "mlld Resolvers"
---

# mlld Resolvers

Resolvers are mlld's system for handling @ references like `@TIME`, `@INPUT`, `@company/module`, and `@./path`. They provide a unified, extensible way to access external data, modules, and computed values.

## Key Concepts

- **Prefix**: An @ symbol that "opens doors" to data (e.g., `@local/`, `@company/`, `@docs/`)
- **Resolver**: A data provider that handles requests for a prefix (e.g., LOCAL, GITHUB, REGISTRY)
- **Built-in Resolvers**: Special resolvers like @TIME, @DEBUG, @PROJECTPATH that provide specific functionality without needing prefixes
- **Registry**: A specific resolver type (REGISTRY) that ONLY provides modules from module registries

## Built-in Resolvers

mlld includes several built-in resolvers that use UPPERCASE naming:

### @TIME - Dynamic Timestamps

Import formatted timestamps in any format:

```mlld
@import { "YYYY-MM-DD" as date, "HH:mm:ss" as time } from @TIME
@import { iso, unix } from @TIME

Today is @add @date at @add @time
ISO format: @add @iso
```

**Common format patterns:**
- `"YYYY-MM-DD"` → 2024-12-06
- `"HH:mm:ss"` → 14:30:15  
- `"iso"` → 2024-12-06T14:30:15.000Z
- `"unix"` → 1733493015

### @INPUT - Stdin and Environment Data

Access data from stdin or environment variables:

```mlld
@import { config, data } from @INPUT
@import { PATH, HOME } from @INPUT

Config: @add @config
Current PATH: @add @PATH
```

**How @INPUT works:**
- If stdin contains JSON, imports fields as variables
- Environment variables are also available
- Non-JSON stdin available as `content` field

### @DEBUG - Environment Information

Access debugging information about your mlld environment:

```mlld
@import { environment } from @DEBUG
@add @environment
```

**Includes:**
- Current variables and their values
- Import history
- File paths and project structure
- Performance statistics

### @PROJECTPATH / @. - Project Files

Access files relative to your project root:

```mlld
@import { readme } from [@./README.md]
@add [@PROJECTPATH/docs/api.md]
@path config = @./config/settings.json
```

**Project root detection:**
1. Directory with `mlld.config.json` (highest priority)
2. Directory with `package.json`  
3. Git repository root (`.git` directory)
4. Directory with `pyproject.toml`, `Cargo.toml`, etc.

## Content Types

Resolvers return different types of content based on what they're resolving:

### Module Content
mlld files with exportable variables and templates:
```mlld
# utils.mld - module content
@text greeting = "Hello"
@exec formatName(name) = run [echo "Name: {{name}}"]
@data config = { "version": "1.0.0" }
```

When imported: `@import { greeting, formatName } from @company/utils`

### Data Content  
Structured data (JSON objects, arrays):
```json
// When @TIME returns data in import context
{
  "YYYY-MM-DD": "2024-01-15",
  "HH:mm:ss": "10:30:45"
}
```

### Text Content
Plain text strings:
```text
// When @PROJECTPATH returns the path as text
/Users/adam/dev/my-project

// When reading a markdown file
Content of README.md file...
```

## Usage Patterns

### Import Context

Use resolvers in imports to bring data into your mlld environment:

```mlld
# Function resolvers - compute data
@import { "MM/DD/YYYY" as usDate } from @TIME
@import { version } from @DEBUG

# Module resolvers - load modules  
@import { httpUtils } from @company/web-toolkit
@import { validation } from @acme/common

# Path resolvers - load file content
@import { apiDocs } from [@./docs/api.md]
```

### Path Context

Use path resolvers in file paths (only supported by path-type resolvers):

```mlld
@add [@./README.md]                    # ✅ PROJECTPATH supports paths
@path docs = @PROJECTPATH/documentation # ✅ PROJECTPATH supports paths  

@add [@TIME/something]                 # ❌ TIME doesn't support paths
@path config = @INPUT/file.json        # ❌ INPUT doesn't support paths
```

### Variable Context

When used as a bare variable, resolvers return their default value:

```mlld
@add @TIME          # → "2024-01-15T10:30:00Z" (current ISO timestamp)
@add @PROJECTPATH   # → "/Users/adam/dev/my-project" (project root path)

@text now = @TIME   # Store current time in variable
@text root = @PROJECTPATH  # Store project path in variable
```

### Context-Dependent Behavior

The same resolver can behave differently based on how it's used:

```mlld
# @PROJECTPATH as variable - returns the path
@text projectRoot = @PROJECTPATH
@add ::Project is at: {{projectRoot}}::
# Output: Project is at: /Users/adam/dev/my-project

# @PROJECTPATH in path context - reads file content  
@add [@PROJECTPATH/README.md]
# Output: (contents of README.md)

# @TIME as variable - returns ISO timestamp
@text currentTime = @TIME  
# currentTime = "2024-01-15T10:30:00Z"

# @TIME in import context - returns structured data
@import { "YYYY-MM-DD" as date } from @TIME
# date = "2024-01-15"
```

## How Resolvers Are Found

When mlld encounters an @ reference like `@TIME`, `@local/module`, or `@author/package`:

1. **Configured prefixes** (from mlld.lock.json)
   - Checks your configured prefixes like `@local/`, `@docs/`, `@company/`
   - These prefixes map to resolver types (LOCAL, GITHUB, REGISTRY, etc.)
   - Longest matching prefix wins
   
2. **Built-in resolvers** 
   - If no prefix matches, checks for built-in resolver names
   - Matches `@TIME`, `@DEBUG`, `@INPUT`, `@PROJECTPATH`, etc.
   - These ARE the resolver, not prefixes (no trailing /)
   - Case-insensitive (`@time` also works)
   
3. **Priority-based fallback**
   - Each resolver's `canResolve()` method is checked in priority order
   - REGISTRY resolver (priority 10) handles `@author/module` patterns by looking them up in module registries
   - This is how public module lookups work

**Important distinction**:
- `@local/` is a PREFIX that uses the LOCAL resolver
- `@NOW` is a BUILT-IN RESOLVER (not a prefix)
- Prefixes always end with `/`, built-in resolvers don't

## Path Aliases and Custom Resolvers

### Local Path Aliases

The most common custom resolver use case is creating path aliases for local directories. Use `mlld alias` to set these up:

```bash
# Create project-specific alias
mlld alias --name shared --path ../shared-modules

# Create global alias (available to all projects)
mlld alias --name desktop --path ~/Desktop --global

# Now you can use:
# @import { utils } from @shared/utils
# @add [@desktop/notes.md]
```

**How it works:**
- Creates a prefix configuration in `mlld.lock.json`
- Maps your prefix (e.g., `@shared/`) to the LOCAL resolver
- The prefix "opens the door" to files in that directory
- The LOCAL resolver "provides the data" by reading files
- mlld finds `mlld.lock.json` by searching up from current directory

### Quick Setup Commands

Set up common resolver patterns with interactive wizards:

```bash
# Complete setup wizard (recommended for first-time setup)
mlld setup

# Set up GitHub private modules
mlld setup --github

# Set up local directory aliases
mlld setup --local
```

### Manual Configuration

You can also configure resolvers manually in `mlld.lock.json`:

```json
{
  "config": {
    "resolvers": {
      "prefixes": [
        {
          "prefix": "@docs/",      // The door to open
          "resolver": "LOCAL",     // The provider behind the door
          "config": {
            "basePath": "./documentation",
            "readonly": true
          }
        },
        {
          "prefix": "@company/",
          "resolver": "REGISTRY",  // Registry resolver for modules only
          "config": {
            "registryUrl": "https://registry.company.com"
          }
        }
      ]
    }
  }
}
```

**Prefix configuration explained:**
- `prefix`: The @ prefix that opens access (must end with `/`)
- `resolver`: The resolver type that provides the data (LOCAL, GITHUB, HTTP, REGISTRY, etc.)
- `config`: Configuration passed to the resolver (basePath, auth tokens, etc.)

### Resolver Types

mlld includes several resolver types:

**File/Content Resolvers** (configured with prefixes):
- **LOCAL**: Maps prefixes to local filesystem paths (can handle any file type)
- **GITHUB**: Accesses files from GitHub repositories (can handle any file type)
- **HTTP**: Fetches content from HTTP/HTTPS URLs (can handle any file type)

**Module Registry Resolver**:
- **REGISTRY**: Special resolver that ONLY provides modules from module registries
  - Cannot read arbitrary files
  - Only returns validated mlld modules
  - Used for `@author/module` patterns

**Built-in Function Resolvers** (no prefix needed):
- **TIME**: Provides formatted timestamps (`@TIME`, not `@time/`)
- **DEBUG**: Provides environment information (`@DEBUG`, not `@debug/`)
- **INPUT**: Provides stdin/environment data (`@INPUT`, not `@input/`)
- **PROJECTPATH**: Provides project-relative paths (`@PROJECTPATH` or `@.`)

**Key distinction**: REGISTRY is the only resolver restricted to modules - all others can return any content type.

### Fuzzy Path Matching

Local path resolvers support smart fuzzy matching by default, making it easier to reference files without worrying about exact capitalization or spacing:

#### Case-Insensitive Matching
```mlld
# All of these reference the same file: ~/Desktop/My Projects/Todo List.md
@import { tasks } from @desktop/my-projects/todo-list
@import { tasks } from @desktop/MY-PROJECTS/TODO-LIST
@import { tasks } from @desktop/My-Projects/Todo-List
```

#### Whitespace Normalization
Spaces, dashes, and underscores are treated as interchangeable:
```mlld
# File: ~/Desktop/My Important File.md
@add @desktop/my-important-file     # spaces → dashes
@add @desktop/my_important_file     # spaces → underscores
@add @desktop/My-Important-File     # original spacing preserved
```

#### Ambiguity Resolution
When multiple files match, mlld shows all possibilities:
```
Error: Ambiguous path 'test-file' matches multiple files:
  - test-file.md (exact match)
  - test_file.md (whitespace match)
  - TEST_FILE.md (fuzzy match)

Please use a more specific path.
```

#### Configuration
Control fuzzy matching behavior in your resolver config:
```json
{
  "@desktop": {
    "prefix": "@desktop/",
    "resolver": "LOCAL",
    "type": "input",
    "config": {
      "basePath": "~/Desktop",
      "fuzzyMatch": {
        "enabled": true,         // default: true
        "caseInsensitive": true, // default: true
        "normalizeWhitespace": true // default: true
      }
    }
  }
}
```

Or disable entirely:
```json
{
  "fuzzyMatch": false  // Exact matches only
}
```

### Common Resolver Patterns

#### GitHub Private Modules
Access private repositories using the GITHUB resolver:

```json
{
  "config": {
    "resolvers": {
      "prefixes": [
        {
          "prefix": "@company/",
          "resolver": "GITHUB",
          "config": {
            "repository": "company/private-modules",
            "branch": "main",
            "basePath": "modules"
          }
        }
      ]
    }
  }
}
```

**Usage:**
```mlld
# First authenticate: mlld auth login
@import { httpClient } from @company/web-utils
@import { validation } from @company/common
```

#### Shared Module Libraries
Create a shared directory accessible from multiple projects:

```bash
# Global alias for shared modules
mlld alias --name lib --path ~/Development/shared-libs --global

# Now any project can use:
@import { dateUtils, stringUtils } from @lib/utils
@import { ApiClient } from @lib/networking
```


## Name Protection

Resolver names are protected to prevent conflicts:

```mlld
@text TIME = "my time"  # ❌ ERROR: 'TIME' reserved for resolver
@text time = "my time"  # ✅ OK - only ALL CAPS names are reserved
@text timestamp = "my time"  # ✅ OK

@import { "format" as time } from @TIME     # ✅ OK - lowercase aliases allowed
@import { "format" as TIME } from @TIME     # ❌ ERROR: 'TIME' reserved
```

**Rules:**
- Built-in resolver names (TIME, DEBUG, INPUT, PROJECTPATH) are always reserved
- Custom resolver names become reserved when registered  
- Only ALL CAPS variants are protected for global resolvers
- Variable names and import aliases cannot use reserved names

## Troubleshooting

### Common Issues

**"User 'local' not found in registry"**
- **Cause**: Running mlld from a subdirectory without mlld.lock.json in view
- **Fix**: Run from project root or ensure mlld.lock.json exists
- **Note**: mlld searches parent directories for mlld.lock.json (like npm)

**"Access denied for reference: @local/module"**
- **Cause**: The module file doesn't exist at the configured path
- **Fix**: Check that the file exists and the basePath is correct
- **Different from**: "not found in registry" - here the prefix IS configured

**File not found with fuzzy matching**
- mlld will suggest similar files when fuzzy matching is enabled
- Check for typos in your file path
- Use more specific paths to avoid ambiguity

### Error Messages

Resolver errors identify which resolver failed:

```
TimeResolver failed: Invalid format string 'XYZ'
Available formats: YYYY-MM-DD, HH:mm:ss, iso, unix

LocalResolver failed: File not found: utils.mld
Did you mean:
  - utils.mlld.md
  - string.mld.md

ProjectPathResolver failed: Path outside project directory: ../../../etc/passwd
Paths must be within the project root
```

## Advanced Features

### TTL and Caching

Custom resolvers can specify caching behavior using mlld's TTL format:

```json
{
  "@weather": {
    "type": "function",
    "command": "python", 
    "args": ["./weather.py"],
    "ttl": "15m"
  }
}
```

**TTL Format Options:**
- `"static"` - Cache indefinitely  
- `"live"` - Always refresh (no caching)
- `"7200"` - 7200 seconds
- `"1h"` - 1 hour
- `"30m"` - 30 minutes  
- `"7d"` - 7 days
- `"2w"` - 2 weeks

Function resolvers like @DEBUG use TTL caching to avoid expensive recomputations.

### Multiple Import Patterns

Some resolvers support multiple import patterns:

```mlld
# TIME resolver examples
@import { iso } from @TIME                    # Common format names
@import { "YYYY-MM-DD" as date } from @TIME   # Custom format strings
@import { "HH:mm" as time } from @TIME        # Multiple custom formats

# Path resolver examples  
@import { readme } from [@docs/README.md]     # Single file
@import { api, tutorial } from [@docs/]       # Multiple files (if supported)
```

## Best Practices

### Resolver Naming
- Use descriptive names: `@docs`, `@company`, `@weather`
- Follow your organization's naming conventions
- Avoid generic names like `@api`, `@data` that could conflict

### Security
- Use environment variables for sensitive data (API tokens, credentials)  
- Validate all inputs in custom resolvers
- Custom resolvers run with the same permissions as mlld - they are not sandboxed
- Only install custom resolvers from sources you trust
- Custom resolvers have full access to filesystem and network

### Performance  
- Use TTL caching for expensive operations
- Implement lazy loading where possible
- Consider batch operations for multiple imports

### Error Messages
- Provide helpful error messages with context
- Include suggestions for fixing common issues
- Log errors appropriately for debugging