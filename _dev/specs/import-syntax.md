# Import Syntax Specification

Version: 1.1  
Last Updated: 2025-05-30

## Overview

This document specifies the complete import syntax for mlld, including local files, modules, URLs, and stdin.

## Basic Syntax

```mlld
@import { targets } from source (ttl) trust
```

Where:
- `targets` - What to import (variables, or `*` for all)
- `source` - Where to import from
- `(ttl)` - Optional cache time-to-live
- `trust` - Optional trust level (no angle brackets)

## Import Sources

### 1. Local Files (Brackets)
```mlld
# Relative path
@import { config } from [./config.mld]
@import { * } from [../shared/utils.mld]

# Absolute path  
@import { data } from [/home/user/data.mld]

# With options
@import { secrets } from [./secrets.mld] trust never
```

**Rules**:
- Always use brackets `[]` for file paths
- Paths resolved relative to importing file
- No quotes inside brackets

### 2. Registry Modules (@ prefix)
```mlld
# Basic module import
@import { format } from @alice/strings

# Specific version (hash)
@import { api } from @alice/client@f8h4

# With options
@import { risky } from @bob/utils (1h) trust verify

# Import all exports
@import { * } from @alice/helpers
```

**Rules**:
- Module names: `@user/package` or `@user/scope/package`
- Optional version: `@user/package@hash`
- User and package names: lowercase, alphanumeric, hyphens
- Hash: 4+ hex characters
- Extended paths supported: `@alice/tools/cli`, `@company/apps/webapp`

### 3. URLs (Quotes)
```mlld
# HTTPS URL
@import { template } from "https://example.com/template.mld"

# With options  
@import { data } from "https://api.example.com/config.mld" (30m)

# Trust level
@import { script } from "https://sketchy.com/run.mld" trust never
```

**Rules**:
- Always use quotes for URLs
- HTTPS required by default
- Must end in `.mld` or `.mlld`

### 4. Standard Input
```mlld
# Import all from stdin
@import { * } from @input

# Destructure JSON from stdin
@import { name, version } from @input

# With trust
@import { config } from @input trust always
```

**Rules**:
- Special source `@input` (no quotes)
- Supports JSON destructuring
- Useful for piped input
- Legacy syntax `"@stdin"` still supported

## Import Targets

### Named Imports
```mlld
# Single variable
@import { greet } from @alice/utils

# Multiple variables
@import { format, parse, validate } from @alice/strings

# Renamed imports
@import { longVariableName as short } from @bob/helpers
```

### Wildcard Import
```mlld
# Import everything
@import { * } from @alice/utils

# Use imported variables
@add [[{{greet}} {{name}}]]
```

### Namespace Import
```mlld
# Import as namespace (future feature)
@import * as utils from @alice/utils
@add [[{{utils.greet}} {{utils.format(name)}}]]
```

## Security Options

### TTL (Time To Live)
Controls how long content is cached:

```mlld
# Time-based
@import { api } from @service/client (30s)   # 30 seconds
@import { api } from @service/client (5m)    # 5 minutes  
@import { api } from @service/client (1h)    # 1 hour
@import { api } from @service/client (7d)    # 7 days
@import { api } from @service/client (2w)    # 2 weeks

# Special values
@import { live } from @news/feed (live)      # Always fetch fresh
@import { stable } from @alice/lib (static)  # Never refresh (default)
```

### Trust Levels
Controls security verification:

```mlld
# Trust levels
@import { safe } from @alice/utils trust always    # Skip checks
@import { unknown } from @new/module trust verify  # Prompt user (default)
@import { danger } from @hack/tools trust never    # Block import
```

### Combined Options
```mlld
# Both TTL and trust
@import { api } from @service/client (1h) trust verify
@import { data } from "https://api.com/data" (30m) trust always
```

## Resolution Process

### Module Resolution
1. Parse module reference: `@user/package@version`
2. Check lock file for existing resolution
3. Query DNS: `user-package.registry.mlld.ai`
4. Fetch from URL in TXT record
5. Verify content hash
6. Cache locally
7. Update lock file

### File Resolution
1. Resolve path relative to importing file
2. Check if file exists
3. Read file content
4. Process imports recursively

### URL Resolution  
1. Validate URL (HTTPS, allowed domains)
2. Check cache with TTL
3. Fetch if needed
4. Verify content type
5. Cache response

## Error Conditions

### Module Not Found
```
Error: Module not found: @alice/typo
Did you mean: @alice/types

Try: mlld search alice
```

### Invalid Syntax
```
Error: Invalid import syntax
  @import greet from @alice/utils
         ^
Expected: @import { greet } from @alice/utils
```

### Security Block
```
Error: Import blocked by security policy
  @import { danger } from @hack/tools trust never

This import has been explicitly marked as untrusted.
```

### Network Error
```
Error: Failed to fetch module @alice/utils
Network error: Connection timeout

The module may be cached locally. Try: mlld ls
```

## Examples

### Common Patterns
```mlld
# Development utilities
@import { log, debug } from @dev/tools trust always

# API clients with refresh
@import { github, gitlab } from @apis/clients (1h)

# Shared configuration
@import { * } from [./config/shared.mld]

# Template library
@import { header, footer } from @company/templates
```

### Security-Conscious Imports
```mlld
# Verify external modules
@import { parse } from @community/parser trust verify

# Never trust certain sources  
@import { exec } from @sketchy/runner trust never

# Always trust internal modules
@import { * } from @company/internal trust always
```

### Dynamic Imports (Future)
```mlld
# Conditional imports
@if {{environment}} == "production"
  @import { prodConfig as config } from [./prod.mld]
@else
  @import { devConfig as config } from [./dev.mld]
@end
```

## Best Practices

1. **Use specific imports** over wildcard when possible
2. **Pin versions** for production dependencies  
3. **Set appropriate TTL** for external data
4. **Document trust decisions** in comments
5. **Group imports** at file top when possible

## Future Extensions

- Dynamic imports
- Lazy imports  
- Import assertions
- Import conditions
- Namespace imports
- Default exports
- Version ranges (e.g., `@alice/utils@^1.0.0`)
- Import aliases for modules