# Dynamic Module Resolution: In-Memory Dictionary Spec

## Overview

Add `modules` option to `PathContextBuilder` to enable dynamic (non-filesystem) module resolution for SaaS applications. This allows applications to inject per-user, per-project, or per-request context into mlld templates without writing temporary files to disk.

**Primary use case:** Multi-tenant SaaS applications (like Party) that fetch user/project context from databases and need to compose it into mlld templates at runtime.

**Design approach:** Option A (in-memory dictionary) - simple, eager resolution with pre-computed module strings.

---

## Design Principles

1. **Eager resolution**: Modules loaded upfront before script execution
2. **String-only interface**: All modules must be pre-computed strings (async happens before builder creation)
3. **Explicit precedence**: Dynamic modules override filesystem (but document security implications)
4. **Backwards compatible**: Existing `PathContextBuilder` usage unchanged
5. **Type safety**: All modules subject to same security validation as filesystem imports
6. **Cache-friendly**: Deterministic resolution enables effective caching strategies

---

## API Design

### Constructor Signature

**Before (v1.x):**
```typescript
const builder = new PathContextBuilder('/path/to/templates');
```

**After (v2.0):**
```typescript
// Still works (backwards compatible)
const builder = new PathContextBuilder('/path/to/templates');

// New: with dynamic modules
const builder = new PathContextBuilder({
  basePath: '/path/to/templates',
  modules: {
    '@user/context': userContextMlld,
    '@project/12345': projectContextMlld,
    '@thread/settings': threadSettingsMlld
  }
});
```

### TypeScript Interface

```typescript
// core/types/context.ts

export interface PathContextBuilderOptions {
  basePath: string;
  modules?: Record<string, string>;
}

export class PathContextBuilder {
  constructor(basePathOrOptions: string | PathContextBuilderOptions);

  // ... existing methods
}
```

---

## Resolution Order

When resolving an import path, check sources in this order:

1. **Dynamic modules** (`modules` dictionary) - fastest, in-memory lookup
2. **Filesystem** (relative to `basePath`) - existing behavior
3. **Error** - import not found

**Example:**
```typescript
const builder = new PathContextBuilder({
  basePath: '/app/templates',
  modules: {
    '@user/context': '...',  // 1. Check here first
  }
});

// /import @user/context     → Dynamic module (hit)
// /import @user/other       → Filesystem: /app/templates/@user/other.mld
// /import @missing          → Error: import not found
```

**Rationale for dynamic-first:**
- Performance: Hash table lookup faster than filesystem I/O
- Intent: If user explicitly provides dynamic module, they want it used
- Override semantics: Enables testing (inject mock modules over filesystem)

---

## Implementation

### Phase 1: Type Definitions

**File:** `core/types/context.ts`

```typescript
export interface PathContextBuilderOptions {
  /** Base path for filesystem module resolution */
  basePath: string;

  /**
   * Dynamic (non-filesystem) modules keyed by import path.
   * Keys should be full import paths (e.g., '@user/context', '@project/12345').
   * Values must be valid mlld source strings.
   *
   * Resolution order: modules → filesystem → error
   */
  modules?: Record<string, string>;
}

export interface ModuleSource {
  /** Where this module came from */
  type: 'filesystem' | 'dynamic';

  /** The full import path */
  path: string;

  /** The source content */
  content: string;

  /** Security: Dynamic modules are marked as tainted */
  tainted?: boolean;

  /** For filesystem: absolute path, for dynamic: null */
  fsPath?: string;
}
```

---

### Phase 2: PathContextBuilder Modifications

