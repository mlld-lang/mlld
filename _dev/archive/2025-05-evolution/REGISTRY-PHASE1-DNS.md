# Registry Phase 1: DNS for Gists

## Overview

A lightweight registry that provides:
1. **DNS mapping** - `mlld://user/module` → Gist IDs
2. **Lock files** - Pin specific gist versions
3. **Local caching** - Fast repeated access
4. **Stats collection** - Track usage locally
5. **Security advisories** - Warn about known issues

All infrastructure is GitHub repos + local mlld features. Zero servers.

## Architecture

### Registry Structure (GitHub Repo)

```
mlld-lang/registry/
├── README.md
├── {username}/            # Each user has their own directory
│   ├── registry.json      # User's module registry
│   └── advisories.json    # User's security advisories
├── adamavenir/            # Example user
│   ├── registry.json
│   └── advisories.json
└── .github/
    └── workflows/
        └── validate.yml   # Validate PRs
```

### Local Structure

```
.mlld/
├── cache/
│   └── content/
│       ├── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
│       └── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.meta.json
└── stats/
    └── pending.json       # Local stats to upload

mlld.lock.json            # Project lock file with modules, TTL, and trust settings
```

## Implementation

### 1. Registry Format (Per User)

Each user has their own `{username}/registry.json`:

```json
{
  "version": "1.0.0",
  "updated": "2024-01-25T10:00:00Z",
  "author": "adamavenir",
  "modules": {
    "json-utils": {
      "gist": "b2f4e09a42db6c680b454f6f93efa9d8",
      "description": "JSON formatting and validation utilities",
      "tags": ["utils", "json", "formatting"],
      "created": "2024-01-20T10:00:00Z"
    },
    "test-runner": {
      "gist": "c3f5e09a42db6c680b454f6f93efa9d8",
      "description": "Simple test runner for mlld scripts",
      "tags": ["testing", "cli", "development"],
      "created": "2024-01-22T10:00:00Z"
    }
  }
}
```

### 2. Lock File Integration

When user imports `@adamavenir/json-utils` or uses new syntax:

1. **First time**: 
   - Resolve name → gist ID
   - Fetch current gist revision
   - Show content for approval (unless `trust always`)
   - Lock to specific revision with hash
   - Cache locally by content hash

2. **Subsequent imports**:
   - Use locked version from cache
   - Check TTL if specified
   - No network requests unless TTL expired or `(live)`

```json
{
  "version": "1.0.0",
  "modules": {
    "@adamavenir/json-utils": {
      "resolved": "https://gist.githubusercontent.com/adamavenir/b2f4e09a42db6c680b454f6f93efa9d8/raw/content.mld",
      "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "shortHash": "e3b0c4",
      "installedAt": "2024-01-25T10:00:00Z",
      "ttl": { "type": "ttl", "value": 86400000 },  // 24 hours
      "trust": "verify",
      "lastChecked": "2024-01-25T10:00:00Z"
    }
  },
  "security": {
    // Project-specific security overrides
  }
}
```

### 3. Import Resolution Flow

```typescript
// In interpreter/eval/import.ts
async function resolveImport(importPath: string, env: Environment): Promise<string> {
  // Check if it's a lock file reference (no brackets)
  const lockModule = await env.lockFile.getModule(importPath);
  if (lockModule) {
    // Check TTL
    if (lockModule.ttl?.type === 'live') {
      // Always fetch fresh for 'live' resources
      return fetchFreshContent(lockModule.resolved);
    }
    
    if (lockModule.ttl?.type === 'ttl') {
      const now = Date.now();
      const lastChecked = new Date(lockModule.lastChecked).getTime();
      if (now - lastChecked > lockModule.ttl.value) {
        // TTL expired, fetch fresh
        const content = await fetchFreshContent(lockModule.resolved);
        await env.lockFile.updateLastChecked(importPath);
        return content;
      }
    }
    
    // Try cache (static or within TTL)
    const cached = await env.cache.get(lockModule.hash);
    if (cached) {
      await trackUsage(importPath, 'cache-hit');
      return cached;
    }
    
    // Cache miss, fetch and cache
    const content = await fetchContent(lockModule.resolved);
    await env.cache.set(lockModule.hash, content);
    return content;
  }
  
  // Not in lock file - check if it's a registry reference
  if (importPath.startsWith('@') && !importPath.includes('/')) {
    // This is @username/module format
    const registry = await fetchRegistry();
    const [username, moduleName] = importPath.slice(1).split('/');
    
    const module = registry[username]?.modules[moduleName];
    if (!module) {
      throw new MlldImportError(`Unknown module: ${importPath}`);
    }
    
    // Check advisories
    await checkAdvisories(importPath, module.gist);
    
    // Resolve to gist URL
    const gistUrl = `https://gist.githubusercontent.com/${username}/${module.gist}/raw/content.mld`;
    await trackUsage(importPath, 'first-import');
    
    return gistUrl;
  }
  
  // Fall back to existing path resolution
  return importPath;
}
```

### 4. Local Stats Collection

```typescript
// Collect stats locally, upload optionally
async function trackUsage(module: string, event: string) {
  const stats = {
    module,
    event,
    timestamp: new Date().toISOString(),
    mlldVersion: VERSION,
    // No PII - just anonymous usage
  };
  
  // Save locally
  await appendToFile('.mlld/stats/pending.json', stats);
  
  // Optionally upload (if user opts in)
  if (config.telemetry.enabled) {
    await uploadStats();
  }
}

