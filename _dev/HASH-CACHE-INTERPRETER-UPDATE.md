# Hash Cache Interpreter Update Implementation Plan

## Overview
Update the interpreter to resolve module references from the lock file and integrate with the new content-addressed cache system.

## Context
- Read `_dev/HASH-CACHE.md` for the full design
- Read `CLAUDE.md` for project conventions
- This is phase 3 of 3 for implementing the hash cache system
- Phases 1 (registry) and 2 (grammar) must be complete before starting this

## Current State
- Interpreter resolves imports by fetching URLs or reading files
- No lock file integration
- Import evaluator in `interpreter/eval/import.ts`
- Environment class handles file system operations

## Implementation Tasks

### 1. Add Lock File to Environment
**File**: `interpreter/core/Environment.ts`

Add lock file integration:

```typescript
export class Environment {
  private lockFile: LockFile;
  private cache: Cache;
  
  constructor(options: EnvironmentOptions) {
    // ... existing code ...
    
    // Initialize lock file and cache
    const mlldDir = path.join(this.basePath, '.mlld');
    this.lockFile = new LockFile(path.join(mlldDir, 'mlld.lock.json'));
    this.cache = new Cache(path.join(mlldDir, 'cache'));
  }
  
  // New method to resolve module references
  async resolveModuleImport(
    source: ModuleReferenceNode | AliasReferenceNode
  ): Promise<string> {
    // Implementation below
  }
}
```

### 2. Update Import Evaluator
**File**: `interpreter/eval/import.ts`

Handle new import source types:

```typescript
export async function evaluateImport(
  node: ImportNode,
  env: Environment
): Promise<EvalResult> {
  let content: string;
  let resolvedPath: string;
  
  // Determine source type and resolve accordingly
  switch (node.source.type) {
    case 'module-reference':
      content = await resolveModuleReference(node.source, env);
      break;
      
    case 'alias-reference':
      content = await resolveAliasReference(node.source, env);
      break;
      
    case 'path':
      // Existing path resolution
      content = await resolvePathImport(node.source, env);
      break;
      
    default:
      throw new MlldImportError(
        `Unknown import source type: ${(node.source as any).type}`,
        { node }
      );
  }
  
  // ... rest of import evaluation
}
```

### 3. Module Resolution Logic
**New file**: `interpreter/eval/module-resolver.ts`

```typescript
async function resolveModuleReference(
  ref: ModuleReferenceNode,
  env: Environment
): Promise<string> {
  const moduleKey = `@${ref.username}/${ref.name}`;
  const entry = env.lockFile.getModule(moduleKey);
  
  if (!entry) {
    throw new MlldImportError(
      `Module not found in lock file: ${moduleKey}\n` +
      `Run 'mlld install ${moduleKey}' to add it to your project`,
      { node: ref }
    );
  }
  
  // Check version match if specified
  if (ref.version && !entry.shortHash.startsWith(ref.version)) {
    throw new MlldImportError(
      `Version mismatch for ${moduleKey}\n` +
      `Requested: ${ref.version}\n` +
      `Locked: ${entry.shortHash}\n` +
      `Run 'mlld install ${moduleKey}@${ref.version}' to update`,
      { node: ref }
    );
  }
  
  // Check TTL
  if (await shouldUpdate(entry)) {
    console.warn(
      `Module ${moduleKey} is outdated (TTL expired).\n` +
      `Run 'mlld update ${moduleKey}' to refresh`
    );
  }
  
  // Get from cache
  const content = await env.cache.get(entry.hash);
  if (!content) {
    throw new MlldImportError(
      `Module ${moduleKey} not found in cache.\n` +
      `Run 'mlld install' to download all dependencies`,
      { node: ref }
    );
  }
  
  return content;
}

async function resolveAliasReference(
  ref: AliasReferenceNode,
  env: Environment
): Promise<string> {
  const aliasKey = `@${ref.name}`;
  const entry = env.lockFile.getModule(aliasKey);
  
  if (!entry || !entry.alias) {
    throw new MlldImportError(
      `Alias not found: ${aliasKey}\n` +
      `Available aliases: ${env.lockFile.listAliases().join(', ')}`,
      { node: ref }
    );
  }
  
  // Similar flow to module resolution
  // ... cache lookup, TTL check, etc.
}

function shouldUpdate(entry: LockEntry): boolean {
  if (!entry.ttl) return false;
  
  const now = Date.now();
  const lastChecked = new Date(entry.lastChecked).getTime();
  return (lastChecked + entry.ttl) < now;
}
```

