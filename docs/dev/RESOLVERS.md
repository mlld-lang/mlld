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
  // I/O operations supported
  io: {
    read: boolean;
    write: boolean;
    list: boolean;
  };
  
  // Contexts where this resolver can be used
  contexts: {
    import: boolean;   // Can be used in @import from @resolver
    path: boolean;     // Can be used in [@resolver/path/segments]
    output: boolean;   // Can be used with @output directive
  };
  
  // Content types this resolver can return
  supportedContentTypes: ('module' | 'data' | 'text')[];
  
  // Default content type when used as a bare variable
  defaultContentType: 'module' | 'data' | 'text';
  
  // Resolution priority (lower = higher priority)
  priority: number;
  
  // Caching configuration
  cache?: CacheConfig;
}
```

**Examples:**
- `@TIME`: 
  ```typescript
  {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['text', 'data'],
    defaultContentType: 'text',  // Returns ISO timestamp as text
    priority: 1
  }
  ```
- `@PROJECTPATH`: 
  ```typescript
  {
    io: { read: true, write: false, list: true },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['text'],  // Path string or file contents
    defaultContentType: 'text',  // Returns project path as text
    priority: 1
  }
  ```
- `@company`: 
  ```typescript
  {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['module'],
    defaultContentType: 'module',
    priority: 10
  }
  ```

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

### Resolution Architecture

mlld uses a dual-mechanism approach for resolver lookup, optimized for performance:

1. **Direct Resolver Lookup** - For built-in resolvers (TIME, DEBUG, INPUT, PROJECTPATH)
   - These are always available as part of the core
   - Registered directly by name in ResolverManager
   - Fast lookup without registry overhead

2. **Registry-Based Lookup** - For configured prefixes and custom resolvers
   - Maps prefixes like `@company/`, `@local/`, `@docs/` to resolver instances
   - Allows multiple prefixes to use the same resolver (e.g., both `@.` and `@PROJECTPATH`)
   - Supports configuration per prefix (basePath, authentication, etc.)

This design avoids unnecessary registry lookups for core functionality while maintaining flexibility for custom configurations.

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
  // 1. Check configured registries first (for custom prefixes)
  for (const registry of registries) {
    if (ref.startsWith(registry.prefix)) {
      const resolver = resolvers.get(registry.resolver);
      if (resolver && resolver.canResolve(ref)) {
        return resolver.resolve(ref, registry.config);
      }
    }
  }
  
  // 2. Check direct resolver lookup (for built-ins)
  const directResolver = resolvers.get(identifier.toUpperCase());
  if (directResolver && directResolver.canResolve(ref)) {
    return directResolver.resolve(ref);
  }
  
  // 3. Fallback to variable lookup
  const variable = env.getVariable(identifier);
  if (variable) {
    return interpolateVariableInPath(variable, pathSegments);
  }
  
  throw new Error(`Unknown resolver or variable: @${identifier}`);
}
```

### Context-Dependent Resolution

Resolvers behave differently based on the context in which they're used:

#### Variable Context
`@add @TIME` or `@text timestamp = @TIME`
- Returns the resolver's default value
- Uses `defaultContentType` from capabilities
- Examples:
  - `@TIME` → "2024-01-15T10:30:00Z" (text)
  - `@PROJECTPATH` → "/Users/adam/dev/mlld" (text)
  - `@DEBUG` → { variables: {...}, ... } (data)

#### Import Context
`@import { x } from @TIME`
- Resolver returns structured content based on requested imports
- Content type must match what's expected (modules return 'module', etc.)
- Import evaluation extracts specific variables

#### Path Context
`@add [@PROJECTPATH/file.md]`
- Resolver resolves the full path and returns file content
- Content type determined by file type or content
- Only resolvers with `contexts.path: true` are allowed

### Content Type Handling

```typescript
interface ResolverContent {
  content: string;
  contentType: 'module' | 'data' | 'text';  // What kind of content this is
  metadata?: {
    source: string;
    timestamp: Date;
    // ... other metadata
  };
}
```

**Content Type Detection:**
```typescript
// In LocalResolver - supports mixed content types
async resolve(ref: string, options?: ResolverOptions): Promise<ResolverContent> {
  const content = await this.readFile(ref);
  
  // Detect content type based on file extension or content
  let contentType: 'module' | 'data' | 'text';
  if (ref.endsWith('.mld') || ref.endsWith('.mlld')) {
    contentType = 'module';
  } else if (ref.endsWith('.json')) {
    contentType = 'data';
  } else {
    // Try to parse as mlld to check for module exports
    try {
      const parsed = await parse(content);
      contentType = hasModuleExports(parsed) ? 'module' : 'text';
    } catch {
      contentType = 'text';
    }
  }
  
  return { content, contentType, ... };
}
```

