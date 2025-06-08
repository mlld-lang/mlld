# Workstream: TTL/Trust Enforcement

## Overview
Connect the parsed TTL/trust values from the AST to actual caching and security decisions. Grammar support exists but values are ignored during execution.

## Current State
- Grammar parses TTL/trust into AST metadata ✅
- SecurityOptions type exists in AST nodes ✅
- Values are ignored by interpreter ❌
- No connection to cache or security decisions ❌

## Implementation Plan

### Phase 1: Update Variable Storage (Day 1)

```typescript
// Extend MlldVariable to include security metadata
export interface MlldVariable {
  type: 'text' | 'data' | 'path' | 'command' | 'template';
  value: any;
  ttl?: TTLConfig;        // Add TTL metadata
  trust?: TrustLevel;      // Add trust metadata
  source?: SourceLocation; // Where it was defined
}

// In interpreter/eval/path.ts
async function evaluatePath(directive: DirectiveNode, env: Environment): Promise<void> {
  const { identifier, path, ttl, trust } = extractPathData(directive);
  
  const resolvedPath = await resolvePath(path, env);
  
  // Store with metadata
  env.setVariable(identifier, {
    type: 'path',
    value: resolvedPath,
    ttl: directive.meta?.ttl,
    trust: directive.meta?.trust,
    source: directive.location
  });
}
```

### Phase 2: TTL-Aware Caching (Day 2)

```typescript
// Update URLCache to respect TTL
class URLCache {
  async get(url: string, ttl?: TTLConfig): Promise<string | null> {
    // Handle special TTL values
    if (ttl?.type === 'live') {
      return null; // Always fetch fresh
    }
    
    const cached = await this.cache.get(url);
    if (!cached) return null;
    
    if (ttl?.type === 'static') {
      return cached.content; // Never expires
    }
    
    if (ttl?.type === 'ttl' && ttl.value) {
      const age = Date.now() - cached.timestamp;
      if (age > ttl.value) {
        return null; // Expired
      }
    }
    
    return cached.content;
  }
}

// In import evaluator
async function importFromURL(url: string, env: Environment): Promise<string> {
  // Check if URL has associated TTL from variable
  const urlVar = env.findVariableByValue(url);
  const ttl = urlVar?.ttl;
  
  // Try cache with TTL
  const cached = await env.urlCache.get(url, ttl);
  if (cached) return cached;
  
  // Fetch fresh
  const content = await env.fetchURL(url);
  
  // Cache unless it's 'live'
  if (ttl?.type !== 'live') {
    await env.urlCache.set(url, content, { ttl });
  }
  
  return content;
}
```

### Phase 3: Trust Level Integration (Day 3)

```typescript
// Connect trust levels to SecurityManager
async function evaluateRun(directive: DirectiveNode, env: Environment): Promise<string> {
  const command = await interpolate(directive.values.command, env);
  const trust = directive.meta?.trust;
  
  // Pass trust level to security check
  const decision = await env.security.checkCommand(command, {
    trust,
    source: directive.location,
    directive: 'run'
  });
  
  if (decision.blocked) {
    throw new MlldCommandExecutionError(`Command blocked: ${decision.reason}`);
  }
  
  if (decision.requiresApproval) {
    const approved = await env.promptApproval(command, decision);
    if (!approved) {
      throw new MlldCommandExecutionError('Command execution cancelled by user');
    }
  }
  
  return await env.executeCommand(command);
}
```

### Phase 4: Lock File Updates (Day 4)

```typescript
// Auto-save TTL/trust decisions to lock file
class LockFileManager {
  async recordImportDecision(
    importPath: string,
    resolved: string,
    content: string,
    metadata: { ttl?: TTLConfig; trust?: TrustLevel }
  ): Promise<void> {
    const entry: LockEntry = {
      resolved,
      integrity: await this.calculateIntegrity(content),
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown',
      ...(metadata.ttl && { ttl: metadata.ttl }),
      ...(metadata.trust && { trust: metadata.trust })
    };
    
    await this.lockFile.addImport(importPath, entry);
  }
}

// In import evaluator
async function handleImportApproval(importPath: string, content: string, env: Environment): Promise<void> {
  // Extract metadata from import directive
  const importVar = env.getImportMetadata(importPath);
  
  // Record decision with TTL/trust
  await env.lockFileManager.recordImportDecision(
    importPath,
    resolvedPath,
    content,
    {
      ttl: importVar?.ttl,
      trust: importVar?.trust
    }
  );
}
```

### Phase 5: Global Lock File Support (Day 5)

```typescript
// Implement global lock file loading
class Environment {
  private globalLockFile?: LockFile;
  
  async loadGlobalLockFile(): Promise<void> {
    const globalPath = path.join(os.homedir(), '.config', 'mlld', 'mlld.lock.json');
    if (await this.fileSystem.exists(globalPath)) {
      this.globalLockFile = new LockFile(globalPath);
    }
  }
  
  // Check both global and project lock files
  async getImportTTL(importPath: string): Promise<TTLConfig | undefined> {
    // Check project first (more specific)
    const projectEntry = this.lockFile?.getImport(importPath);
    if (projectEntry?.ttl) return projectEntry.ttl;
    
    // Fall back to global
    const globalEntry = this.globalLockFile?.getImport(importPath);
    return globalEntry?.ttl;
  }
}
```

## Testing

1. TTL cache behavior tests (live, static, time-based)
2. Trust level precedence tests
3. Lock file auto-update tests
4. Global vs project precedence tests

## Success Criteria

- [ ] TTL values control caching behavior
- [ ] Trust levels affect security decisions
- [ ] Lock files record TTL/trust metadata
- [ ] Global lock file provides defaults
- [ ] Performance impact < 10ms per operation