**File:** `interpreter/env/PathContextBuilder.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import type { PathContextBuilderOptions, ModuleSource } from '@core/types/context';
import { MlldImportError } from '@core/errors';

export class PathContextBuilder {
  private basePath: string;
  private dynamicModules: Map<string, string>;

  constructor(basePathOrOptions: string | PathContextBuilderOptions) {
    if (typeof basePathOrOptions === 'string') {
      // Backwards compatible: string argument
      this.basePath = basePathOrOptions;
      this.dynamicModules = new Map();
    } else {
      // New: options object
      this.basePath = basePathOrOptions.basePath;
      this.dynamicModules = new Map(
        Object.entries(basePathOrOptions.modules || {})
      );
    }
  }

  /**
   * Resolve import path to source content
   *
   * Resolution order:
   * 1. Dynamic modules (in-memory)
   * 2. Filesystem (relative to basePath)
   * 3. Error (not found)
   */
  async resolveModule(importPath: string): Promise<ModuleSource> {
    // 1. Check dynamic modules first
    if (this.dynamicModules.has(importPath)) {
      const content = this.dynamicModules.get(importPath)!;

      return {
        type: 'dynamic',
        path: importPath,
        content,
        tainted: true,  // Always taint dynamic modules
      };
    }

    // 2. Check filesystem
    try {
      const fsPath = this.resolveFilesystemPath(importPath);
      const content = await fs.readFile(fsPath, 'utf-8');

      return {
        type: 'filesystem',
        path: importPath,
        content,
        fsPath,
        tainted: false,
      };
    } catch (error) {
      // Not in filesystem, continue to error
    }

    // 3. Not found anywhere
    throw new MlldImportError(
      `Import not found: '${importPath}' (checked: dynamic modules, ${this.basePath})`,
      { importPath }
    );
  }

  /**
   * Resolve import path to filesystem path
   * Handles @ prefixes and .mld extension
   */
  private resolveFilesystemPath(importPath: string): string {
    // Remove leading @ if present
    const relativePath = importPath.startsWith('@')
      ? importPath.slice(1)
      : importPath;

    // Add .mld extension if not present
    const withExt = relativePath.endsWith('.mld')
      ? relativePath
      : `${relativePath}.mld`;

    return path.join(this.basePath, withExt);
  }

  /**
   * Check if a module exists (dynamic or filesystem)
   */
  async hasModule(importPath: string): Promise<boolean> {
    if (this.dynamicModules.has(importPath)) {
      return true;
    }

    try {
      const fsPath = this.resolveFilesystemPath(importPath);
      await fs.access(fsPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all available dynamic modules (for debugging)
   */
  getDynamicModules(): string[] {
    return Array.from(this.dynamicModules.keys());
  }
}
```

---

### Phase 3: Security Integration

**Requirement:** Dynamic modules MUST go through the same security pipeline as filesystem imports.

**File:** `interpreter/eval/import.ts`

```typescript
import type { ModuleSource } from '@core/types/context';
import { applyTaintTracking } from '@interpreter/security/taint';

/**
 * Evaluate /import directive with security checks
 */
export async function evaluateImportDirective(
  node: ImportDirective,
  env: Environment
): Promise<void> {
  // Resolve module (dynamic or filesystem)
  const moduleSource = await env.pathContext.resolveModule(node.path);

  // CRITICAL: Apply taint tracking to dynamic modules
  if (moduleSource.tainted) {
    const taintContext = {
      source: 'dynamic-module',
      path: moduleSource.path,
      reason: 'Dynamic modules are untrusted by default',
    };

    applyTaintTracking(moduleSource.content, taintContext, env);
  }

  // Parse and evaluate module
  const ast = parse(moduleSource.content);
  await evaluate(ast, env);

  // Log import for audit trail
  if (env.config.security?.auditImports) {
    logImport({
      path: node.path,
      sourceType: moduleSource.type,
      timestamp: Date.now(),
      tainted: moduleSource.tainted || false,
    });
  }
}
```

**Security behaviors:**
- Dynamic modules marked as `tainted: true` by default
- Taint tracking applied to all variables created from dynamic content
- Security guards can check `@ctx.sources` to see data came from dynamic module
- Audit logging captures dynamic vs filesystem distinction

