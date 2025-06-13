# mlld Resolver System Implementation Plan

This document outlines the implementation plan for mlld's unified resolver architecture, including specific code changes, phases, and validation steps.

## Phase 1: Core Resolver Infrastructure

### 1.1 Enhance ResolverManager

**File:** `core/resolvers/ResolverManager.ts`

**Changes needed:**
```typescript
interface ResolverCapabilities {
  supportsImports: boolean;
  supportsPaths: boolean; 
  type: 'function' | 'module' | 'path';
  ttl?: TTLOption;
  priority: number;
}

interface ResolverRegistration {
  resolver: Resolver;
  capabilities: ResolverCapabilities;
  name: string;
}

class EnhancedResolverManager extends ResolverManager {
  private resolverRegistrations: ResolverRegistration[] = [];
  private reservedNames: Set<string> = new Set();
  private ttlCacheService: TTLCacheService;
  
  registerResolver(resolver: Resolver, capabilities: ResolverCapabilities): void;
  async resolveForContext(ref: string, context: 'import' | 'path', requestedImports?: string[]): Promise<ResolverContent>;
  checkResolverName(name: string): boolean;
  validateCapabilities(resolverName: string, context: 'import' | 'path'): void;
}
```

### 1.2 Create TTLCacheService

**New file:** `core/services/TTLCacheService.ts`

**Purpose:** Generic TTL service with pluggable cache key strategies.

```typescript
interface CacheKeyStrategy {
  generateKey(input: any): string;
  shouldCache(input: any): boolean;
}

export class TTLCacheService {
  constructor(
    private lockFile: LockFile, 
    private contentCache: Cache,
    private keyStrategy: CacheKeyStrategy
  );
  
  async getCached<T>(input: any, ttl: TTLOption): Promise<T | null>;
  async setCached<T>(input: any, value: T, ttl: TTLOption, metadata?: any): Promise<void>;
  async invalidate(input: any): Promise<void>;
  
  private isCacheExpired(entry: CacheEntry, ttl: TTLOption): boolean;
  private getTTLSeconds(ttl: TTLOption): number;
  private calculateExpirationTime(ttl: TTLOption): string;
}

// Resolver cache strategy
export class ResolverCacheKeyStrategy implements CacheKeyStrategy {
  shouldCache(): boolean { return true; }
  generateKey(input: { resolver: string, args: any }): string {
    return `resolver:${input.resolver}:${JSON.stringify(input.args)}`;
  }
}

// URL cache strategy (for existing URLCache)
export class URLCacheKeyStrategy implements CacheKeyStrategy {
  shouldCache(url: string): boolean {
    return !url.includes('localhost') && !this.isLocalPath(url);
  }
  generateKey(url: string): string { return `url:${url}`; }
}
```

### 1.3 Update Resolver Interface

**File:** `core/resolvers/types.ts`

**Changes needed:**
```typescript
interface Resolver {
  name: string;
  canResolve(ref: string, config?: any): boolean;
  
  // Enhanced interface for context-aware resolution
  resolveForImport?(ref: string, requestedFormats: string[], config?: any): Promise<ResolverContent>;
  resolveForPath?(ref: string, pathSegments: string[], config?: any): Promise<ResolverContent>;
  
  // Backward compatibility
  resolve(ref: string, config?: any): Promise<ResolverContent>;
}

// Utility for path segment handling
function joinPathSegments(segments: string[]): string {
  // Handle cases where segments might be split on '.' incorrectly
  // e.g., ["docs", "api", "md"] should become "docs/api.md"
  return segments.join('/');
}
```

## Phase 2: Built-in Resolver Implementation

### 2.1 Create TimeResolver

**New file:** `core/resolvers/builtin/TimeResolver.ts`

