# mlld Resolver Architecture

This document explains mlld's unified resolver system, which handles all @ references in both import and path contexts through a priority-based, extensible architecture.

## Core Concepts

### Unified @ Reference Resolution

All @ references in mlld (imports, paths, etc.) are resolved through the same resolver system:

```mlld
@import { "YYYY-MM-DD" as date } from @TIME    # Function resolver
@add [@./README.md]                            # Path resolver  
@import { utils } from @company/toolkit        # Module resolver
@path docs = @PROJECTPATH/documentation        # Path resolver
```

The resolver system determines whether `@identifier` refers to a resolver or a variable, then routes accordingly.

### Resolver Types

mlld supports three types of resolvers, each serving different use cases:

#### Function Resolvers
Compute data dynamically and can accept parameters via import selections or path segments.

- **@TIME**: Dynamic timestamp formatting
- **@DEBUG**: Environment inspection with configurable detail levels
- **@INPUT**: Stdin/environment variable access

```mlld
@import { "YYYY-MM-DD" as date, "HH:mm:ss" as time } from @TIME
@import { config, data } from @INPUT
```

#### Module Resolvers  
Resolve module references to specific content sources (registries, private repositories).

- **@author/module**: Public registry modules
- **@company**: Private module registries
- **Custom registries**: Organization-specific module sources

```mlld
@import { httpUtils } from @company/web-toolkit
@import { validation } from @acme/common-utils
```

#### Path Resolvers
Map @ prefixes to filesystem locations, enabling path-based access with variable interpolation.

- **@PROJECTPATH** / **@.**: Project root directory
- **@docs**: Documentation directory
- **@config**: Configuration directory

```mlld
@add [@./src/components/Button.tsx]
@path readme = @docs/getting-started.md
```

### Resolver Capabilities

Each resolver declares its capabilities to determine valid usage contexts:

```typescript
interface ResolverCapabilities {
  supportsImports: boolean;  // Can be used in @import from @resolver
  supportsPaths: boolean;    // Can be used in [@resolver/path/segments]
  type: 'function' | 'module' | 'path';
  ttl?: TTLOption;          // Caching configuration
  priority: number;         // Resolution priority (lower = higher priority)
}
```

**Examples:**
- `@TIME`: `{ supportsImports: true, supportsPaths: false, type: 'function' }`
- `@PROJECTPATH`: `{ supportsImports: true, supportsPaths: true, type: 'path' }`
- `@company`: `{ supportsImports: true, supportsPaths: false, type: 'module' }`

### Name Protection System

Resolver names are protected to prevent variable/resolver conflicts:

```mlld
@text TIME = "my time"  # ❌ ERROR: 'TIME' is reserved for resolver
@import { "format" as time } from @TIME  # ❌ ERROR: 'time' is reserved
@import { "format" as timestamp } from @TIME  # ✅ OK
```

**Protection Rules:**
1. Built-in resolver names (TIME, DEBUG, INPUT, PROJECTPATH, .) are reserved
2. Custom resolver names become reserved when registered
3. Both uppercase and lowercase variants are protected
4. Variable creation and import aliases are validated against reserved names

## Technical Architecture

### MCP Protocol Integration

mlld resolvers use the Model Context Protocol (MCP) for standardized communication:

**Built-in resolvers** implement the MCP interface internally:
```typescript
class TimeResolver implements MCPResolver {
  async callTool(name: string, args: any): Promise<any> {
    if (name === 'formatTimestamp') {
      return this.formatTimestamp(args.format);
    }
  }
}
```

**Custom resolvers** are external MCP servers:
```json
{
  "resolvers": {
    "@company": {
      "command": "node",
      "args": ["./resolvers/company-modules.js"],
      "env": { "API_TOKEN": "${COMPANY_API_TOKEN}" }
    }
  }
}
```

### TTL and Caching

mlld's resolver system uses a generic TTL service with pluggable cache strategies:

```typescript
interface TTLOption {
  type: 'duration' | 'special';
  value?: number;        // 5, 10, etc.
  unit?: string;         // 's', 'm', 'h', 'd', 'w'
  seconds?: number;      // computed value
}

// Special values:
// { type: 'special', value: 0 }  = 'live' (always fresh)
// { type: 'special', value: -1 } = 'static' (cache forever)

// TTL Format Examples:
// "static" - cache indefinitely
// "live" - always refresh  
// "7200" - 7200 seconds
// "1h" - 1 hour
// "30m" - 30 minutes
// "7d" - 7 days
// "2w" - 2 weeks
```

**TTL Architecture:**
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