// User can manually share stats
// mlld stats share
async function shareStats() {
  const pending = await readPendingStats();
  const aggregated = aggregateStats(pending);
  
  console.log('Share anonymous usage stats? This helps module authors.');
  console.log(`Modules used: ${Object.keys(aggregated).join(', ')}`);
  
  if (await confirm()) {
    // Create PR to mlld-lang/registry/stats/
    await createStatsPR(aggregated);
  }
}
```

### 5. CLI Commands

```bash
# Install module with TTL and trust
mlld install @adamavenir/json-utils --ttl 7d --trust verify

# Install from URL with alias
mlld install [https://api.example.com/schema.json] --alias apischema --ttl 1h

# Update specific module (respects TTL)
mlld update @adamavenir/json-utils

# Force update (ignores TTL)
mlld update @adamavenir/json-utils --force

# List installed modules
mlld ls
# @adamavenir/json-utils@e3b0c4 (ttl: 7d, trust: verify)
# apischema (alias) → https://api.example.com/schema.json@a1b2c3 (ttl: 1h)

# Show outdated modules (TTL expired)
mlld outdated

# Audit for security advisories
mlld audit

# Share anonymous usage stats
mlld stats share

# Show module info
mlld info @adamavenir/json-utils
```

### 6. Publishing Workflow

```bash
# Author creates gist manually or via CLI
gh gist create my-prompts.mld

# Author submits PR to registry
# PR includes:
- "myusername/my-module": {
    "gist": "myusername/gist-id",
    "description": "My awesome prompts",
    "tags": ["prompts", "ai"]
  }

# Automated validation checks:
- [ ] Gist exists and is public
- [ ] Name follows format (username/module-name)
- [ ] Username matches gist owner
- [ ] No duplicate names
- [ ] Valid JSON
```

## Security Integration

### Advisory Checking

```typescript
async function checkAdvisories(moduleName: string, gistId: string) {
  const advisories = await fetchAdvisories();
  
  const relevant = advisories.filter(a => 
    a.affects.includes(moduleName) ||
    a.gists.includes(gistId)
  );
  
  if (relevant.length > 0) {
    console.log('\n⚠️  Security Advisories:');
    for (const advisory of relevant) {
      console.log(`${advisory.severity}: ${advisory.description}`);
    }
    
    const proceed = await confirm('Continue with import?');
    if (!proceed) {
      throw new MlldImportError('Import cancelled due to advisories');
    }
  }
}
```

## Benefits

1. **No infrastructure** - Just GitHub repos
2. **Works offline** - After first import
3. **Community-driven** - PRs for everything
4. **Reproducible** - Lock files ensure consistency
5. **Privacy-friendly** - Stats are optional and anonymous
6. **Sets up for Phase 2** - Same import syntax will work with web service

## Migration to Phase 2

When mlld.ai launches:
1. Registry moves from static JSON to API
2. Lock files continue to work identically  
3. Cache structure remains the same
4. Stats upload to API instead of PRs
5. No changes needed in user code

## Timeline

- **Day 1**: Lock file + cache implementation
- **Day 2**: Registry resolution + CLI commands
- **Day 3**: Stats collection + security integration
- **Day 4**: Testing + documentation

Total: 4 days to production-ready Phase 1