**Content Type Validation:**
```typescript
// In import evaluator
if (isModuleImport && result.contentType !== 'module') {
  throw new Error(
    `Cannot import from ${source}: expected module content, got ${result.contentType}`
  );
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
class ResolverManager {
  private resolvers: Map<string, Resolver> = new Map();
  private resolversByPriority: Resolver[] = [];
  
  registerResolver(resolver: Resolver): void {
    // Validate capabilities
    if (!resolver.capabilities.supportedContentTypes.length) {
      throw new Error(`Resolver ${resolver.name} must support at least one content type`);
    }
    
    // Register and sort by priority
    this.resolvers.set(resolver.name, resolver);
    this.resolversByPriority.push(resolver);
    this.resolversByPriority.sort((a, b) => 
      a.capabilities.priority - b.capabilities.priority
    );
  }
  
  async resolve(ref: string, options?: ResolverOptions): Promise<ResolutionResult> {
    const { resolver, registry } = await this.findResolver(ref, options?.context);
    
    // Validate context support
    if (options?.context && !this.canResolveInContext(resolver, options.context)) {
      throw new Error(
        `Resolver '${resolver.name}' does not support ${options.context} context`
      );
    }
    
    // Pass context to resolver for context-dependent behavior
    const content = await resolver.resolve(ref, { ...registry?.config, ...options });
    
    // Validate content type
    if (!resolver.capabilities.supportedContentTypes.includes(content.contentType)) {
      throw new Error(
        `Resolver ${resolver.name} returned unsupported content type: ${content.contentType}`
      );
    }
    
    return { content, resolverName: resolver.name, ... };
  }
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
  capabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['text', 'data'],
    defaultContentType: 'text',
    priority: 1
  };
  
  async resolve(ref: string, options?: ResolverOptions): Promise<ResolverContent> {
    // Variable context - return ISO timestamp as text
    if (options?.context === 'variable' || ref === 'TIME') {
      return {
        content: new Date().toISOString(),
        contentType: 'text'
      };
    }
    
    // Import context - return structured data
    if (options?.context === 'import') {
      const now = new Date();
      const exports: Record<string, string> = {};
      
      // Extract requested formats from import
      const formats = options.requestedImports || [];
      for (const format of formats) {
        exports[format] = this.formatTimestamp(now, format);
      }
      
      return {
        content: JSON.stringify(exports),
        contentType: 'data'
      };
    }
    
    throw new Error('TIME resolver only supports variable and import contexts');
  }
  
  private formatTimestamp(date: Date, format: string): string {
    switch(format) {
      case 'iso': return date.toISOString();
      case 'unix': return Math.floor(date.getTime() / 1000).toString();
      case 'YYYY-MM-DD': return date.toISOString().split('T')[0];
      case 'HH:mm:ss': return date.toTimeString().split(' ')[0];
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
  capabilities = {
    io: { read: true, write: false, list: true },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['text'],  // Can return path or file contents
    defaultContentType: 'text',
    priority: 1
  };
  
  async resolve(ref: string, options?: ResolverOptions): Promise<ResolverContent> {
    const projectRoot = await this.findProjectRoot();
    
    // Variable context - return project path as text
    if (options?.context === 'variable' || ref === 'PROJECTPATH') {
      return {
        content: projectRoot,
        contentType: 'text'
      };
    }
    
    // Path context - read file contents
    if (options?.context === 'path' || ref.includes('/')) {
      const relativePath = ref.replace(/^@PROJECTPATH\//, '').replace(/^@\.\//, '');
      const fullPath = path.join(projectRoot, relativePath);
      
      // Security check
      if (!fullPath.startsWith(projectRoot)) {
        throw new Error('Path outside project directory');
      }
      
      const content = await this.fileSystem.readFile(fullPath);
      return {
        content,
        contentType: 'text'  // Could detect based on file type
      };
    }
    
    // Import context - return project info
    if (options?.context === 'import') {
      const exports = {
        path: projectRoot,
        absolute: projectRoot,
        relative: path.relative(process.cwd(), projectRoot),
        basename: path.basename(projectRoot)
      };
      
      return {
        content: JSON.stringify(exports),
        contentType: 'data'
      };
    }
  }
  
  private async findProjectRoot(): Promise<string> {
    // Project root detection logic...
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

## Key Design Principles

### Content Type System
Resolvers declare what types of content they can return:
- **module**: mlld files with exportable variables/templates
- **data**: Structured data (JSON objects/arrays)
- **text**: Plain text content

This enables:
- Validation that module imports actually get modules
- Proper processing based on content type
- Clear error messages when wrong types are used

### Context-Dependent Resolution
The same resolver behaves differently based on usage context:
- **Variable context** (`@TIME`): Returns default value
- **Import context** (`@import from @TIME`): Returns structured exports
- **Path context** (`[@./file]`): Resolves full path and returns content

This provides intuitive behavior while maintaining consistency.

### Unified Path/URL Handling
Files and URLs are treated equally as "paths":
- No artificial distinction between local files and remote URLs
- Same resolver can handle both `./file.mld` and `https://example.com/file.mld`
- Simplifies mental model and implementation

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
- Context-aware behavior matches user expectations