```typescript
export class TimeResolver implements Resolver {
  name = 'TIME';
  
  canResolve(ref: string): boolean {
    return ref === '@TIME';
  }
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    const now = new Date();
    const exports: Record<string, string> = {};
    
    // requestedFormats contains original format strings, not aliases
    // e.g., @import { "YYYY-MM-DD" as date } → requestedFormats = ["YYYY-MM-DD"]
    for (const format of requestedFormats || ['iso']) {
      exports[format] = this.formatTimestamp(now, format);
    }
    
    return {
      content: JSON.stringify(exports),
      contentInfo: {
        path: '@TIME',
        contentType: 'application/json',
        metadata: { resolver: 'TIME', timestamp: now.toISOString() }
      }
    };
  }
  
  private formatTimestamp(date: Date, format: string): string {
    // Implementation for common formats + custom format strings
    switch(format) {
      case 'iso': return date.toISOString();
      case 'unix': return Math.floor(date.getTime() / 1000).toString();
      default: return this.parseCustomFormat(date, format);
    }
  }
}
```

### 2.2 Create InputResolver

**New file:** `core/resolvers/builtin/InputResolver.ts`

```typescript
export class InputResolver implements Resolver {
  name = 'INPUT';
  
  constructor(private stdinContent?: string, private envVars?: Record<string, string>) {}
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    const inputData = this.createInputData();
    
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
    
    return {
      content: JSON.stringify(exports),
      contentInfo: {
        path: '@INPUT',
        contentType: 'application/json',
        metadata: { resolver: 'INPUT', source: 'stdin+env' }
      }
    };
  }
  
  private createInputData(): Record<string, any> {
    // Consolidate logic from Environment.createInputValue()
    const result: Record<string, any> = {};
    
    // Add environment variables
    if (this.envVars) {
      Object.assign(result, this.envVars);
    }
    
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

### 2.3 Create DebugResolver

**New file:** `core/resolvers/builtin/DebugResolver.ts`

```typescript
export class DebugResolver implements Resolver {
  name = 'DEBUG';
  
  constructor(private environment: Environment, private ttlCache: TTLCacheService) {}
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    const cacheInput = { resolver: 'DEBUG', basePath: this.environment.getBasePath() };
    const ttl: TTLOption = { type: 'duration', value: 5, unit: 'm', seconds: 300 };
    
    // Try cache first
    let debugData = await this.ttlCache.getCached(cacheInput, ttl);
    if (!debugData) {
      debugData = this.generateDebugData();
      await this.ttlCache.setCached(cacheInput, debugData, ttl);
    }
    
    return {
      content: JSON.stringify({ environment: debugData }),
      contentInfo: {
        path: '@DEBUG',
        contentType: 'application/json',
        metadata: { resolver: 'DEBUG', cached: true }
      }
    };
  }
  
  private generateDebugData(): any {
    // Move logic from Environment.createDebugObject()
    return this.environment.createDebugObject(3); // Markdown format
  }
}
```

### 2.4 Enhance ProjectPathResolver

**File:** `core/resolvers/ProjectPathResolver.ts`

**Changes needed:**
```typescript
export class ProjectPathResolver implements Resolver {
  // Add import resolution capability
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    // Return project path info as JSON
    const projectPath = await this.getProjectPath();
    return {
      content: JSON.stringify({ projectPath }),
      contentInfo: { path: '@PROJECTPATH', /* ... */ }
    };
  }
  
  async resolveForPath(ref: string, pathSegments: string[]): Promise<ResolverContent> {
    // Enhanced path resolution with utility
    const projectPath = await this.getProjectPath();
    const fullPath = path.join(projectPath, joinPathSegments(pathSegments));
    return this.readFile(fullPath);
  }
}
```

## Phase 3: Environment Integration

### 3.1 Update Environment.ts

**File:** `interpreter/env/Environment.ts`

**Changes needed:**
```typescript
export class Environment {
  private resolverManager: EnhancedResolverManager;
  
  constructor(/* existing params */) {
    // Initialize enhanced resolver manager
    this.resolverManager = new EnhancedResolverManager(/* ... */);
    
    // Remove initializeReservedVariables() call
  }
  