---

### Phase 4: Error Handling

**Validation errors:**

```typescript
// Constructor validation
const builder = new PathContextBuilder({
  basePath: '/app/templates',
  modules: {
    '@user/context': null,  // ✗ Error: module content must be string
    '@user/other': 123,     // ✗ Error: module content must be string
  }
});
// Throws: TypeError: Dynamic module content must be string
```

**Runtime errors:**

```typescript
// Import not found
await builder.resolveModule('@missing');
// Throws: MlldImportError: Import not found: '@missing' (checked: dynamic modules, /app/templates)

// Invalid mlld syntax in dynamic module
const builder = new PathContextBuilder({
  basePath: '/app',
  modules: {
    '@user/bad': '/var @x = invalid syntax here',
  }
});
// Throws: MlldParseError during evaluation (same as filesystem imports)
```

---

## Usage Examples

### Basic Usage (Party SaaS Example)

```typescript
import { PathContextBuilder, processMlld } from 'mlld';

// Fetch user context from database (async)
const user = await db.users.findUnique({ where: { id: userId } });
const project = await db.projects.findUnique({ where: { id: projectId } });

// Generate mlld modules (sync string creation)
const userContext = `
/var @userId = "${user.id}"
/var @userName = "${user.name}"
/var @userTier = "${user.subscriptionTier}"
`;

const projectContext = `
/var @projectId = "${project.id}"
/var @projectName = "${project.name}"
/var @projectSettings = ${JSON.stringify(project.settings)}
`;

// Create builder with dynamic modules
const builder = new PathContextBuilder({
  basePath: '/app/templates',
  modules: {
    '@user/context': userContext,
    '@project/context': projectContext,
  }
});

// Process template that imports dynamic modules
const template = `
/import @user/context
/import @project/context

Hello @userName! Your project @projectName is on @userTier tier.
`;

const result = await processMlld(template, { pathContext: builder });
console.log(result);
// Output: "Hello Alice! Your project MyApp is on pro tier."
```

---

### Multi-User Parallel Processing

```typescript
import { PathContextBuilder, processMlld } from 'mlld';

async function processUserBatch(userIds: string[]) {
  // Process multiple users in parallel
  const results = await Promise.all(
    userIds.map(async (userId) => {
      // Fetch user-specific data
      const user = await db.users.findUnique({ where: { id: userId } });

      // Create user-specific builder
      const builder = new PathContextBuilder({
        basePath: '/app/templates',
        modules: {
          '@user/context': generateUserContext(user),
        }
      });

      // Process template with user-specific context
      return await processMlld(template, { pathContext: builder });
    })
  );

  return results;
}

function generateUserContext(user: User): string {
  return `
/var @userId = "${user.id}"
/var @userName = "${user.name}"
/var @preferences = ${JSON.stringify(user.preferences)}
`;
}
```

---

### Testing with Mock Modules

```typescript
import { PathContextBuilder, processMlld } from 'mlld';

describe('user notification template', () => {
  test('renders correctly for premium user', async () => {
    const builder = new PathContextBuilder({
      basePath: '/app/templates',
      modules: {
        // Override filesystem @user/context with test data
        '@user/context': `
          /var @userId = "test-user-1"
          /var @userName = "Test User"
          /var @userTier = "premium"
        `,
      }
    });

    const result = await processMlld(notificationTemplate, {
      pathContext: builder
    });

    expect(result).toContain('Premium features');
  });

  test('renders correctly for free user', async () => {
    const builder = new PathContextBuilder({
      basePath: '/app/templates',
      modules: {
        '@user/context': `
          /var @userId = "test-user-2"
          /var @userName = "Free User"
          /var @userTier = "free"
        `,
      }
    });

    const result = await processMlld(notificationTemplate, {
      pathContext: builder
    });

    expect(result).not.toContain('Premium features');
  });
});
```

