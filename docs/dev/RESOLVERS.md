# mlld Resolver Architecture

This document explains mlld's unified resolver system, which handles all @ references in both import and path contexts through a priority-based, extensible architecture.

## Core Concepts

### Unified @ Reference Resolution

All @ references in mlld (imports, paths, etc.) are resolved through the same resolver system:

```mlld
@import { "YYYY-MM-DD" as date } from @now      # Function resolver
/show <@base/README.md>                         # Path resolver (angle brackets load contents)
@import { utils } from @company/toolkit         # Module resolver
/var @docsRoot = "<@base/docs>"                 # Path string via resolver prefix
```

The resolver system determines whether `@identifier` refers to a resolver or a variable, then routes accordingly.

### Resolver Types

**Important**: Distinguish between resolver TYPE (the implementation class) and PREFIX (the @ reference):
- `LOCAL` is a resolver TYPE (implemented by LocalResolver class)
- `@local/` is a PREFIX that maps to the LOCAL resolver type
- Multiple prefixes can use the same resolver type with different configs

mlld supports three categories of resolvers, each serving different use cases:

#### Function Resolvers
Compute data dynamically and can accept parameters via import selections or path segments.

- **@now**: Dynamic timestamp formatting
- **@debug**: Environment inspection with configurable detail levels
- **@input**: Stdin/environment variable access

```mlld
@import { "YYYY-MM-DD" as date, "HH:mm:ss" as time } from @now
@import { config, data } from @input
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

- **@root**: Project root directory (default built-in)
- **@base**: Current script directory (default built-in)
- Additional prefixes configured via `mlld.lock.json`

```mlld
/show <@base/src/components/Button.tsx>
/var @readme = <@base/docs/getting-started.md>
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
- `@now`: 
  ```typescript
  {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['text', 'data'],
    defaultContentType: 'text',  // Returns ISO timestamp as text
    priority: 1
  }
  ```
- `@base`: 
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
@var @now = "my time"        # ❌ ERROR: 'now' is reserved for resolver
@import { "format" as time } from @now   # ❌ ERROR: 'time' is reserved in this context
@import { "format" as timestamp } from @now  # ✅ OK
```

**Protection Rules:**
1. Built-in resolver names (now, debug, input, base) are reserved
2. Custom resolver names become reserved when registered
3. Variable creation and import aliases are validated against reserved names

## Technical Architecture

### MCP Protocol Integration

mlld resolvers use the Model Context Protocol (MCP) for standardized communication:

**Built-in resolvers** implement the MCP interface internally:
```typescript
class NowResolver implements MCPResolver {
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

The `cached(TTL)` import type provides explicit caching control via time-to-live specifications.

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

All import resolution routes through `ResolverManager.resolve` (core/resolvers/ResolverManager.ts:321-520), which coordinates the following registered resolvers:

**Registered Resolvers** (core/registry/ModuleInstaller.ts:98-104):
- `ProjectPathResolver` - Handles @base and @root prefixes with configured base paths
- `RegistryResolver` - Fetches from mlld registry (modules.json)
- `LocalResolver` - Reads from filesystem (project-relative)
- `GitHubResolver` - Resolves GitHub URLs/repo paths
- `HTTPResolver` - Fetches via HTTP/HTTPS with caching

**Resolution Flow:**

1. **Prefix-Based Lookup** - Primary routing mechanism
   - Checks mlld-config.json prefix configurations
   - Maps prefixes like `@author/`, `@base/`, `@company/` to resolver implementations
   - Each prefix has its own configuration (basePath, authentication, etc.)
   - Example: `@alice/utils` → RegistryResolver, `@base/file` → ProjectPathResolver

2. **Built-in Resolver Lookup** - For built-in function resolvers
   - Direct resolver matching (now, debug, input)
   - These don't use prefixes - they ARE the resolver
   - Example: `@now` → NowResolver

3. **Import Type Modifiers** - Control caching/timing behavior
   - Import types (module/static/live/cached/local) modify how resolved content is cached
   - They do NOT select different resolvers - they modify resolver behavior
   - All types route through the same ResolverManager → resolver flow

**Import Type Behavior:**

Import types control caching and timing, not resolver selection:

```
module      → Standard registry resolution with content-addressed cache
static      → Content embedded in AST at evaluation time
live        → Always fetch fresh, bypass cache
cached(TTL) → Time-based cache with specified TTL
local       → Development mode (scans llm/modules/ directory)
```

When no import type specified, inference rules determine caching behavior based on source patterns.

**Resolution Algorithm:**
```typescript
async function resolveAtReference(identifier: string, pathSegments: string[]): Promise<ResolverContent> {
  // 1. Check configured prefixes first (for custom prefixes)
  for (const prefixConfig of prefixes) {
    if (ref.startsWith(prefixConfig.prefix)) {
      const resolver = resolvers.get(prefixConfig.resolver);
      if (resolver && resolver.canResolve(ref)) {
        return resolver.resolve(ref, prefixConfig.config);
      }
    }
  }
  
  // 2. Check built-in resolver lookup (NOW, DEBUG, INPUT, etc.)
  const builtinResolver = resolvers.get(identifier.toUpperCase());
  if (builtinResolver && builtinResolver.canResolve(ref)) {
    return builtinResolver.resolve(ref);
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
`@add @NOW` or `@text timestamp = @NOW`
- Returns the resolver's default value
- Uses `defaultContentType` from capabilities
- Examples:
  - `@NOW` → "2024-01-15T10:30:00Z" (text)
  - `@PROJECTPATH` → "/Users/adam/dev/mlld" (text)
  - `@DEBUG` → { variables: {...}, ... } (data)

#### Import Context
`@import { x } from @NOW`
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

## Lock File and Prefix Configuration

### Lock File Discovery
mlld searches up the directory tree for `mlld.lock.json`:
- Starts from the current working directory
- Searches parent directories up to the home directory
- Falls back to project indicators (package.json, .git) if no lock file found
- This allows running mlld commands from any project subdirectory

### Prefix Configuration Format
Prefixes in mlld.lock.json map @ prefixes to resolver types:

```json
{
  "config": {
    "resolvers": {
      "prefixes": [               // Maps prefixes to resolvers
        {
          "prefix": "@local/",   // The prefix that opens the door
          "resolver": "LOCAL",   // The resolver that provides the data
          "config": {            // Configuration for this prefix
            "basePath": "./llm/modules",
            "readonly": true
          }
        },
        {
          "prefix": "@company/",
          "resolver": "REGISTRY", // Registry resolver for modules only
          "config": {
            "registryUrl": "https://registry.company.com"
          }
        }
      ]
    }
  }
}
```

### Creating Custom Prefixes
Use `mlld alias` to create prefixes that use the LOCAL resolver:

```bash
# Project-specific alias
mlld alias --name shared --path ../shared-modules

# Global alias (available to all projects)
mlld alias --name desktop --path ~/Desktop --global

# Creates prefix configuration:
# @shared/ → prefix that uses LOCAL resolver with basePath: "../shared-modules"
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

### Error Attribution and Common Issues

#### Error Messages
Errors include resolver identification and helpful context:

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
}
```

#### Common Resolution Errors

**"User 'local' not found in registry"**
- Cause: Running mlld from a subdirectory without mlld.lock.json
- Fix: Ensure mlld.lock.json exists in project root
- Prevention: Lock file discovery will search parent directories

**"ProjectPathResolver requires basePath in configuration"**
- Cause: @PROJECTPATH or @. used without proper registry configuration
- Fix: Check that registries are loaded from lock file
- Prevention: Dynamic project root detection

**"Access denied for reference: @local/module"**
- Cause: Module file doesn't exist at the configured path
- Fix: Create the module file or check the basePath configuration
- Note: Different from "not found in registry" - resolver is configured but file is missing

**Example error messages:**
```
NowResolver failed: Invalid format string 'XYZ'
Input: {"format": "XYZ"}
Suggestions: YYYY-MM-DD, HH:mm:ss, iso, unix

