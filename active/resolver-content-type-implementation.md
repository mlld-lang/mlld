# Resolver Content Type Implementation Plan

## Overview

This plan implements the content type system for mlld resolvers, enabling proper validation of module vs path imports while preserving context-dependent behavior.

## Key Design Decisions Made

1. **Content Types**: `'module' | 'data' | 'text'`
   - `module`: mlld files with exportable variables/templates
   - `data`: Structured JSON data
   - `text`: Plain text content

2. **Context-Dependent Behavior**: Resolvers behave differently based on usage:
   - Variable context: `@TIME` → returns default value
   - Import context: `@import { x } from @TIME` → returns structured exports
   - Path context: `[@./file]` → resolves full path and returns content

3. **Unified Path/URL Handling**: Files and URLs are treated equally as "paths"

## Phase 1: Update Type Definitions

### 1.1 Update ResolverCapabilities (`core/resolvers/types.ts`)

**Remove**: `ResourceType` enum and `resourceType` field

**Update** `ResolverCapabilities` interface:
```typescript
export interface ResolverCapabilities {
  io: IOCapabilities;
  contexts: ContextSupport;
  
  // NEW: Content type support
  supportedContentTypes: ('module' | 'data' | 'text')[];
  defaultContentType: 'module' | 'data' | 'text';
  
  priority: number;
  cache?: CacheConfig;
  
  // REMOVE these fields:
  // - needs: ResourceNeeds (not used)
  // - resourceType: ResourceType (replaced by contentType)
}
```

### 1.2 Update ResolverContent (`core/resolvers/types.ts`)

**Add** `contentType` field:
```typescript
export interface ResolverContent {
  content: string;
  contentType: 'module' | 'data' | 'text';  // NEW
  metadata?: {
    source: string;
    timestamp: Date;
    // ... existing fields
  };
}
```

### 1.3 Update ResolverOptions (`core/resolvers/types.ts`)

**Add** fields for context-aware resolution:
```typescript
export interface ResolverOptions {
  basePath?: string;
  securityPolicy?: ResolverSecurityPolicy;
  useCache?: boolean;
  metadata?: Record<string, any>;
  context?: ResolutionContext;
  format?: string;
  
  // NEW: For import context
  requestedImports?: string[];  // ["YYYY-MM-DD", "HH:mm:ss"] for TIME
}
```

## Phase 2: Update Built-in Resolvers

### 2.1 TimeResolver (`core/resolvers/builtin/TimeResolver.ts`)

**Current**: Returns static TIME variable value

**Update**:
```typescript
capabilities = {
  io: { read: true, write: false, list: false },
  contexts: { import: true, path: false, output: false },
  supportedContentTypes: ['text', 'data'],
  defaultContentType: 'text',
  priority: 1,
  cache: { strategy: 'none' }
};

async resolve(ref: string, config?: any): Promise<ResolverContent> {
  // Variable context - return ISO timestamp as text
  if (!config?.context || config.context === 'variable') {
    return {
      content: this.getDefaultValue(),
      contentType: 'text',
      metadata: { source: 'TIME', timestamp: new Date() }
    };
  }
  
  // Import context - return structured data
  if (config.context === 'import') {
    const exports: Record<string, string> = {};
    const formats = config.requestedImports || ['iso'];
    
    for (const format of formats) {
      exports[format] = this.formatTimestamp(new Date(), format);
    }
    
    return {
      content: JSON.stringify(exports),
      contentType: 'data',
      metadata: { source: 'TIME', timestamp: new Date() }
    };
  }
  
  throw new MlldResolutionError('TIME resolver only supports variable and import contexts');
}
```

### 2.2 DebugResolver (`core/resolvers/builtin/DebugResolver.ts`)

**Update** capabilities:
```typescript
capabilities = {
  io: { read: true, write: false, list: false },
  contexts: { import: true, path: false, output: false },
  supportedContentTypes: ['data', 'text'],
  defaultContentType: 'data',  // Returns object by default
  priority: 1
};
```

### 2.3 InputResolver (`core/resolvers/builtin/InputResolver.ts`)

**Update** capabilities:
```typescript
capabilities = {
  io: { read: true, write: false, list: false },
  contexts: { import: true, path: false, output: false },
  supportedContentTypes: ['data', 'text'],
  defaultContentType: 'data',  // Usually JSON from stdin
  priority: 1
};
```

