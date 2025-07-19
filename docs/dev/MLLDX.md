# mlldx - Ephemeral Mode Implementation

## Overview

`mlldx` is a specialized binary variant of mlld designed for ephemeral environments like CI/CD pipelines, serverless functions, and containerized deployments. It runs with all caching in memory and auto-approves imports, making it ideal for non-interactive, read-only environments.

## Architecture

### Binary Structure

mlldx ships as part of the main mlld npm package with two entry points:

```
bin/
├── mlld-wrapper.cjs    # Standard mlld binary
└── mlldx-wrapper.cjs   # Ephemeral mlldx binary
```

The mlldx wrapper sets environment variables to enable ephemeral mode:

```javascript
// bin/mlldx-wrapper.cjs
const env = {
  ...process.env,
  MLLD_EPHEMERAL: 'true',
  MLLD_BINARY_NAME: 'mlldx'
};

// Launch CLI with --ephemeral and --risky-approve-all flags
spawn('node', [cliPath, '--ephemeral', '--risky-approve-all', ...args])
```

### Ephemeral Mode Components

#### 1. InMemoryModuleCache

Replaces the filesystem-based module cache with an in-memory Map:

```typescript
// core/registry/InMemoryModuleCache.ts
export class InMemoryModuleCache implements ModuleCache {
  private cache = new Map<string, {
    content: string;
    metadata: ModuleCacheMetadata;
    timestamp: number;
  }>();
  
  async store(content: string, source: string): Promise<CacheEntry> {
    const hash = createHash('sha256').update(content).digest('hex');
    this.cache.set(hash, { content, metadata, timestamp });
    return { hash, source };
  }
  
  async retrieve(hash: string): Promise<string | null> {
    return this.cache.get(hash)?.content || null;
  }
}
```

#### 2. NoOpLockFile

Provides a no-operation implementation of the lock file interface:

```typescript
// core/registry/NoOpLockFile.ts
export class NoOpLockFile implements LockFile {
  private inMemoryLock: LockFileData = {
    version: '1.0.0',
    imports: {}
  };
  
  async read(): Promise<LockFileData> {
    return this.inMemoryLock;
  }
  
  async write(data: LockFileData): Promise<void> {
    this.inMemoryLock = data;
  }
}
```

#### 3. ImmutableCache with In-Memory Mode

The security cache supports an in-memory mode:

```typescript
// core/security/ImmutableCache.ts
export class ImmutableCache {
  private inMemory: boolean;
  private memoryCache?: Map<string, any>;
  
  constructor(projectPath: string, options?: ImmutableCacheOptions) {
    this.inMemory = options?.inMemory || false;
    if (this.inMemory) {
      this.memoryCache = new Map();
    }
  }
}
```

### Environment Configuration

The Environment class has a `setEphemeralMode` method that reconfigures all components:

```typescript
// interpreter/env/Environment.ts
async setEphemeralMode(ephemeral: boolean): Promise<void> {
  if (!ephemeral || this.parent) return;
  
  // Auto-approve all imports
  this.approveAllImports = true;
  
  // Replace components with ephemeral implementations
  const moduleCache = new InMemoryModuleCache();
  const lockFile = new NoOpLockFile(path.join(this.getProjectRoot(), 'mlld.lock.json'));
  
  // Recreate resolver manager with ephemeral components
  this.resolverManager = new ResolverManager(
    this.fileSystem,
    this.pathService,
    lockFile,
    moduleCache,
    this.urlCacheManager,
    this.getProjectRoot()
  );
  
  // Re-register all resolvers
  this.resolverManager.registerResolver(new ProjectPathResolver(this.fileSystem));
  this.resolverManager.registerResolver(new RegistryResolver());
  // ... etc
}
```

## Implementation Flow

### 1. Startup Sequence

```
mlldx command → mlldx-wrapper.cjs → CLI with flags → Environment setup
```

1. User runs `mlldx script.mld`
2. mlldx-wrapper.cjs sets environment variables
3. Launches CLI with `--ephemeral` and `--risky-approve-all` flags
4. CLI detects ephemeral mode and calls `env.setEphemeralMode(true)`
5. Environment reconfigures all components for in-memory operation

