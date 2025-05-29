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
├── mlld.lock.json         # Locked gist versions
├── cache/
│   └── gist/
│       └── username/
│           └── gist_id/
│               └── revision/
│                   ├── content.mld
│                   └── metadata.json
└── stats/
    └── pending.json       # Local stats to upload
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

When user imports `mlld://adamavenir/json-utils`:

1. **First time**: 
   - Resolve name → gist ID
   - Fetch current gist revision
   - Show content for approval
   - Lock to specific revision
   - Cache locally

2. **Subsequent imports**:
   - Use locked version from cache
   - No network requests needed

```json
{
  "version": "1.0.0",
  "imports": {
    "mlld://adamavenir/json-utils": {
      "resolved": "mlld://gist/adamavenir/b2f4e09a42db6c680b454f6f93efa9d8",
      "gistRevision": "b20e54d6dbf422252b7b670af492632f2fa6c1a2",
      "integrity": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "registryVersion": "2024-01-25T10:00:00Z",
      "approvedAt": "2024-01-25T14:30:00Z"
    }
  }
}
```

### 3. Import Resolution Flow

```typescript
// In interpreter/eval/import.ts
async function resolveImport(importPath: string, env: Environment): Promise<string> {
  // Check if it's a mlld:// import
  if (!importPath.startsWith('mlld://')) {
    return importPath;
  }
  
  // Check lock file first
  const locked = await env.lockFile.getImport(importPath);
  if (locked) {
    // Try cache
    const cached = await env.cache.get(locked.resolved, locked.gistRevision);
    if (cached) {
      await trackUsage(importPath, 'cache-hit');
      return cached;
    }
    // Fetch specific locked version
    return fetchLockedGist(locked);
  }
  
  // New import - resolve through registry
  const moduleName = importPath.slice(7); // Remove mlld://
  
  // Check if it's already a gist reference
  if (moduleName.startsWith('gist/')) {
    return importPath;
  }
  
  const registry = await fetchRegistry(); // With caching
  
  const module = registry.modules[moduleName];
  if (!module) {
    throw new MlldImportError(`Unknown module: ${moduleName}`);
  }
  
  // Check advisories
  await checkAdvisories(moduleName, module.gist);
  
  // Resolve to gist and continue normal flow
  const gistPath = `mlld://gist/${module.gist}`;
  await trackUsage(importPath, 'first-import');
  
  return gistPath;
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
# Install from lock file (like npm install)
mlld install

# Update specific module to latest
mlld update adamavenir/json-utils

# Show outdated modules
mlld outdated

# Audit for security advisories
mlld audit

# Share anonymous usage stats
mlld stats share

# Search user's registry
mlld search adamavenir/json

# Show module info
mlld info adamavenir/json-utils
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