// Resolver cache strategy
class ResolverCacheKeyStrategy implements CacheKeyStrategy {
  shouldCache(): boolean { return true; }
  generateKey(input: { resolver: string, args: any }): string {
    return `resolver:${input.resolver}:${JSON.stringify(input.args)}`;
  }
}
```

**TTL Integration:**
- Function resolvers cache expensive computations (@DEBUG with 5m TTL)
- Module resolvers inherit existing module cache + hash validation
- Path resolvers use filesystem mtime for cache invalidation
- Custom resolvers declare TTL needs in configuration
- URL-specific caching logic separated from generic TTL service

### Priority-Based Resolution

Resolvers are resolved in strict priority order (lower number = higher priority):

```
Priority 1: Built-in resolvers (TIME, DEBUG, INPUT, PROJECTPATH)
Priority 2: Custom resolvers (by configured priority)
Priority 3: Variable lookup fallback
```

**Resolution Algorithm:**
```typescript
async function resolveAtReference(identifier: string, pathSegments: string[]): Promise<ResolverContent> {
  // Check resolvers in priority order
  for (const resolver of sortedResolvers) {
    if (resolver.canResolve(`@${identifier}`)) {
      return await resolver.resolve(`@${identifier}/${pathSegments.join('/')}`);
    }
  }
  
  // Fallback to variable lookup
  const variable = env.getVariable(identifier);
  if (variable) {
    return interpolateVariableInPath(variable, pathSegments);
  }
  
  throw new Error(`Unknown resolver or variable: @${identifier}`);
}
```

### Path vs Import Context

The same resolver can behave differently in import vs path contexts:

**Import Context:** `@import { x } from @TIME`
- Resolver returns virtual module with requested exports
- Import evaluation extracts specific variables
- Result: variables added to environment

**Path Context:** `@add [@PROJECTPATH/file.md]`  
- Resolver resolves to file content
- Path evaluation includes the content
- Result: content added to output

**Capability Validation:**
```typescript
function validateResolverUsage(resolver: Resolver, context: 'import' | 'path') {
  if (context === 'import' && !resolver.capabilities.supportsImports) {
    throw new Error(`Resolver '${resolver.name}' cannot be used in imports`);
  }
  if (context === 'path' && !resolver.capabilities.supportsPaths) {
    throw new Error(`Resolver '${resolver.name}' cannot be used in paths`);
  }
}
```

## Integration Points

### Grammar Integration

The grammar treats @ references uniformly:

```peggy
PathContent = PathBaseVariable RestOfPath*
PathBaseVariable = "@" identifier:BaseIdentifier

ImportSource = BracketPath / AtResolver
AtResolver = "@" identifier:BaseIdentifier
```

**Evaluation distinguishes context:**
- Path evaluation: check resolver capabilities, call `resolveForPath()`
- Import evaluation: check resolver capabilities, call `resolveForImport()`

**Path Segment Handling:**
```typescript
// Utility for joining path segments from grammar
function joinPathSegments(segments: string[]): string {
  // Handle cases where segments might be split on '.' incorrectly
  // e.g., ["docs", "api", "md"] should become "docs/api.md"
  return segments.join('/');
}
```

### ResolverManager Enhancement

The existing ResolverManager is enhanced with:

```typescript
class EnhancedResolverManager extends ResolverManager {
  private resolverCapabilities: Map<string, ResolverCapabilities>;
  private ttlCacheService: TTLCacheService;
  
  registerResolver(resolver: Resolver, capabilities: ResolverCapabilities): void;
  async resolveForContext(ref: string, context: 'import' | 'path'): Promise<ResolverContent>;
  checkResolverName(name: string): boolean; // Name protection
}
```

### Environment Integration

Environment.ts is simplified by moving special cases to resolvers:

**Before:**
```typescript
// Environment.ts had special logic for:
initializeReservedVariables() // TIME, DEBUG, INPUT, PROJECTPATH
createInputValue()           // Stdin merging logic
getProjectPath()            // Project root detection
```

**After:**
```typescript
// Environment.ts just has:
async resolveAtReference(identifier: string, segments: string[]): Promise<any> {
  return this.resolverManager.resolveForContext(`@${identifier}`, 'variable');
}
```

### Error Attribution

Errors use a standardized format with clear resolver identification:

```typescript
class ResolverError extends Error {
  constructor(
    public resolverName: string,
    public operation: string,
    public input: any,
    public originalError: Error,
    public suggestions?: string[]
  ) {
    super(`${resolverName}Resolver failed: ${originalError.message}`);
  }
  