### 2. Module Resolution

In ephemeral mode, module resolution works identically but with different storage:

```
Import request → ResolverManager → RegistryResolver → Fetch module → InMemoryModuleCache
```

- Modules are fetched from the registry as normal
- Content is stored in InMemoryModuleCache instead of filesystem
- Cache lookups check memory instead of disk
- No `.mlld-cache` directory is created

### 3. Import Approval

With `--risky-approve-all` flag:
- ImportApproval.checkApproval() always returns true
- No interactive prompts are shown
- Security warnings are suppressed
- Suitable only for trusted environments

## Use Cases

### CI/CD Pipelines

```yaml
# GitHub Actions example
- name: Run mlld script
  run: npx mlldx@latest scripts/deploy.mld
```

### Serverless Functions

```javascript
// Vercel function example
export default async function handler(req, res) {
  const { execSync } = require('child_process');
  const result = execSync('npx mlldx@latest process.mld', {
    input: JSON.stringify(req.body)
  });
  res.json({ output: result.toString() });
}
```

### Docker Containers

```dockerfile
FROM node:18-alpine
RUN npm install -g mlld@latest
CMD ["mlldx", "/scripts/startup.mld"]
```

## Security Considerations

### Trade-offs

mlldx trades security for convenience in ephemeral environments:

1. **No Import Approval**: All imports are automatically approved
2. **No Persistence**: Security decisions aren't remembered between runs
3. **No Audit Trail**: Import history isn't preserved

### Best Practices

1. **Use only in trusted environments** - CI/CD with known scripts
2. **Pin module versions** - Use specific versions in imports
3. **Review scripts beforehand** - Audit mlld scripts before deployment
4. **Limit network access** - Restrict outbound connections if possible

## Testing

### Unit Tests

```typescript
// tests/ephemeral-mode.test.ts
describe('Ephemeral Mode (mlldx)', () => {
  it('should run without creating cache directory', () => {
    execSync(`mlldx ${testScript}`);
    expect(fs.existsSync('.mlld-cache')).toBe(false);
  });
  
  it('should auto-approve imports', () => {
    const result = execSync(`mlldx ${testScript}`, { timeout: 5000 });
    expect(result).toContain('Module loaded');
  });
});
```

### Manual Testing

```bash
# Test ephemeral mode
mlldx test-script.mld

# Verify no cache created
ls -la .mlld-cache  # Should not exist

# Test with environment variables
GITHUB_TOKEN=xxx mlldx github-script.mld
```

## Debugging

### Enable Debug Output

```bash
MLLD_DEBUG=true mlldx script.mld
```

### Common Issues

1. **Module not found**: Check network connectivity
2. **Memory issues**: Large modules may exceed memory limits
3. **Permission errors**: Ensure script has necessary permissions

### Debug Flags

- `--debug`: Enable debug logging
- `--verbose`: Show detailed execution info
- `MLLD_DEBUG=true`: Environment variable for debugging

## Future Enhancements

### Potential Improvements

1. **Memory Limits**: Add configurable memory limits for cache
2. **TTL Support**: Expire cached modules after time period
3. **Partial Persistence**: Optional /tmp usage for large modules
4. **Metrics**: Track cache hits/misses and performance

### Experimental Features

- **Distributed Cache**: Redis/Memcached backend for shared ephemeral cache
- **Pre-warmed Cache**: Bundle common modules in container images
- **Streaming Mode**: Process large files without full memory load

## Implementation Checklist

When modifying mlldx:

- [ ] Update bin/mlldx-wrapper.cjs for new flags
- [ ] Ensure InMemoryModuleCache handles edge cases
- [ ] Test in actual serverless environment
- [ ] Update tests/ephemeral-mode.test.ts
- [ ] Document any new environment variables
- [ ] Consider memory usage implications
- [ ] Test with large modules and scripts

## Related Documentation

- [Module System](./MODULES.md) - Core module architecture
- [Security Model](../security.md) - Import approval system
- [Registry](./REGISTRY.md) - Module registry implementation
- [CLI Architecture](./CLI.md) - Command-line interface design