### 2.4 ProjectPathResolver (`core/resolvers/ProjectPathResolver.ts`)

**Current**: Always reads file content

**Update** for context-dependent behavior:
```typescript
capabilities = {
  io: { read: true, write: false, list: true },
  contexts: { import: true, path: true, output: false },
  supportedContentTypes: ['text'],  // Always returns text
  defaultContentType: 'text',
  priority: 1
};

async resolve(ref: string, config?: any): Promise<ResolverContent> {
  const projectRoot = await this.findProjectRoot(config?.basePath);
  
  // Variable context - return project path as text
  if (ref === 'PROJECTPATH' || ref === '.' || 
      (!config?.context || config.context === 'variable')) {
    return {
      content: projectRoot,
      contentType: 'text',
      metadata: { source: 'PROJECTPATH', timestamp: new Date() }
    };
  }
  
  // Path/import context - read file
  const relativePath = this.extractRelativePath(ref);
  const fullPath = path.resolve(projectRoot, relativePath);
  
  // Security check
  if (!fullPath.startsWith(projectRoot)) {
    throw new MlldResolutionError('Path outside project directory');
  }
  
  const content = await this.fileSystem.readFile(fullPath);
  return {
    content,
    contentType: 'text',
    metadata: { 
      source: fullPath, 
      timestamp: new Date(),
      originalRef: ref 
    }
  };
}
```

## Phase 3: Update Module Resolvers

### 3.1 RegistryResolver (`core/resolvers/RegistryResolver.ts`)

**Update** capabilities:
```typescript
capabilities = {
  io: { read: true, write: false, list: false },
  contexts: { import: true, path: false, output: false },
  supportedContentTypes: ['module'],
  defaultContentType: 'module',
  priority: 10
};
```

**Add** content type to result:
```typescript
return {
  content: moduleContent,
  contentType: 'module',
  metadata: { ... }
};
```

### 3.2 LocalResolver (`core/resolvers/LocalResolver.ts`)

**Update** for dynamic content type detection:
```typescript
capabilities = {
  io: { read: true, write: false, list: true },
  contexts: { import: true, path: true, output: false },
  supportedContentTypes: ['module', 'data', 'text'],
  defaultContentType: 'text',
  priority: 20
};

async resolve(ref: string, config?: any): Promise<ResolverContent> {
  const content = await this.fileSystem.readFile(resolvedPath);
  const contentType = this.detectContentType(resolvedPath, content);
  
  return {
    content,
    contentType,
    metadata: { ... }
  };
}

private detectContentType(path: string, content: string): 'module' | 'data' | 'text' {
  // Check file extension
  if (path.endsWith('.mld') || path.endsWith('.mlld')) {
    return 'module';
  }
  if (path.endsWith('.json')) {
    return 'data';
  }
  
  // Try to detect mlld module content
  try {
    const { parse } = await import('@grammar/parser');
    const result = await parse(content);
    if (result.success && this.hasModuleExports(result.ast)) {
      return 'module';
    }
  } catch {
    // Not valid mlld
  }
  
  // Try JSON
  try {
    JSON.parse(content);
    return 'data';
  } catch {
    // Not JSON
  }
  
  return 'text';
}
```

### 3.3 HTTPResolver (`core/resolvers/HTTPResolver.ts`)

Similar to LocalResolver - detect content type based on:
1. Content-Type header
2. File extension in URL
3. Content analysis

## Phase 4: Update Import/Path Evaluators

### 4.1 Import Evaluator (`interpreter/eval/import.ts`)

**Add** validation based on import type:

```typescript
// For module imports (@author/module)
if (isModuleImport(source)) {
  const result = await env.resolveModule(source);
  
  if (result.contentType !== 'module') {
    throw new MlldImportError(
      `Cannot import from ${source}: expected module content, got ${result.contentType}`,
      { source, contentType: result.contentType }
    );
  }
  
  // Process as mlld module...
}

// For quoted imports ("./file")
else {
  const result = await env.readFile(source);
  
  // Handle based on content type
  switch (result.contentType) {
    case 'module':
      // Parse and extract exports
      break;
    case 'data':
      // Import as data object
      break;
    case 'text':
      // Import as single text variable?
      throw new MlldImportError(
        `Cannot import from text file ${source}: no exports available`
      );
  }
}
```

