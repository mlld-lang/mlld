# Implementation Plan: Unified Resolver Architecture (Phases 1-5)

## Overview

This issue outlines the detailed implementation plan for the first 5 phases of the unified resolver architecture. This follows the architectural design established in the [Unified Resolver Architecture](./resolver-architecture-design.md) issue.

## Implementation Phases

### Phase 1: Core Infrastructure Enhancement

**Objective**: Enhance existing ResolverManager with capabilities, priority system, and TTL integration.

#### 1.1 ResolverManager Enhancements (`core/resolvers/ResolverManager.ts`)

**Current State Analysis**:
- Existing ResolverManager at lines 156-201 in `Environment.ts`
- Currently registers: ProjectPathResolver, RegistryResolver, LocalResolver, GitHubResolver, HTTPResolver
- Basic resolver pattern exists but lacks capabilities and priority system

**Required Changes**:

```typescript
// Enhanced resolver interface with capabilities
interface EnhancedResolver {
  canResolve(reference: string): boolean;
  resolve(reference: string): Promise<ResolverContent>;
  
  // NEW: Capability declarations
  getCapabilities(): ResolverCapabilities;
  
  // NEW: Context-aware resolution methods
  resolveForImport?(ref: string, requestedFormats: string[]): Promise<ResolverContent>;
  resolveForPath?(ref: string, pathSegments: string[]): Promise<ResolverContent>;
}

interface ResolverCapabilities {
  supportsImports: boolean;
  supportsPaths: boolean;
  type: 'function' | 'module' | 'path';
  ttl?: TTLOption;
  priority: number;
}

// Enhanced ResolverManager
class ResolverManager {
  private resolvers: EnhancedResolver[] = [];
  
  // NEW: Priority-based registration
  registerResolver(resolver: EnhancedResolver): void {
    this.resolvers.push(resolver);
    // Sort by priority (lower number = higher priority)
    this.resolvers.sort((a, b) => 
      a.getCapabilities().priority - b.getCapabilities().priority
    );
  }
  
  // NEW: Context-aware resolution
  async resolveForImport(reference: string, requestedFormats: string[]): Promise<ResolverContent>;
  async resolveForPath(reference: string, pathSegments: string[]): Promise<ResolverContent>;
}
```

#### 1.2 TTL Service Extraction (`core/registry/TTLCacheService.ts`)

**Rationale**: Extract TTL logic from `URLCache.ts` (lines 1-796) to create generic caching service.

**Implementation**:
```typescript
// Extract from interpreter/cache/URLCache.ts
interface CacheKeyStrategy {
  generateKey(input: any): string;
  shouldCache(input: any): boolean;
}

class TTLCacheService<T> {
  constructor(
    private contentCache: Cache,
    private lockFile: LockFile,
    private keyStrategy: CacheKeyStrategy
  ) {}
  
  async get(input: any): Promise<T | null>;
  async set(input: any, value: T, ttl: TTLOption): Promise<void>;
  async invalidate(input: any): Promise<void>;
}

// Specific strategies for different resolver types
class FunctionResolverCacheStrategy implements CacheKeyStrategy;
class ModuleResolverCacheStrategy implements CacheKeyStrategy;
class PathResolverCacheStrategy implements CacheKeyStrategy;
```

#### 1.3 Error Standardization (`core/errors/ResolverError.ts`)

**New Error Classes**:
```typescript
class ResolverError extends MlldError {
  constructor(
    public resolverName: string,
    public operation: string,
    public input: any,
    public originalError: Error,
    public suggestions?: string[]
  ) {
    super(`${resolverName} failed: ${originalError.message}`);
  }
}

class ResolverNotFoundError extends ResolverError;
class ResolverCapabilityError extends ResolverError;
```

### Phase 2: Built-in Resolver Implementation

**Objective**: Convert TIME, DEBUG, INPUT, PROJECTPATH from special variables to built-in resolvers.

#### 2.1 TIME Resolver (`core/resolvers/built-in/TimeResolver.ts`)