### 4. Lock File Interface
**File**: `core/registry/LockFile.ts`

Add methods needed by interpreter:

```typescript
export class LockFile {
  // Get a specific module or alias
  getModule(key: string): LockEntry | null;
  
  // List all aliases (for error messages)
  listAliases(): string[];
  
  // Check if a module exists
  hasModule(key: string): boolean;
  
  // Get all modules (for validation)
  getAllModules(): Record<string, LockEntry>;
}
```

### 5. Error Messages
**File**: `core/errors/messages/index.ts`

Add helpful error messages:

```typescript
export const importErrors = {
  moduleNotInLock: (module: string) => ({
    message: `Module not found in lock file: ${module}`,
    suggestion: `Run 'mlld install ${module}' to add it to your project`,
    code: 'MODULE_NOT_LOCKED'
  }),
  
  versionMismatch: (module: string, requested: string, locked: string) => ({
    message: `Version mismatch for ${module}`,
    details: `Requested: ${requested}, Locked: ${locked}`,
    suggestion: `Run 'mlld install ${module}@${requested}' to update`,
    code: 'VERSION_MISMATCH'
  }),
  
  aliasNotFound: (alias: string, available: string[]) => ({
    message: `Alias not found: ${alias}`,
    suggestion: available.length > 0 
      ? `Available aliases: ${available.join(', ')}`
      : `Run 'mlld add <url> --alias ${alias.slice(1)}' to create this alias`,
    code: 'ALIAS_NOT_FOUND'
  }),
  
  notInCache: (module: string) => ({
    message: `Module ${module} not found in cache`,
    suggestion: `Run 'mlld install' to download all dependencies`,
    code: 'MODULE_NOT_CACHED'
  }),
  
  ttlExpired: (module: string) => ({
    message: `Module ${module} cache has expired`,
    suggestion: `Run 'mlld update ${module}' to refresh`,
    code: 'TTL_EXPIRED',
    severity: 'warning'
  })
};
```

### 6. Integration Points

Update these files to work with new import resolution:

1. **Environment constructor** - Initialize lock file and cache
2. **Import evaluator** - Route to appropriate resolver
3. **Error handling** - Show helpful messages for module errors
4. **Variable tracking** - Track which variables came from which modules

### 7. Offline Mode Support

The interpreter should work fully offline if all modules are cached:
- No network calls during execution
- Clear errors if modules missing from cache
- Warnings for expired TTLs but continue execution

## Testing Plan

### Unit Tests
1. Module resolution with valid lock entry
2. Alias resolution 
3. Version mismatch detection
4. TTL expiration warnings
5. Missing module errors
6. Missing cache errors

### Integration Tests
1. Full import flow with locked modules
2. Mixed imports (modules + paths)
3. Nested module imports
4. Offline execution
5. Error message quality

### E2E Tests
1. Create project with modules
2. Run interpreter offline
3. Update modules and re-run
4. Version conflicts

## Migration Path

For existing mlld files:
- Path-based imports continue to work
- No breaking changes
- Clear errors guide users to new commands

## Success Criteria

- [ ] Interpreter resolves module imports from lock file
- [ ] No network calls during execution
- [ ] Clear error messages for missing modules
- [ ] TTL warnings shown but don't block execution
- [ ] Version validation works correctly
- [ ] All tests passing
- [ ] Offline mode fully functional

## Performance Considerations

- Lock file loaded once and cached in Environment
- Module content cached in memory after first load
- No repeated file system access for same module
- Fast hash lookups in cache

## Security Notes

- Interpreter never fetches content - only reads from cache
- All content verified by hash before use
- Lock file is source of truth for approved content

## Next Steps

After all three phases complete:
1. Update documentation
2. Create tutorial for module usage
3. Implement garbage collection for old cache entries