  async initialize(): Promise<void> {
    // Load config
    const config = await this.loadConfig();
    
    // Start all custom resolvers and wait for confirmation
    await this.startAllCustomResolvers(config.resolvers || {});
    
    // Register built-in resolvers
    this.registerBuiltinResolvers();
  }
  
  private registerBuiltinResolvers(): void {
    const resolverCacheStrategy = new ResolverCacheKeyStrategy();
    const ttlCache = new TTLCacheService(this.lockFile, this.moduleCache, resolverCacheStrategy);
    
    this.resolverManager.registerResolver(
      new TimeResolver(),
      { supportsImports: true, supportsPaths: false, type: 'function', priority: 1 }
    );
    
    this.resolverManager.registerResolver(
      new InputResolver(this.stdinContent, process.env),
      { supportsImports: true, supportsPaths: false, type: 'function', priority: 2 }
    );
    
    this.resolverManager.registerResolver(
      new DebugResolver(this, ttlCache),
      { supportsImports: true, supportsPaths: false, type: 'function', priority: 3, ttl: { type: 'duration', value: 5, unit: 'm' } }
    );
    
    this.resolverManager.registerResolver(
      new ProjectPathResolver(this.fileSystem),
      { supportsImports: true, supportsPaths: true, type: 'path', priority: 4 }
    );
  }
  
  private async startAllCustomResolvers(configs: Record<string, ResolverConfig>): Promise<void> {
    const startupPromises = Object.entries(configs).map(async ([name, config]) => {
      const mcpClient = await this.mcpManager.createClient(name, config);
      await mcpClient.waitForReady(); // Confirm server is up
      return new CustomResolver(name, config, mcpClient);
    });
    
    const resolvers = await Promise.all(startupPromises);
    resolvers.forEach(resolver => this.registerResolver(resolver));
  }
  
  // Remove these methods (replaced by resolvers):
  // - initializeReservedVariables()
  // - createInputValue()
  // - createDebugObject()
  
  // Add new resolver integration:
  async resolveAtReference(identifier: string, contextData: string[] = [], context: 'import' | 'path'): Promise<any> {
    try {
      const resolverRef = `@${identifier}`;
      
      if (context === 'import') {
        // contextData contains requested format strings
        return await this.resolverManager.resolveForContext(resolverRef, context, contextData);
      } else {
        // contextData contains path segments
        return await this.resolverManager.resolveForContext(resolverRef, context, contextData);
      }
    } catch (resolverError) {
      // Fallback to variable lookup
      const variable = this.getVariable(identifier);
      if (variable) {
        if (context === 'path') {
          return this.interpolateVariableInPath(variable, contextData);
        } else {
          return variable.value;
        }
      }
      
      throw new ResolverError(identifier, context, { identifier, contextData }, resolverError);
    }
  }
}
```

### 3.2 Update Variable Setting Validation

**File:** `interpreter/env/Environment.ts`

**Changes needed:**
```typescript
setVariable(name: string, variable: MlldVariable): void {
  // Check if name is reserved for a resolver
  if (this.resolverManager.checkResolverName(name)) {
    throw new MlldError(
      `Cannot create variable '${name}': this name is reserved for a resolver`
    );
  }
  
  // Existing variable setting logic...
}