**Current Implementation**: Lines 261-278 in `Environment.ts` - static TIME variable initialization.

**Target Resolver**:
```typescript
class TimeResolver implements EnhancedResolver {
  getCapabilities(): ResolverCapabilities {
    return {
      supportsImports: true,
      supportsPaths: false,
      type: 'function',
      priority: 1, // Highest priority (built-in)
      ttl: { type: 'duration', seconds: 1 } // Refresh every second
    };
  }
  
  canResolve(reference: string): boolean {
    return reference === 'TIME';
  }
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    const timeData: Record<string, string> = {};
    
    for (const format of requestedFormats) {
      switch (format) {
        case 'YYYY-MM-DD':
          timeData[format] = new Date().toISOString().split('T')[0];
          break;
        case 'HH:mm:ss':
          timeData[format] = new Date().toTimeString().split(' ')[0];
          break;
        case 'iso':
          timeData[format] = new Date().toISOString();
          break;
        case 'unix':
          timeData[format] = Math.floor(Date.now() / 1000).toString();
          break;
        default:
          throw new ResolverError('TimeResolver', 'format', format, 
            new Error(`Unsupported format: ${format}`),
            ['YYYY-MM-DD', 'HH:mm:ss', 'iso', 'unix']
          );
      }
    }
    
    return {
      content: { type: 'data', value: timeData },
      metadata: { resolverName: 'TIME', timestamp: Date.now() }
    };
  }
}
```

#### 2.2 DEBUG Resolver (`core/resolvers/built-in/DebugResolver.ts`)

**Current Implementation**: Lines 282-295 in `Environment.ts` - lazy DEBUG variable with `createDebugObject()`.

**Target Resolver**:
```typescript
class DebugResolver implements EnhancedResolver {
  getCapabilities(): ResolverCapabilities {
    return {
      supportsImports: true,
      supportsPaths: false,
      type: 'function',
      priority: 1,
      ttl: { type: 'duration', seconds: 0 } // Always fresh
    };
  }
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    // Use existing createDebugObject logic from Environment.ts:319-524
    const environment = this.getCurrentEnvironment();
    const debugData: Record<string, any> = {};
    
    for (const format of requestedFormats) {
      switch (format) {
        case 'full':
          debugData[format] = environment.createDebugObject(1);
          break;
        case 'summary':
          debugData[format] = environment.createDebugObject(2);
          break;
        case 'markdown':
          debugData[format] = environment.createDebugObject(3);
          break;
        default:
          debugData[format] = environment.createDebugObject(3); // Default to markdown
      }
    }
    
    return {
      content: { type: 'data', value: debugData },
      metadata: { resolverName: 'DEBUG', timestamp: Date.now() }
    };
  }
}
```

#### 2.3 INPUT Resolver (`core/resolvers/built-in/InputResolver.ts`)

**Current Implementation**: Lines 244-259 in `Environment.ts` - `createInputValue()` merges stdin + environment variables.

**Target Resolver**:
```typescript
class InputResolver implements EnhancedResolver {
  getCapabilities(): ResolverCapabilities {
    return {
      supportsImports: true,
      supportsPaths: false,
      type: 'function',
      priority: 1,
      ttl: { type: 'special', value: 'static' } // Cache for session
    };
  }
  
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    // Use existing createInputValue logic from Environment.ts:780-831
    const environment = this.getCurrentEnvironment();
    const inputValue = environment.createInputValue();
    
    if (!inputValue) {
      throw new ResolverError('InputResolver', 'resolve', ref,
        new Error('No input data available'),
        ['Provide data via stdin or environment variables']
      );
    }
    
    const inputData: Record<string, any> = {};
    
    // Handle requested formats or provide all available data
    if (requestedFormats.length === 0) {
      inputData['data'] = inputValue.value;
    } else {
      for (const format of requestedFormats) {
        if (inputValue.type === 'data' && typeof inputValue.value === 'object') {
          inputData[format] = inputValue.value[format];
        } else {
          inputData[format] = inputValue.value;
        }
      }
    }
    
    return {
      content: { type: 'data', value: inputData },
      metadata: { resolverName: 'INPUT', timestamp: Date.now() }
    };
  }
}
```