  toDisplayString(): string {
    let msg = `${this.resolverName}Resolver failed: ${this.originalError.message}`;
    if (this.input) {
      msg += `\nInput: ${JSON.stringify(this.input)}`;
    }
    if (this.suggestions?.length) {
      msg += `\nSuggestions: ${this.suggestions.join(', ')}`;
    }
    return msg;
  }
}
```

**Example error messages:**
```
TimeResolver failed: Invalid format string 'XYZ'
Input: {"format": "XYZ"}
Suggestions: YYYY-MM-DD, HH:mm:ss, iso, unix

CompanyResolver failed: Authentication token expired
Input: {"moduleRef": "@company/utils"}
Suggestions: Check your COMPANY_API_TOKEN environment variable
```

## Built-in Resolver Implementations

### TIME Resolver
```typescript
class TimeResolver implements Resolver {
  name = 'TIME';
  capabilities = { supportsImports: true, supportsPaths: false, type: 'function' };
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    const now = new Date();
    const exports: Record<string, string> = {};
    
    // requestedFormats contains original format strings, not aliases
    // e.g., @import { "YYYY-MM-DD" as date } → requestedFormats = ["YYYY-MM-DD"]
    for (const format of requestedFormats) {
      exports[format] = this.formatTimestamp(now, format);
    }
    
    return { content: JSON.stringify(exports), /* ... */ };
  }
  
  private formatTimestamp(date: Date, format: string): string {
    switch(format) {
      case 'iso': return date.toISOString();
      case 'unix': return Math.floor(date.getTime() / 1000).toString();
      default: return this.parseCustomFormat(date, format);
    }
  }
}
```

### INPUT Resolver
```typescript
class InputResolver implements Resolver {
  name = 'INPUT';
  capabilities = { supportsImports: true, supportsPaths: false, type: 'function' };
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    const inputData = this.mergeStdinAndEnv();
    
    // Extract only requested fields if specified
    const exports: Record<string, any> = {};
    if (requestedFormats?.length) {
      for (const fieldName of requestedFormats) {
        if (fieldName in inputData) {
          exports[fieldName] = inputData[fieldName];
        } else {
          throw new Error(`Variable '${fieldName}' not found in input data`);
        }
      }
    } else {
      Object.assign(exports, inputData);
    }
    
    return { content: JSON.stringify(exports), /* ... */ };
  }
  
  private mergeStdinAndEnv(): Record<string, any> {
    // Consolidate stdin + environment variable logic
    const result: Record<string, any> = {};
    
    // Add environment variables
    Object.assign(result, process.env);
    
    // Parse and merge stdin content
    if (this.stdinContent) {
      try {
        const stdinData = JSON.parse(this.stdinContent);
        if (typeof stdinData === 'object' && stdinData !== null) {
          Object.assign(result, stdinData);
        } else {
          result.content = stdinData;
        }
      } catch {
        result.content = this.stdinContent;
      }
    }
    
    return result;
  }
}
```

### PROJECTPATH Resolver
```typescript
class ProjectPathResolver implements Resolver {
  name = 'PROJECTPATH';
  capabilities = { supportsImports: true, supportsPaths: true, type: 'path' };
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    // Return project path info as JSON
    const projectPath = await this.findProjectRoot();
    return {
      content: JSON.stringify({ projectPath }),
      contentInfo: { path: '@PROJECTPATH', /* ... */ }
    };
  }
  
  async resolveForPath(ref: string, pathSegments: string[]): Promise<ResolverContent> {
    const projectRoot = await this.findProjectRoot();
    const fullPath = path.join(projectRoot, joinPathSegments(pathSegments));
    return this.readFile(fullPath);
  }
  
  private async findProjectRoot(): Promise<string> {
    // Project root detection:
    // 1. Directory with mlld.config.json (highest priority)
    // 2. Directory with package.json  
    // 3. Git repository root (.git directory)
    // 4. Directory with pyproject.toml, Cargo.toml, etc.
  }
}
```

## Custom Resolver Development

Custom resolvers are MCP servers that expose specific tools:

```javascript
// company-resolver.js - MCP server
class CompanyResolver {
  async listTools() {
    return [
      {
        name: "resolveModule",
        description: "Resolve a company module reference",
        inputSchema: {
          type: "object",
          properties: {
            moduleRef: { type: "string" },
            imports: { type: "array", items: { type: "string" } }
          }
        }
      }
    ];
  }
  
  async callTool(name, args) {
    if (name === "resolveModule") {
      return await this.fetchCompanyModule(args.moduleRef, args.imports);
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
- MCP protocol enables rich ecosystem integration
- Custom resolvers support organization-specific needs

### Performance
- Priority-based resolution minimizes lookup time
- TTL caching prevents redundant expensive operations
- Capability checking prevents invalid usage attempts

### Developer Experience
- Clear mental model: @ references → resolvers
- Comprehensive error messages with resolver attribution
- Consistent configuration patterns across resolver types