validateImportAlias(aliasName: string): void {
  if (this.resolverManager.checkResolverName(aliasName)) {
    throw new MlldError(
      `Cannot use '${aliasName}' as import alias: this name is reserved for a resolver`
    );
  }
}
```

## Phase 4: Path Resolution Integration

### 4.1 Update Path Evaluation

**File:** `interpreter/eval/path.ts`

**Changes needed:**
```typescript
// In path evaluation logic:
async function evaluatePathBaseVariable(identifier: string, pathSegments: string[], env: Environment): Promise<string> {
  try {
    // Try resolver first
    const resolverResult = await env.resolveAtReference(identifier, pathSegments, 'path');
    return resolverResult.content;
  } catch (resolverError) {
    // Fallback to variable interpolation
    const variable = env.getVariable(identifier);
    if (!variable) {
      throw new Error(`Unknown resolver or variable: @${identifier}`);
    }
    
    return await interpolateVariableInPath(variable, pathSegments, env);
  }
}
```

### 4.2 Update Import Evaluation  

**File:** `interpreter/eval/import.ts`

**Changes needed:**
```typescript
export async function evaluateImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
  const pathValue = directive.values?.path;
  if (!pathValue) {
    throw new Error('Import directive missing path');
  }
  
  const pathNodes = Array.isArray(pathValue) ? pathValue : [pathValue];
  
  // Check if this is a resolver reference
  if (pathNodes.length === 1 && pathNodes[0].type === 'VariableReference') {
    const resolverName = pathNodes[0].identifier;
    
    try {
      // Try resolver resolution
      const requestedImports = directive.values?.imports?.map(imp => imp.identifier) || [];
      const resolverResult = await env.resolveAtReference(resolverName, requestedImports, 'import');
      
      // Process the resolver result as a module
      return await processResolverImport(directive, resolverResult, env);
      
    } catch (resolverError) {
      throw new Error(`Failed to resolve @${resolverName}: ${resolverError.message}`);
    }
  }
  
  // Fallback to existing path-based import logic
  const importPath = await interpolate(pathNodes, env);
  return await importFromPath(directive, importPath, env);
}

async function processResolverImport(directive: DirectiveNode, resolverResult: ResolverContent, env: Environment): Promise<EvalResult> {
  // Parse resolver result as module exports
  const moduleData = JSON.parse(resolverResult.content);
  
  // Handle import types (importAll, importSelected, importNamespace)
  // This mirrors existing import logic but works with resolver data
  // ...
}
```

## Phase 5: Grammar Validation Updates

### 5.1 Add Resolver Name Validation

**File:** `grammar/patterns/variables.peggy`

**Changes needed:**
```peggy
// Add validation to variable patterns
VariableIdentifier = id:BaseIdentifier &{ 
  // Check if this identifier conflicts with resolver names
  return !helpers.isReserverResolverName(id);
} {
  return id;
}
```

### 5.2 Update Grammar Helpers

**File:** `grammar/deps/grammar-core.js`

**Changes needed:**
```javascript
export const helpers = {
  // Add resolver name checking
  isReservedResolverName(name) {
    const reservedNames = ['TIME', 'DEBUG', 'INPUT', 'PROJECTPATH', '.'];
    return reservedNames.includes(name);
  },
  
  // Existing helpers...
};
```

## Phase 6: Custom Resolver Support

### 6.1 Create MCP Client Integration

**New file:** `core/resolvers/MCPClientManager.ts`

```typescript
export class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map();
  
  async createClient(resolverName: string, config: ResolverConfig): Promise<MCPClient>;
  async callResolver(resolverName: string, tool: string, args: any): Promise<any>;
  async shutdownClient(resolverName: string): Promise<void>;
}
```

### 6.2 Create Custom Resolver Wrapper

**New file:** `core/resolvers/CustomResolver.ts`

```typescript
export class CustomResolver implements Resolver {
  constructor(
    public name: string,
    private config: ResolverConfig,
    private mcpClient: MCPClientManager
  ) {}
  
  async resolveForImport(ref: string, requestedImports?: string[]): Promise<ResolverContent> {
    return await this.mcpClient.callResolver(this.name, 'resolveImport', {
      ref,
      requestedImports
    });
  }
  
  async resolveForPath(ref: string, pathSegments?: string[]): Promise<ResolverContent> {
    return await this.mcpClient.callResolver(this.name, 'resolvePath', {
      ref,
      pathSegments
    });
  }
}
```

### 6.3 Update Configuration Loading

**File:** `core/config/loader.ts`

**Changes needed:**
```typescript
interface MlldConfig {
  // Add resolver configuration section
  resolvers?: {
    [name: string]: ResolverConfig;
  };
}

