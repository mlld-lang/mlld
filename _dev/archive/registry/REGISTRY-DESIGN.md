# Mlld Registry Design: Simple, Secure, Shareable

## Overview

A centralized registry for mlld imports that enables secure sharing of prompt modules while maintaining simplicity. This design uses GitHub Gists as a foundation for the pre-release version, with a clear path to a more robust system.

## Core Principles

1. **Simplicity First** - Start with GitHub Gists, evolve as needed
2. **Security by Default** - All imports require explicit approval
3. **Versioning Built-in** - Content-based hashing ensures immutability
4. **Community-driven Security** - Users can submit advisories

## Registry Model

### 1. Content Addressing

Each mlld module is identified by its content hash:

```
mlld://registry/sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Benefits:
- Immutable references
- Automatic deduplication
- Tamper-proof imports

### 2. Human-Friendly Aliases

Map hashes to readable names with versions:

```
mlld://registry/prompts/code-review@1.2.0
→ mlld://registry/sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### 3. Gist-based Storage (Pre-release)

Use GitHub Gists as the backing store:
- Each gist contains the mlld file + metadata.json
- Gist revision history provides versioning
- GitHub's infrastructure handles availability

## Import Syntax

```meld
@import { reviewer } from "mlld://registry/prompts/code-review@1.2.0"
@import { * } from "mlld://gist/username/gist_id"
@import { analyzer } from "mlld://registry/sha256:e3b0c44298fc..."
```

## Security Model

### 1. Import Approval Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Import Found   │────▶│  Check Registry  │────▶│ User Approve │
└─────────────────┘     └──────────────────┘     └──────────────┘
                               │                         │
                               ▼                         ▼
                        ┌──────────────────┐     ┌──────────────┐
                        │ Security Advisory│     │   Execute    │
                        │     Database     │     └──────────────┘
                        └──────────────────┘