#### 2.4 PROJECTPATH Resolver Enhancement

**Current Implementation**: Lines 299-312 in `Environment.ts` + `core/resolvers/ProjectPathResolver.ts`.

**Required Changes**: Enhance existing ProjectPathResolver to support import context.

```typescript
// Enhance existing ProjectPathResolver
class ProjectPathResolver implements EnhancedResolver {
  getCapabilities(): ResolverCapabilities {
    return {
      supportsImports: true, // NEW: Enable import support
      supportsPaths: true,   // EXISTING
      type: 'path',
      priority: 1,
      ttl: { type: 'special', value: 'static' }
    };
  }
  
  // NEW: Import resolution
  async resolveForImport(ref: string, requestedFormats: string[]): Promise<ResolverContent> {
    const projectPath = await this.getProjectPath();
    
    const pathData: Record<string, string> = {};
    for (const format of requestedFormats) {
      switch (format) {
        case 'absolute':
          pathData[format] = projectPath;
          break;
        case 'relative':
          pathData[format] = path.relative(process.cwd(), projectPath);
          break;
        case 'basename':
          pathData[format] = path.basename(projectPath);
          break;
        default:
          pathData[format] = projectPath; // Default to absolute
      }
    }
    
    return {
      content: { type: 'data', value: pathData },
      metadata: { resolverName: 'PROJECTPATH', timestamp: Date.now() }
    };
  }
}
```

### Phase 3: Environment Integration

**Objective**: Remove special variable handling from Environment.ts and route all @ references through ResolverManager.

#### 3.1 Environment.ts Modifications

**Remove Special Variable Logic**:
```typescript
// REMOVE: Lines 242-313 initializeReservedVariables()
// REMOVE: Lines 670-712 special variable handling in getVariable()
// REMOVE: Lines 319-524 createDebugObject() (move to DebugResolver)
// REMOVE: Lines 780-831 createInputValue() (move to InputResolver)

// MODIFY: Constructor to register built-in resolvers
constructor(/* existing params */) {
  // ... existing initialization ...
  
  if (!parent) {
    // Register built-in resolvers with priority 1
    this.resolverManager.registerResolver(new TimeResolver());
    this.resolverManager.registerResolver(new DebugResolver());
    this.resolverManager.registerResolver(new InputResolver());
    // ProjectPathResolver already registered, enhance with import capability
    
    // Register module resolvers with priority 10
    this.resolverManager.registerResolver(new RegistryResolver());
    
    // Register file resolvers with priority 20
    this.resolverManager.registerResolver(new LocalResolver());
    this.resolverManager.registerResolver(new GitHubResolver());
    this.resolverManager.registerResolver(new HTTPResolver());
  }
}
```

#### 3.2 Variable Resolution Updates

**Current**: `getVariable()` method at lines 670-712 has special cases for reserved variables.

**New**: Route through ResolverManager for @ references:
```typescript
// NEW: Resolver-first variable resolution
getVariable(name: string): MlldVariable | undefined {
  // Check local scope first
  const variable = this.variables.get(name);
  if (variable) return variable;
  
  // Check if this is a resolver reference
  const resolverManager = this.getResolverManager();
  if (resolverManager && resolverManager.canResolve(name)) {
    // Create synthetic variable that triggers resolver on access
    return {
      type: 'data',
      value: null,
      nodeId: '',
      location: { line: 0, column: 0 },
      metadata: {
        isResolverReference: true,
        resolverName: name,
        isLazy: true
      }
    };
  }
  
  // Check parent scope
  return this.parent?.getVariable(name);
}
```

### Phase 4: Import System Integration

**Objective**: Update import evaluation to use unified resolver system.

#### 4.1 Import Evaluator Updates (`interpreter/eval/import.ts`)

**Current Logic**: Lines 390-424 handle @ module references through ResolverManager.