LocalResolver failed: File not found: modules/utils.mld
Did you mean:
  - modules/utils.mld.md
  - modules/string-utils.mld
```

## Built-in Resolver Implementations

### TIME Resolver
```typescript
class NowResolver implements Resolver {
  name = 'NOW';
  capabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['text', 'data'],
    defaultContentType: 'text',
    priority: 1
  };
  
  async resolve(ref: string, options?: ResolverOptions): Promise<ResolverContent> {
    // Variable context - return ISO timestamp as text
    if (options?.context === 'variable' || ref === 'NOW') {
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
    
    throw new Error('NOW resolver only supports variable and import contexts');
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
- **Variable context** (`@NOW`): Returns default value
- **Import context** (`@import from @NOW`): Returns structured exports
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
- Liberal import syntax following Postel's Law (see below)

## Liberal Import Syntax (Postel's Law)

mlld follows Postel's Law ("be liberal in what you accept") for module import syntax. Both quoted and unquoted module references work:

```mlld
// Both of these work identically:
/import { test } from @local/test      // Correct syntax (unquoted)
/import { test } from "@local/test"    // Liberal syntax (quoted) 
```

### Implementation Details

The liberal parsing is implemented surgically in the import path evaluator:

1. **Smart Variable Resolution**: When encountering `@local` in an import path:
   - First attempts to resolve as a variable (for legitimate cases like `@configPath`)
   - If no variable found, assumes it's a module prefix and reconstructs the full path

2. **Context-Specific**: The liberal behavior only applies to import contexts, not general variable interpolation:
   ```mlld
   /import { x } from "@local/test"  // Liberal: becomes @local/test
   /show "@local is: @local"         // Normal: @local interpolated as variable
   ```

3. **Preserves Semantics**: Variable references in import paths still work correctly:
   ```mlld
   /var @configPath = "config.mld"
   /import [@configPath] as @config    // @configPath resolves to a variable
   ```

### Benefits

- **Reduced friction**: Copy/paste from examples with quotes "just works"
- **Fewer error messages**: Less interruption to developer flow  
- **Intuitive behavior**: System figures out user intent
- **Backward compatible**: Existing unquoted syntax continues to work

### Technical Implementation

The logic is in `interpreter/eval/import.ts` where import paths are reconstructed:

```typescript
// Smart prefix detection in import paths
if (pathNodes.length > 0 && pathNodes[0].type === 'VariableReference') {
  const varRef = pathNodes[0];
  const variable = env.getVariable(varRef.identifier);
  
  if (variable) {
    // Real variable reference - use normal interpolation
    importPath = await interpolate(pathNodes, env);
  } else {
    // Variable not found - assume module prefix reference
    const prefix = `@${varRef.identifier}`;
    const remainingPath = await interpolate(pathNodes.slice(1), env);
    importPath = prefix + remainingPath;
  }
}
```

This approach ensures that both legitimate variable references and module prefixes work correctly in import contexts.