```

### 2. Advisory System

Similar to npm audit, but for prompts:

```json
{
  "advisory": {
    "id": "MLLD-2024-001",
    "module": "mlld://registry/prompts/data-extractor@1.0.0",
    "severity": "high",
    "title": "Potential data exfiltration in template",
    "description": "Template may expose environment variables",
    "recommendation": "Update to version 1.0.1 or review template manually",
    "reported_by": "alice@example.com",
    "created": "2024-01-15T10:00:00Z"
  }
}
```

### 3. Trust Levels

```yaml
# mlld.config.yml
registry:
  trusted_publishers:
    - mlld-lang/*           # Official modules
    - verified/openai       # Verified publishers
    - verified/anthropic
  
  require_approval:
    - gist/*               # Always ask for gists
    - registry/*           # Ask for first-time imports
  
  blocked:
    - malicious-user/*     # Known bad actors
```

## Lock File Mechanism

### mlld.lock.json Structure

Lock file captures the exact content state at approval time:

```json
{
  "version": "1.0.0",
  "imports": {
    "mlld://gist/adamavenir/a1f3e09a42db6c680b454f6f93efa9d8": {
      "resolved": "https://gist.githubusercontent.com/adamavenir/a1f3e09a42db6c680b454f6f93efa9d8/raw/b20e54d6dbf422252b7b670af492632f2fa6c1a2/prompts.mld",
      "integrity": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "gistRevision": "b20e54d6dbf422252b7b670af492632f2fa6c1a2",
      "approvedAt": "2024-01-15T10:30:00Z",
      "approvedBy": "user@example.com"
    },
    "mlld://registry/prompts/code-review@1.0.0": {
      "resolved": "mlld://registry/sha256:a7f5b2c89d3e4f6a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
      "integrity": "sha256:a7f5b2c89d3e4f6a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
      "approvedAt": "2024-01-15T10:35:00Z"
    }
  }
}
```

### Cache Directory Structure

```
.mlld/
├── cache/
│   ├── registry/
│   │   └── sha256/
│   │       └── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
│   │           ├── content.mld
│   │           └── metadata.json
│   └── gist/
│       └── adamavenir/
│           └── a1f3e09a42db6c680b454f6f93efa9d8/
│               └── b20e54d6dbf422252b7b670af492632f2fa6c1a2/
│                   ├── prompts.mld
│                   └── metadata.json
├── mlld.lock.json
└── advisories/
    └── cache.json
```

## Implementation Phases

### Phase 1: Gist-based Registry with Lock & Cache

```javascript
// Enhanced registry client with lock file support
class MlldRegistry {
  constructor() {
    this.lockFile = new LockFile('.mlld/mlld.lock.json');
    this.cache = new Cache('.mlld/cache');
  }

  async resolve(importPath) {
    // Check lock file first
    const locked = this.lockFile.getImport(importPath);
    if (locked) {
      // Try cache
      const cached = await this.cache.get(locked.resolved);
      if (cached) {
        return cached;
      }
      // Fetch specific locked version
      return this.fetchLocked(importPath, locked);
    }
    
    // New import - fetch, approve, and lock
    if (importPath.startsWith('mlld://gist/')) {
      return this.fetchAndLockGist(importPath);
    }
    if (importPath.startsWith('mlld://registry/')) {
      return this.fetchAndLockFromRegistry(importPath);
    }
  }
  
  async fetchAndLockGist(path) {
    const [, , username, gistId] = path.split('/');
    
    // Fetch gist metadata
    const response = await fetch(`https://api.github.com/gists/${gistId}`);
    const gist = await response.json();
    
    // Get the current revision
    const revision = gist.history[0].version;
    
    // Get .mld file from gist
    const mldFile = Object.values(gist.files).find(f => f.filename.endsWith('.mld'));
    
    // Construct the raw URL with revision
    const resolvedUrl = `https://gist.githubusercontent.com/${username}/${gistId}/raw/${revision}/${mldFile.filename}`;
    
    // Fetch the actual content
    const contentResponse = await fetch(resolvedUrl);
    const content = await contentResponse.text();
    
    // Calculate integrity hash
    const integrity = await this.calculateIntegrity(content);
    
    // Check for advisories
    await this.checkAdvisories(content, integrity);
    
    // Request user approval
    if (!await this.requestApproval(path, content, integrity)) {
      throw new Error('Import rejected by user');
    }
    
    // Lock the import
    await this.lockFile.addImport(path, {
      resolved: resolvedUrl,
      integrity,
      gistRevision: revision,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown'
    });
    
    // Cache the content
    await this.cache.store(resolvedUrl, content, {
      importPath: path,
      gistRevision: revision,
      integrity
    });
    
    return content;
  }
  
  async fetchLocked(importPath, locked) {
    // Fetch from the exact locked URL
    const response = await fetch(locked.resolved);
    const content = await response.text();
    
    // Verify integrity
    const integrity = await this.calculateIntegrity(content);
    if (integrity !== locked.integrity) {
      throw new Error(`Integrity check failed for ${importPath}\n` +
        `Expected: ${locked.integrity}\n` +
        `Actual: ${integrity}\n` +
        `The content has changed. Please review and update the lock file.`);
    }
    
    // Cache for next time
    await this.cache.store(locked.resolved, content, {
      importPath,
      ...locked
    });
    
    return content;
  }
  
  async calculateIntegrity(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${hashHex}`;
  }
}

// Lock file management
class LockFile {
  constructor(path) {
    this.path = path;
    this.data = this.load();
  }
  
  load() {
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {
      return { version: "1.0.0", imports: {} };
    }
  }
  
  async addImport(importPath, metadata) {
    this.data.imports[importPath] = metadata;
    await this.save();
  }
  
  getImport(importPath) {
    return this.data.imports[importPath];
  }
  
  async save() {
    const dir = path.dirname(this.path);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.path, 
      JSON.stringify(this.data, null, 2)
    );
  }
}

// Cache management
class Cache {
  constructor(basePath) {
    this.basePath = basePath;
  }
  
  async get(resolved) {
    const cachePath = this.getCachePath(resolved);
    try {
      return await fs.promises.readFile(
        path.join(cachePath, 'content.mld'), 
        'utf8'
      );
    } catch {
      return null;
    }
  }
  
  async store(resolved, content, metadata) {
    const cachePath = this.getCachePath(resolved);
    await fs.promises.mkdir(cachePath, { recursive: true });
    
    await fs.promises.writeFile(
      path.join(cachePath, 'content.mld'),
      content
    );
    
    await fs.promises.writeFile(
      path.join(cachePath, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
  }
  
  getCachePath(resolved) {
    if (resolved.startsWith('https://gist.githubusercontent.com/')) {
      // Parse gist URL
      const parts = resolved.split('/');
      const username = parts[3];
      const gistId = parts[4];
      const revision = parts[6];
      return path.join(this.basePath, 'gist', username, gistId, revision);
    } else if (resolved.startsWith('mlld://registry/sha256:')) {
      const hash = resolved.split(':')[2];
      return path.join(this.basePath, 'registry', 'sha256', hash);
    }
    // Fallback to hash-based path
    const hash = crypto.createHash('sha256').update(resolved).digest('hex');
    return path.join(this.basePath, 'other', hash);
  }
}
```

### Phase 2: Centralized Index

A simple JSON index mapping names to gists:

```json
{
  "modules": {
    "prompts/code-review": {
      "versions": {
        "1.0.0": {
          "gist": "username/abc123",
          "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "author": "alice",
          "published": "2024-01-15T10:00:00Z"
        }
      }
    }
  }
}
```

### Phase 3: Full Registry Service

Eventually transition to a proper service with:
- Package upload/publishing
- Automated security scanning
- Version resolution
- Download statistics

## Security Advisory Submission

Users can submit advisories via:

1. **GitHub Issues** - Template for security reports
2. **Email** - security@mlld-lang.org
3. **API** - POST to registry.mlld-lang.org/advisories

Advisory format:
```yaml
module: mlld://registry/prompts/data-extractor@1.0.0
severity: high|medium|low
type: data-exposure|command-injection|privilege-escalation|other
description: |
  Detailed description of the security issue
proof_of_concept: |
  Example showing the vulnerability
recommendation: |
  How to fix or work around the issue
```

## Lock File Workflow

### Import Resolution Flow

```
1. Check mlld.lock.json for existing import
   ├─ Found → Check .mlld/cache/
   │   ├─ Cached → Use cached version
   │   └─ Not cached → Fetch locked version & verify integrity
   └─ Not found → New import flow
       ├─ Fetch current version from gist
       ├─ Show content for approval
       ├─ Lock specific revision
       └─ Cache content locally
```

### Lock File Commands

```bash
# Install all locked dependencies (like npm install)
mlld install

# Update a specific import to latest version
mlld update mlld://gist/adamavenir/a1f3e09a42db6c680b454f6f93efa9d8

# Update all imports to latest versions
mlld update

# Show outdated imports
mlld outdated

# Clear cache but keep lock file
mlld cache clean

# Verify all imports match their integrity hashes
mlld verify
```

### Benefits of Lock Files

1. **Reproducible Builds** - Same content every time
2. **Offline Work** - Use cached versions without internet
3. **Security** - Content can't change without detection
4. **Team Sync** - Commit lock file to share approved imports
5. **Audit Trail** - See who approved what and when

## Usage Examples

### Publishing a Module

```bash
# Create a gist with your module
mlld publish my-prompt.mld --name "prompts/my-prompt" --version "1.0.0"

# This creates a gist and updates the registry index
```

### Importing with Security Check

```meld
# First time import triggers approval
@import { reviewer } from "mlld://registry/prompts/code-review@1.0.0"

# Terminal shows:
# ⚠️  New import detected: prompts/code-review@1.0.0
# Publisher: verified/alice
# Content hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
# 
# No security advisories found.
# 
# Review content? [y/N/always]: y
# [Shows module content]
# 
# Approve import? [y/N]: y
# ✓ Import approved and cached
```

### Checking for Advisories

```bash
# Check all imports in a project
mlld audit

# Output:
# Scanning mlld imports...
# 
# Found 1 vulnerability:
# 
# HIGH: mlld://registry/prompts/data-extractor@1.0.0
# Potential data exfiltration in template
# Update to version 1.0.1
# 
# Run `mlld audit fix` to update vulnerable dependencies
```

## Benefits

1. **Simple Start** - Gists work today, no infrastructure needed
2. **Secure by Design** - Every import is verified
3. **Community Protection** - Advisories help everyone
4. **Clear Upgrade Path** - From gists to full registry
5. **Familiar Model** - Developers know npm/cargo/pip patterns

## Next Steps

1. Implement basic gist resolver with approval flow
2. Create security advisory database structure
3. Build simple CLI commands for publishing/auditing
4. Set up community process for advisory submission
5. Design migration path from gists to registry service