**Required Changes**:
```typescript
// MODIFY: evaluateImport function lines 347-437
export async function evaluateImport(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // ... existing path resolution logic ...
  
  // NEW: Check if this is a resolver reference first
  if (importPath.startsWith('@')) {
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new ResolverError('ImportSystem', 'resolve', importPath,
        new Error('Resolver system not available')
      );
    }
    
    // Extract resolver name and requested formats
    const resolverName = importPath.split('/')[0].substring(1); // Remove @
    const requestedFormats = directive.values?.imports?.map(i => i.identifier) || [];
    
    // Check if resolver supports imports
    if (!resolverManager.canResolveForImport(resolverName)) {
      throw new ResolverCapabilityError('ImportSystem', 'import', resolverName,
        new Error(`Resolver '${resolverName}' does not support import operations`)
      );
    }
    
    // Use resolver for import
    const resolverContent = await resolverManager.resolveForImport(resolverName, requestedFormats);
    
    // Process resolver content into variables
    return processResolverImport(directive, resolverContent, env);
  }
  
  // ... existing file/URL import logic ...
}

// NEW: Helper function to process resolver imports
async function processResolverImport(
  directive: DirectiveNode,
  resolverContent: ResolverContent,
  env: Environment
): Promise<EvalResult> {
  // Convert resolver content to importable variables
  const variables: Map<string, MlldVariable> = new Map();
  
  if (resolverContent.content.type === 'data') {
    const data = resolverContent.content.value;
    for (const [key, value] of Object.entries(data)) {
      variables.set(key, {
        type: 'data',
        value: value,
        nodeId: '',
        location: { line: 0, column: 0 },
        metadata: {
          isImported: true,
          importPath: `@${resolverContent.metadata.resolverName}`,
          resolverName: resolverContent.metadata.resolverName
        }
      });
    }
  }
  
  // Handle import type (all, selected, namespace)
  // ... existing import merging logic ...
}
```

### Phase 5: Grammar Updates and Validation

**Objective**: Add resolver name protection and enhance import validation.

#### 5.1 Reserved Name Protection

**Implementation Location**: `interpreter/env/Environment.ts` lines 599-649 in `setVariable()`.

**Current Protection**: Lines 71 and 600-603 protect basic reserved names.

**Enhanced Protection**:
```typescript
class Environment {
  // MODIFY: Constructor to populate resolver names
  constructor(/* params */) {
    // ... existing initialization ...
    
    // NEW: Protect resolver names
    if (!parent && this.resolverManager) {
      const resolverNames = this.resolverManager.getResolverNames();
      for (const name of resolverNames) {
        this.reservedNames.add(name);
        this.reservedNames.add(name.toLowerCase()); // Protect both cases
      }
    }
  }
  
  // ENHANCE: setVariable validation
  setVariable(name: string, variable: MlldVariable): void {
    // Existing reserved name check enhanced
    if (this.reservedNames.has(name) && !variable.metadata?.isReserved) {
      // Check if this is a resolver name
      const resolverManager = this.getResolverManager();
      if (resolverManager?.hasResolver(name)) {
        throw new ResolverError('Environment', 'setVariable', name,
          new Error(`Cannot create variable '${name}': this name is reserved for resolver '${name}'`),
          [`Use a different variable name`, `Import from @${name} instead`]
        );
      }
      
      // Existing generic reserved name error
      throw new Error(`Cannot create variable '${name}': this name is reserved for system use`);
    }
    
    // ... existing variable conflict logic ...
  }
}
```

#### 5.2 Import Alias Validation

**Enhancement**: Prevent resolver names as import aliases.

```typescript
// MODIFY: import.ts processResolverImport and importFromPath
// Add validation for import aliases
function validateImportAlias(alias: string, env: Environment): void {
  const resolverManager = env.getResolverManager();
  if (resolverManager?.hasResolver(alias)) {
    throw new ResolverError('ImportSystem', 'alias', alias,
      new Error(`Cannot use '${alias}' as import alias: name reserved for resolver`),
      ['Use a different alias name', `Try '${alias}Data' or '${alias}Value'`]
    );
  }
}
```