interface ResolverConfig {
  type: 'function' | 'module' | 'path';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  priority?: number;
  ttl?: TTLOption;
  capabilities?: {
    supportsImports?: boolean;
    supportsPaths?: boolean;
  };
}
```

## Phase 7: Testing Strategy

### 7.1 Unit Tests

**New files:**
- `core/resolvers/builtin/TimeResolver.test.ts`
- `core/resolvers/builtin/InputResolver.test.ts`  
- `core/resolvers/builtin/DebugResolver.test.ts`
- `core/services/TTLCacheService.test.ts`

### 7.2 Integration Tests

**Update existing files:**
- `interpreter/interpreter.fixture.test.ts` - Add resolver test cases
- `tests/cases/valid/reserved/` - Update test cases for resolver behavior

### 7.3 E2E Tests

**New test cases:**
```mlld
# tests/cases/valid/resolvers/time-resolver/example.md
@import { "YYYY-MM-DD" as date, "HH:mm:ss" as time } from @TIME
Today is @add @date at @add @time

# tests/cases/valid/resolvers/input-resolver/example.md  
@import { config, data } from @INPUT
Config: @add @config

# tests/cases/valid/resolvers/path-resolver/example.md
@add [@./README.md]
@import { content } from [@PROJECTPATH/package.json]
```

## Implementation Sequence

### Week 1: Core Infrastructure
- [ ] Implement TTLCacheService
- [ ] Enhance ResolverManager with capabilities and priority
- [ ] Update Resolver interface for context-aware resolution

### Week 2: Built-in Resolvers
- [ ] Implement TimeResolver
- [ ] Implement InputResolver
- [ ] Implement DebugResolver
- [ ] Enhance ProjectPathResolver

### Week 3: Environment Integration
- [ ] Update Environment.ts to use resolvers
- [ ] Remove reserved variable initialization
- [ ] Add resolver name protection
- [ ] Update path and import evaluation

### Week 4: Grammar and Validation
- [ ] Add resolver name validation to grammar
- [ ] Update error messages
- [ ] Comprehensive testing

### Week 5: Custom Resolver Support
- [ ] Implement MCP client integration
- [ ] Add configuration loading
- [ ] Create custom resolver examples
- [ ] Documentation updates

## Validation Criteria

### Phase Completion Criteria

**Phase 1 Complete When:**
- [ ] ResolverManager supports capabilities and priority
- [ ] TTLCacheService extracted and working
- [ ] All existing tests still pass

**Phase 2 Complete When:**
- [ ] All built-in resolvers implemented
- [ ] Time formatting works with custom format strings
- [ ] Input resolver handles both stdin and env vars
- [ ] Debug resolver uses TTL caching

**Phase 3 Complete When:**
- [ ] Environment no longer has special reserved variable logic
- [ ] Resolver name protection prevents conflicts
- [ ] All @ references route through resolver system

**Phase 4 Complete When:**
- [ ] Path resolution uses resolvers for @ references
- [ ] Import resolution uses resolvers for @ references
- [ ] Fallback to variables works correctly

**Phase 5 Complete When:**
- [ ] Grammar validates resolver names
- [ ] Error messages identify failing resolvers
- [ ] All existing functionality preserved

### Success Metrics

- [ ] All existing tests pass
- [ ] New resolver functionality works as specified
- [ ] Performance is equivalent or better
- [ ] Error messages are clear and actionable
- [ ] Custom resolvers can be configured and used

## Risk Mitigation

### Breaking Changes
- Maintain backward compatibility by keeping variable fallback
- Preserve existing import syntax and behavior
- Add extensive test coverage before implementation

### Performance Impact  
- Use TTL caching to prevent performance regression
- Implement lazy resolver initialization
- Profile resolver resolution vs variable lookup

### Complexity Management
- Implement phases sequentially with validation
- Keep MCP integration simple initially
- Document all interfaces clearly

### Rollback Strategy
- Each phase can be reverted independently
- Feature flags for new resolver behavior
- Comprehensive test coverage for rollback validation