---

### Caching Strategy

```typescript
import { createHash } from 'crypto';
import { PathContextBuilder, processMlld } from 'mlld';

class CachedTemplateProcessor {
  private cache = new Map<string, string>();

  async process(
    template: string,
    userId: string,
    projectId: string
  ): Promise<string> {
    // Fetch data (could be cached separately)
    const user = await this.getUser(userId);
    const project = await this.getProject(projectId);

    // Generate cache key from template + data
    const cacheKey = this.generateCacheKey(template, user, project);

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Not cached, process template
    const builder = new PathContextBuilder({
      basePath: '/app/templates',
      modules: {
        '@user/context': this.generateUserContext(user),
        '@project/context': this.generateProjectContext(project),
      }
    });

    const result = await processMlld(template, { pathContext: builder });

    // Cache result
    this.cache.set(cacheKey, result);
    return result;
  }

  private generateCacheKey(
    template: string,
    user: User,
    project: Project
  ): string {
    // Hash template + relevant user/project fields
    const hash = createHash('sha256');
    hash.update(template);
    hash.update(JSON.stringify({
      userId: user.id,
      userName: user.name,
      userTier: user.tier,
      projectId: project.id,
      projectSettings: project.settings,
    }));
    return hash.digest('hex');
  }

  private generateUserContext(user: User): string {
    return `
/var @userId = "${user.id}"
/var @userName = "${user.name}"
/var @userTier = "${user.tier}"
`;
  }

  private generateProjectContext(project: Project): string {
    return `
/var @projectId = "${project.id}"
/var @projectSettings = ${JSON.stringify(project.settings)}
`;
  }
}
```

---

## Security Considerations

### Taint Tracking

**Requirement:** All dynamic modules are marked as tainted by default.

```typescript
// Dynamic modules are automatically tainted
const builder = new PathContextBuilder({
  basePath: '/app/templates',
  modules: {
    '@user/context': userContext,  // Will be tainted
  }
});

// Variables from dynamic modules inherit taint
// Template: /import @user/context
// After import, @userId, @userName, etc. are tainted

// Guards can check taint
/guard for untrusted = when [
  @ctx.sources.includes('dynamic-module') =>
    deny "Cannot use dynamic module data in shell commands"
  * => allow
]
```

**Why taint by default:**
- Dynamic content comes from databases, APIs, user input (untrusted sources)
- Forces explicit security review via guards
- Prevents accidental injection vulnerabilities

---

### Path Validation

**Question:** Should dynamic module paths be validated/restricted?

**Current design:** No restrictions - any string key allowed.

**Rationale:**
- Flexibility: Allow any naming scheme (@ prefixes optional)
- Non-filesystem: Dynamic modules don't touch filesystem, so path traversal not a concern
- Explicit: User controls the dictionary keys completely

**Alternative (stricter):**
Could enforce naming conventions:
```typescript
// Require @ prefix?
modules: {
  'user/context': '...',  // ✗ Error: dynamic modules must start with @
  '@user/context': '...',  // ✓ OK
}

// Restrict characters?
modules: {
  '@user/../evil': '...',  // ✗ Error: path traversal not allowed
  '@user/context': '...',  // ✓ OK
}
```

**Decision for v1:** No restrictions. Keep it simple.

---

### Content Sanitization

**Requirement:** Dynamic modules parsed and validated like filesystem modules.

```typescript
// Invalid syntax in dynamic module
const builder = new PathContextBuilder({
  modules: {
    '@user/bad': '/var @x = <this is invalid mlld syntax>',
  }
});

// Parse error thrown during import evaluation (same as filesystem)
await processMlld('/import @user/bad', { pathContext: builder });
// Throws: MlldParseError: Unexpected token '<' at line 1
```

**No special treatment:** Dynamic modules go through same parser, same evaluator, same security pipeline.

---

### Injection Vulnerabilities