#### 5.3 Grammar Pattern Updates

**Objective**: Ensure grammar recognizes resolver patterns consistently.

**Current Import Grammar**: Handled in `grammar/directives/import.peggy` and related patterns.

**Required Updates**:
```peggy
// ENHANCE: Import source validation
ImportResolver
  = "@" resolverName:BaseIdentifier pathSegments:("/" segment:BaseIdentifier { return segment; })* {
      // Validate that resolverName exists and supports imports
      return helpers.createResolverReference(resolverName, pathSegments, location());
    }

// ENHANCE: Variable reference validation  
AtVar
  = "@" identifier:BaseIdentifier {
      // Check if this could be a resolver reference
      return helpers.createVariableOrResolverReference(identifier, location());
    }
```

## Implementation Dependencies

### Phase 1 Prerequisites
- TypeScript interfaces defined in `core/types/`
- Existing ResolverManager structure (currently functional)
- URLCache TTL infrastructure (can be extracted)

### Phase 2 Prerequisites
- Phase 1 infrastructure complete
- Environment.ts special variable logic identified for migration
- Resolver interface standardized

### Phase 3 Prerequisites
- All built-in resolvers implemented and tested
- ResolverManager enhanced with priority and capabilities
- Error handling standardized

### Phase 4 Prerequisites
- Environment integration complete
- Resolver name protection implemented
- Import system ready for resolver routing

### Phase 5 Prerequisites
- All core functionality working through resolvers
- Import system fully integrated
- Grammar patterns identified for enhancement

## Testing Strategy

### Phase-by-Phase Testing
1. **Phase 1**: Unit tests for ResolverManager enhancements and TTL service
2. **Phase 2**: Integration tests for each built-in resolver
3. **Phase 3**: Environment tests ensuring no regression in variable resolution
4. **Phase 4**: Import system tests covering all resolver types
5. **Phase 5**: End-to-end tests with grammar validation

### Existing Test Integration
- Fixture tests in `interpreter/interpreter.fixture.test.ts` must continue passing
- All existing reserved variable behavior preserved
- Import functionality fully backward compatible

## Backward Compatibility

### Maintained Behavior
- All existing @TIME, @DEBUG, @INPUT, @PROJECTPATH usage continues working
- Existing import syntax remains functional
- Variable resolution order unchanged for non-resolver references
- Module import system (`@user/module`) continues working

### Migration Path
- Phase-by-phase implementation allows gradual rollout
- Each phase maintains existing functionality while adding resolver capabilities
- No breaking changes until deprecation period (future phases)

## Success Criteria

### Phase 1 Complete
- ResolverManager supports capabilities and priority
- TTL service extracted and reusable
- Error classes standardized

### Phase 2 Complete  
- All built-in resolvers functional
- Special variable logic replaced with resolver calls
- Existing behavior preserved

### Phase 3 Complete
- Environment.ts routes @ references through ResolverManager
- No special variable handling remains
- Variable resolution performance maintained

### Phase 4 Complete
- Import system fully integrated with resolvers
- All import types work with built-in resolvers
- Module resolution unchanged

### Phase 5 Complete
- Grammar supports resolver patterns
- Name protection prevents conflicts
- All tests passing with new architecture

## Timeline Estimation

- **Phase 1**: 2-3 days (infrastructure)
- **Phase 2**: 3-4 days (built-in resolvers)  
- **Phase 3**: 2-3 days (environment integration)
- **Phase 4**: 2-3 days (import system)
- **Phase 5**: 1-2 days (grammar and validation)

**Total**: 10-15 days for complete implementation

## Next Steps

1. Begin with Phase 1 ResolverManager enhancements
2. Create comprehensive unit tests for each phase  
3. Implement phases sequentially to maintain stability
4. Regular testing against existing fixture suite
5. Documentation updates as each phase completes

This implementation plan provides the foundation for the unified resolver architecture while maintaining full backward compatibility and systematic testing throughout the process.