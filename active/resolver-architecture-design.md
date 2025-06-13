# Unified Resolver Architecture for mlld Import System

## Overview

Implement a unified resolver architecture that consolidates all @ references (imports, paths, reserved variables) into a single, extensible priority-based system. This replaces the current patchwork of special cases with a clean, consistent approach.

## Problem Statement

Currently, mlld handles @ references through multiple disconnected systems:
- Reserved variables (`@TIME`, `@INPUT`, `@DEBUG`, `@PROJECTPATH`) have special initialization logic
- Module imports (`@author/module`) use the ResolverManager
- File paths use variable interpolation with special cases
- Each system has different error handling, caching, and capabilities

This creates architectural inconsistency, maintenance complexity, and limits extensibility.

## Proposed Solution

### Unified Resolver System

All @ references are resolved through a single priority-based resolver system:

**Priority Order (lower number = higher priority):**
1. Built-in resolvers (TIME, DEBUG, INPUT, PROJECTPATH)
2. Custom resolvers (by configured priority)
3. Variable lookup (fallback)

### Resolver Types

#### Function Resolvers
Compute data dynamically and can accept parameters via import selections:

```mlld
@import { "YYYY-MM-DD" as date, "HH:mm:ss" as time } from @TIME
@import { config, data } from @INPUT
```

**Built-in function resolvers:**
- `@TIME` - Dynamic timestamp formatting with custom format strings
- `@DEBUG` - Environment inspection with TTL caching
- `@INPUT` - Stdin/environment variable access

#### Module Resolvers  
Resolve module references to specific content sources:

```mlld
@import { httpUtils } from @company/web-toolkit
@import { validation } from @acme/common-utils
```

#### Path Resolvers
Map @ prefixes to filesystem locations:

```mlld
@add [@./README.md]
@path config = @PROJECTPATH/documentation
```

**Built-in path resolvers:**
- `@PROJECTPATH` / `@.` - Project root directory with auto-detection

### Resolver Capabilities

Each resolver declares its capabilities to determine valid usage contexts:

```typescript
interface ResolverCapabilities {
  supportsImports: boolean;  // Can be used in @import from @resolver
  supportsPaths: boolean;    // Can be used in [@resolver/path/segments]
  type: 'function' | 'module' | 'path';
  ttl?: TTLOption;          // Caching configuration
  priority: number;         // Resolution priority
}
```

**Examples:**
- `@TIME`: `{ supportsImports: true, supportsPaths: false, type: 'function' }`
- `@PROJECTPATH`: `{ supportsImports: true, supportsPaths: true, type: 'path' }`

### Name Protection System

Resolver names are protected to prevent conflicts:

```mlld
@text TIME = "my time"  # ❌ ERROR: 'TIME' reserved for resolver
@import { "format" as TIME } from @TIME  # ❌ ERROR: 'TIME' reserved
@import { "format" as timestamp } from @TIME  # ✅ OK
```

**Protection Rules:**
- Built-in resolver names (TIME, DEBUG, INPUT, PROJECTPATH) are reserved
- Custom resolver names become reserved when registered
- Both uppercase and lowercase variants are protected
- Variable creation and import aliases are validated against reserved names

### Interface Design

**Context-Aware Resolution:**
```typescript
interface Resolver {
  resolveForImport?(ref: string, requestedFormats: string[]): Promise<ResolverContent>;
  resolveForPath?(ref: string, pathSegments: string[]): Promise<ResolverContent>;
}
```

**Parameter Passing:**
- Import context: `requestedFormats` contains original format strings (not aliases)
- Path context: `pathSegments` contains path components after the resolver prefix

### TTL and Caching Integration

Reuse existing TTL infrastructure with pluggable cache strategies:

```typescript
interface CacheKeyStrategy {
  generateKey(input: any): string;
  shouldCache(input: any): boolean;
}

class TTLCacheService {
  constructor(
    private lockFile: LockFile,
    private contentCache: Cache, 
    private keyStrategy: CacheKeyStrategy
  ) {}
}
```

**TTL Format Support:**
- `"static"` - cache indefinitely
- `"live"` - always refresh  
- `"7200"` - 7200 seconds
- `"1h"`, `"30m"`, `"7d"`, `"2w"` - duration formats

### Error Attribution

Standardized error format with clear resolver identification:

```typescript
class ResolverError extends Error {
  constructor(
    public resolverName: string,
    public operation: string,
    public input: any,
    public originalError: Error,
    public suggestions?: string[]
  ) {}
}
```

**Example error messages:**
```
TimeResolver failed: Invalid format string 'XYZ'
Input: {"format": "XYZ"}
Suggestions: YYYY-MM-DD, HH:mm:ss, iso, unix
```

### Custom Resolver Support

Custom resolvers use Model Context Protocol (MCP) for standardized communication:

```json
{
  "resolvers": {
    "@docs": {
      "type": "path",
      "command": "mlld-path-resolver",
      "args": ["--base-path", "./documentation"],
      "capabilities": {
        "supportsImports": true,
        "supportsPaths": true
      }
    }
  }
}
```

## Benefits

### Architectural Consistency
- Single resolution system for all @ references
- Consistent error handling and attribution
- Unified caching and TTL management

### Extensibility  
- New resolvers add capabilities without core changes
- MCP protocol enables ecosystem integration
- Custom resolvers support organization-specific needs

### Performance
- Priority-based resolution minimizes lookup time
- TTL caching prevents redundant expensive operations
- Capability checking prevents invalid usage attempts

### Developer Experience
- Clear mental model: @ references → resolvers
- Comprehensive error messages with resolver attribution
- Consistent configuration patterns across resolver types

## Grammar Simplification

The unified approach dramatically simplifies import grammar:

**Before:** Multiple special cases for @INPUT, @author/module, URLs, etc.
**After:** Just two patterns:
- Import Path: `@import [...] or @import {...} from [...]`  
- Import Resolver: `@import @... or @import {...} from @...`

Path segments are handled via utility function to avoid grammar complexity with file extensions.

## Implementation Considerations

### Backward Compatibility
- Maintain existing import syntax and behavior
- Variable fallback preserves current functionality
- Existing module imports continue to work unchanged

### Migration Strategy
- Convert existing reserved variable logic to built-in resolvers
- Enhance existing ResolverManager with capabilities and priority
- Remove special cases in Environment.ts and import evaluation

### Testing Approach
- Comprehensive unit tests for each built-in resolver
- Integration tests for resolver priority and capability validation  
- End-to-end tests covering all import patterns

## Next Steps

This issue establishes the architectural foundation. Implementation will follow in phases:

1. **Core Infrastructure** - Enhanced ResolverManager, TTL service, interfaces
2. **Built-in Resolvers** - Convert TIME, DEBUG, INPUT, PROJECTPATH to resolvers
3. **Environment Integration** - Remove special cases, add resolver routing
4. **Grammar Updates** - Add validation, remove deprecated patterns
5. **Custom Resolver Support** - MCP integration, configuration loading

Each phase maintains backward compatibility while incrementally moving toward the unified architecture.