**Danger:** User-provided data must be escaped when generating modules.

**Bad (vulnerable to injection):**
```typescript
// User controls userName, could inject malicious mlld
const userContext = `
/var @userName = "${user.name}"
`;
// If user.name = '"; /run {rm -rf /}; /var @x = "'
// Result: /var @userName = ""; /run {rm -rf /}; /var @x = ""
```

**Good (escape user data):**
```typescript
import { escapeMlldString } from 'mlld/utils';

const userContext = `
/var @userName = ${JSON.stringify(user.name)}
`;
// JSON.stringify escapes quotes and special chars
// If user.name = '"; /run {rm -rf /}; /var @x = "'
// Result: /var @userName = "\"; /run {rm -rf /}; /var @x = \""
```

**Best (use structured data):**
```typescript
// Generate module from structured data (safer)
function generateUserContext(user: User): string {
  const data = {
    userId: user.id,
    userName: user.name,
    userTier: user.tier,
  };

  return Object.entries(data)
    .map(([key, value]) => `/var @${key} = ${JSON.stringify(value)}`)
    .join('\n');
}
```

---

### Audit Logging

**Recommendation:** Log all dynamic module usage for security audits.

```typescript
// Enable audit logging
const env = new Environment({
  security: {
    auditImports: true,
    auditLogPath: '/var/log/mlld-imports.log',
  }
});

// Logs include:
// - Import path
// - Source type (dynamic vs filesystem)
// - Timestamp
// - Taint status
// - User context (if available)

// Example log entry:
{
  "timestamp": "2025-01-15T10:30:00Z",
  "importPath": "@user/context",
  "sourceType": "dynamic",
  "tainted": true,
  "userId": "user-12345",
  "requestId": "req-abc-def"
}
```

---

## Performance Considerations

### Memory Usage

**Dictionary size:** Dynamic modules stored in memory for script duration.

**Typical usage (Party example):**
- User context: ~500 bytes
- Project context: ~1KB
- Thread settings: ~200 bytes
- **Total per request:** ~2KB

**Scale:** 1000 concurrent requests = ~2MB memory (negligible)

**Concern:** Large modules (> 100KB each) could add up. Consider warning or limit?

---

### Lookup Performance

**Dynamic module lookup:** O(1) hash table lookup (Map)
**Filesystem lookup:** O(1) syscall + disk I/O

**Dynamic modules are faster** - no I/O, just memory access.

**Benchmark (expected):**
```
Dynamic module resolution:   <0.1ms
Filesystem resolution:       1-5ms (SSD), 10-50ms (HDD)
```

---

### Caching Implications

**External caching is user's responsibility**, but mlld provides cache keys:

```typescript
import { generateCacheKey } from 'mlld/utils';

// Generate cache key for template + context
const cacheKey = generateCacheKey({
  template: templateSource,
  basePath: '/app/templates',
  dynamicModules: {
    '@user/context': userContext,
    '@project/context': projectContext,
  }
});

// Check cache
const cached = await redis.get(cacheKey);
if (cached) return cached;

// Process and cache
const result = await processMlld(template, { pathContext: builder });
await redis.set(cacheKey, result, { ex: 3600 });
```

---

## Migration Guide

### Upgrading from v1.x

**Before (v1.x - write temp files):**
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathContextBuilder, processMlld } from 'mlld';

// Fetch user data
const user = await db.users.findUnique({ where: { id: userId } });

// Write temp file
const tempFile = path.join('/tmp', `user-${userId}-context.mld`);
await fs.writeFile(tempFile, `
/var @userId = "${user.id}"
/var @userName = "${user.name}"
`);

// Import temp file
const template = `/import ${tempFile}\n...`;
const result = await processMlld(template);

// Cleanup
await fs.unlink(tempFile);
```

**After (v2.0 - dynamic modules):**
```typescript
import { PathContextBuilder, processMlld } from 'mlld';