### 4.2 Path Evaluator (`interpreter/eval/path.ts`)

**Add** validation to reject module resolvers:

```typescript
// When evaluating @path directive
const resolverManager = env.getResolverManager();
const resolver = resolverManager.getResolver(resolverName);

if (resolver && !resolver.capabilities.contexts.path) {
  throw new MlldDirectiveError(
    `Cannot use ${resolverName} in @path directive: resolver does not support path context`,
    { directive: 'path', resolver: resolverName }
  );
}
```

## Phase 5: Update Environment Variable Handling

### 5.1 Environment.ts Updates

**Update** `createResolverVariable` to handle context:

```typescript
private createResolverVariable(resolverName: string): MlldVariable {
  const resolver = this.resolverManager?.getResolver(resolverName);
  
  if (resolver) {
    // Get default value from resolver
    const result = await resolver.resolve(resolverName, { context: 'variable' });
    
    return {
      type: result.contentType === 'data' ? 'data' : 'text',
      value: result.contentType === 'data' ? JSON.parse(result.content) : result.content,
      nodeId: '',
      location: { line: 0, column: 0 },
      metadata: {
        isReserved: true,
        isResolver: true,
        resolverName,
        contentType: result.contentType
      }
    };
  }
  
  // Fallback for missing resolver
  return { ... };
}
```

## Phase 6: Testing Strategy

### 6.1 Unit Tests for Each Resolver

Create/update tests in:
- `core/resolvers/builtin/TimeResolver.test.ts`
- `core/resolvers/builtin/DebugResolver.test.ts`
- `core/resolvers/builtin/InputResolver.test.ts`
- `core/resolvers/ProjectPathResolver.test.ts`

Test cases:
1. Variable context returns correct contentType
2. Import context returns correct contentType
3. Path context (where applicable) returns correct contentType
4. Unsupported contexts throw appropriate errors

### 6.2 Integration Tests

Create test cases in `tests/cases/valid/resolvers/`:

**content-types/**
- `time-variable-context/example.md` - Test @TIME as variable
- `time-import-context/example.md` - Test @import from @TIME
- `projectpath-variable/example.md` - Test @PROJECTPATH as variable
- `projectpath-path/example.md` - Test [@PROJECTPATH/file]
- `local-content-detection/example.md` - Test LocalResolver detecting types

**validation/**
- `module-import-validation/example.md` - Test module import validation
- `path-context-validation/example.md` - Test path context validation

### 6.3 Error Case Tests

Create test cases in `tests/cases/exceptions/resolvers/`:

- `module-expected-got-text/` - Import from text file
- `path-context-not-supported/` - Using @TIME in path context
- `wrong-content-type/` - Resolver returns unsupported content type

### 6.4 ResolverManager Tests

Update `core/resolvers/ResolverManager.test.ts`:
1. Remove tests for `resourceType`
2. Add tests for content type validation
3. Test context-based resolution

## Phase 7: Migration Notes

### Breaking Changes
1. `ResourceType` enum removed - use `contentType` instead
2. `ResolverCapabilities.needs` removed - wasn't used
3. `supportsImports`/`supportsPaths` replaced with `contexts` object

### Backward Compatibility
- Existing resolvers need capabilities update
- Lock file format unchanged
- Import/export behavior unchanged (just better validated)

## Phase 8: Documentation Updates

1. Update inline code comments
2. Update TSDoc comments on interfaces
3. Add examples in key files showing context-dependent behavior

## Success Criteria

1. All resolver tests pass with new content type system
2. Import validation prevents module imports from non-module sources
3. Path validation prevents module resolvers in path contexts  
4. Context-dependent behavior works for all built-in resolvers
5. Content type detection works for LocalResolver/HTTPResolver
6. Clear error messages when validation fails

## Notes for Implementation

- Start with type definitions (Phase 1) to catch all compilation errors early
- Update resolvers one at a time, running tests after each
- The trickiest part is LocalResolver content detection - may need refinement
- Consider whether GitHubResolver should detect content type or always return 'module'
- HTTPResolver might use Content-Type header as hint for content type detection