// Fetch user data
const user = await db.users.findUnique({ where: { id: userId } });

// Create builder with dynamic module (no temp files!)
const builder = new PathContextBuilder({
  basePath: '/app/templates',
  modules: {
    '@user/context': `
/var @userId = "${user.id}"
/var @userName = "${user.name}"
    `,
  }
});

// Import dynamic module
const template = `/import @user/context\n...`;
const result = await processMlld(template, { pathContext: builder });

// No cleanup needed!
```

**Benefits:**
- ✅ No temp file I/O (faster)
- ✅ No cleanup needed (simpler)
- ✅ No disk space usage
- ✅ No race conditions (temp file collisions)
- ✅ Better for serverless (read-only filesystems)

---

## Testing Strategy

### Unit Tests

**File:** `interpreter/env/PathContextBuilder.test.ts`

```typescript
describe('PathContextBuilder with dynamic modules', () => {
  test('resolves dynamic module over filesystem', async () => {
    const builder = new PathContextBuilder({
      basePath: '/app/templates',
      modules: {
        '@user/context': '/var @x = "dynamic"',
      }
    });

    // Assume filesystem also has @user/context.mld
    // Should prefer dynamic
    const source = await builder.resolveModule('@user/context');
    expect(source.type).toBe('dynamic');
    expect(source.content).toContain('dynamic');
  });

  test('falls back to filesystem when not in dynamic modules', async () => {
    const builder = new PathContextBuilder({
      basePath: __dirname + '/fixtures',
      modules: {
        '@user/context': '/var @x = "dynamic"',
      }
    });

    const source = await builder.resolveModule('@other/module');
    expect(source.type).toBe('filesystem');
  });

  test('throws error when module not found anywhere', async () => {
    const builder = new PathContextBuilder({
      basePath: '/app/templates',
      modules: {}
    });

    await expect(builder.resolveModule('@missing'))
      .rejects.toThrow('Import not found');
  });

  test('marks dynamic modules as tainted', async () => {
    const builder = new PathContextBuilder({
      basePath: '/app/templates',
      modules: {
        '@user/context': '/var @x = "test"',
      }
    });

    const source = await builder.resolveModule('@user/context');
    expect(source.tainted).toBe(true);
  });

  test('does not mark filesystem modules as tainted', async () => {
    const builder = new PathContextBuilder({
      basePath: __dirname + '/fixtures',
      modules: {}
    });

    const source = await builder.resolveModule('@local/module');
    expect(source.tainted).toBe(false);
  });

  test('backwards compatible with string constructor', async () => {
    const builder = new PathContextBuilder('/app/templates');
    expect(builder.getDynamicModules()).toEqual([]);
  });
});
```

---

### Integration Tests

**File:** `tests/cases/import-dynamic-modules.test.ts`

```typescript
describe('dynamic module imports', () => {
  test('imports dynamic module successfully', async () => {
    const builder = new PathContextBuilder({
      basePath: '/tmp',
      modules: {
        '@user/context': '/var @userName = "Alice"',
      }
    });

    const result = await processMlld(
      '/import @user/context\nHello @userName!',
      { pathContext: builder }
    );

    expect(result).toBe('Hello Alice!');
  });

  test('dynamic module variables are tainted', async () => {
    const builder = new PathContextBuilder({
      basePath: '/tmp',
      modules: {
        '@user/context': '/var @userInput = "data"',
      }
    });

    const template = `
/guard for untrusted = when [
  @ctx.sources.includes('dynamic-module') => deny "Blocked"
  * => allow
]

/import @user/context
/run {echo @userInput}
`;

    await expect(processMlld(template, { pathContext: builder }))
      .rejects.toThrow('Blocked');
  });
});
```

---

## Future Enhancements

See `future-contextbuilder-resolver.md` for Option B (lazy resolution with async resolver).

**Potential v3+ features:**
- **Module validation**: Schema validation for dynamic modules
- **Module namespacing**: Automatic prefix enforcement (`@dynamic/*`)
- **Module hot reloading**: Update dynamic modules mid-execution
- **Module composition**: Merge multiple dynamic modules
- **Module encryption**: Encrypt sensitive dynamic module content

---

## Implementation Checklist

### Phase 1: Core Implementation
- [ ] Add `PathContextBuilderOptions` interface to `core/types/context.ts`
- [ ] Add `ModuleSource` type to `core/types/context.ts`
- [ ] Modify `PathContextBuilder` constructor to accept options object
- [ ] Implement `resolveModule()` with dynamic-first resolution
- [ ] Add `getDynamicModules()` debug method

### Phase 2: Security Integration
- [ ] Mark dynamic modules as `tainted: true` in `ModuleSource`
- [ ] Integrate taint tracking in `evaluateImportDirective()`
- [ ] Add audit logging for dynamic module imports
- [ ] Add `@ctx.sources` metadata for guards

### Phase 3: Testing
- [ ] Unit tests for `PathContextBuilder` with dynamic modules
- [ ] Unit tests for resolution order (dynamic → filesystem → error)
- [ ] Integration tests for dynamic module imports
- [ ] Integration tests for taint tracking with dynamic modules
- [ ] Performance benchmarks (dynamic vs filesystem resolution)

### Phase 4: Documentation
- [ ] Update `docs/user/imports.md` with dynamic module examples
- [ ] Update `docs/dev/CONTEXT.md` with implementation details
- [ ] Add migration guide for v1.x users
- [ ] Add security best practices for dynamic modules
- [ ] Update API reference documentation

### Phase 5: Tooling
- [ ] Add `generateCacheKey()` utility function
- [ ] Add `escapeMlldString()` utility for injection prevention
- [ ] Add TypeScript types to package exports
- [ ] Update CLI to support dynamic modules (if applicable)

---

## Success Criteria

This feature is complete when:

1. ✅ Can construct `PathContextBuilder` with `modules` option
2. ✅ Dynamic modules resolved before filesystem (precedence)
3. ✅ Dynamic modules marked as tainted by default
4. ✅ Taint tracking applied to variables from dynamic modules
5. ✅ Parse errors in dynamic modules handled same as filesystem
6. ✅ Backwards compatible with existing `PathContextBuilder(string)` usage
7. ✅ Comprehensive test coverage (unit + integration)
8. ✅ Documentation includes security best practices
9. ✅ Performance benchmarks show dynamic resolution is faster
10. ✅ Migration guide helps v1.x users upgrade

---

## Open Questions

1. **Should we enforce naming conventions for dynamic module paths?**
   - **Decision:** No restrictions for v1. Keep it simple and flexible.

2. **Should we limit the size of dynamic modules?**
   - **Decision:** No hard limit for v1. Add warning in docs about large modules (> 100KB).

3. **Should we allow disabling taint tracking for trusted dynamic modules?**
   - **Decision:** No for v1. Always taint. If needed, can add `trusted: true` option in v2.

4. **Should we validate that dynamic module paths don't conflict with filesystem?**
   - **Decision:** No. Allow overrides (useful for testing). Document security implications.

5. **Should we provide helper functions for generating common module patterns?**
   - **Decision:** Yes, add `generateCacheKey()` and `escapeMlldString()` utilities.

---

## Related Documents

- `future-contextbuilder-resolver.md` - Option B (lazy async resolver)
- `mlld-feature-request-dynamic-modules.md` - Original feature request from Party
- `spec-security.md` - Security model (taint tracking, guards)
- `docs/user/imports.md` - Import system documentation
- `docs/dev/CONTEXT.md` - Context builder architecture

---

**Status:** Draft specification for review
**Version:** 1.0
**Next steps:** Review → Type definitions → Implementation → Testing → Documentation
