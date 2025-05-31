# Hash & Cache System Architecture

The Hash & Cache system provides content-addressed storage for mlld modules, ensuring integrity, reproducibility, and efficient offline access.

## Overview

The mlld Hash & Cache system implements a Git-like content-addressed storage model where every module is identified by its SHA-256 hash. This enables:

- **Immutable modules**: Content cannot be changed without changing the hash
- **Offline-first**: Once cached, modules work without network access
- **Integrity verification**: Every read verifies content hasn't been corrupted
- **Efficient storage**: Identical content is stored only once
- **Reproducible builds**: Lock files + hashes = exact same modules everywhere

## Architecture

### Core Components

```
core/registry/
├── ModuleCache.ts        # Content-addressed storage implementation
├── utils/
│   └── HashUtils.ts      # SHA-256 hashing utilities
└── index.ts              # Public API exports
```

### Storage Layout

```
~/.mlld/cache/
└── sha256/
    ├── ab/                         # First 2 chars of hash
    │   └── cdef1234.../           # Rest of hash
    │       ├── content.mld        # Module content
    │       └── metadata.json      # Module metadata
    ├── f8/
    │   └── h4a9c2b5.../
    │       ├── content.mld
    │       └── metadata.json
    └── index.json                 # Import path → hash mapping
```

## Key Design Decisions

### 1. SHA-256 for Content Addressing

We use SHA-256 because it:
- Provides cryptographic security against tampering
- Has negligible collision probability (2^-128)
- Is widely supported and battle-tested
- Matches industry standards (Git, npm, etc.)

### 2. Two-Character Directory Prefix

The cache uses the first 2 characters of the hash as a subdirectory:
- Prevents filesystem issues with too many files in one directory
- Balances between directory depth and file distribution
- With 256 possible prefixes, supports ~100K modules efficiently

### 3. Dual Hash Formats

The system supports both hash formats for different use cases:
- **Hex format** (`a1b2c3d4...`): Used for file paths and internal storage
- **SRI format** (`sha256-base64...`): Used in lock files for web compatibility

### 4. Short Hash Support

Users can reference modules by short hashes (4-8 characters):
- System expands short hashes to full hashes
- Throws error if ambiguous (multiple matches)
- Improves UX without sacrificing security

## API Reference

### HashUtils

```typescript
class HashUtils {
  // Generate SHA-256 hash (hex format)
  static hash(content: string): string

  // Generate SRI integrity hash
  static integrity(content: string): string

  // Verify content against hash
  static verify(content: string, expectedHash: string): boolean

  // Verify content against SRI integrity
  static verifyIntegrity(content: string, integrity: string): boolean

  // Get short hash (first n characters)
  static shortHash(fullHash: string, length?: number): string

  // Expand short hash to full hash
  static expandHash(shortHash: string, availableHashes: string[]): string | null

  // Get cache directory components
  static getCachePathComponents(hash: string): { prefix: string; rest: string }

  // Create module content with metadata
  static createModuleContent(content: string, source: string): ModuleContent

  // Timing-safe hash comparison
  static secureCompare(hash1: string, hash2: string): boolean
}
```

### ModuleCache

```typescript
class ModuleCache {
  // Store module content
  async store(
    content: string, 
    source: string, 
    importPath?: string,
    dependencies?: Record<string, string>
  ): Promise<CacheEntry>

  // Retrieve module by hash
  async get(hash: string): Promise<ModuleContent | null>

  // Get metadata without loading content
  async getMetadata(hash: string): Promise<ModuleCacheMetadata | null>

  // Check if module exists
  async has(hash: string): Promise<boolean>

  // Remove module from cache
  async remove(hash: string): Promise<void>

  // Clear entire cache
  async clear(): Promise<void>

  // Get cache statistics
  async getStats(): Promise<{
    totalSize: number
    moduleCount: number
    oldestEntry: Date | null
    newestEntry: Date | null
  }>

  // List all cached modules
  async list(): Promise<CacheEntry[]>

  // Get hash by import path
  async getHashByImportPath(importPath: string): Promise<string | null>
}
```

## Usage Examples

### Storing a Module

```typescript
import { ModuleCache } from '@core/registry';

const cache = new ModuleCache();
const content = 'export const hello = "world";';

const entry = await cache.store(
  content,
  'https://example.com/module.mld',
  '@user/hello-world'
);

console.log(entry.hash); // 'a1b2c3d4e5f6...'
```

### Retrieving a Module

```typescript
// By full hash
const module = await cache.get('a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890');

// By short hash
const module = await cache.get('a1b2c3d4');

// By import path
const hash = await cache.getHashByImportPath('@user/hello-world');
const module = await cache.get(hash);
```

### Verifying Content Integrity

```typescript
import { HashUtils } from '@core/registry';

const content = 'module content';
const hash = HashUtils.hash(content);
const integrity = HashUtils.integrity(content);

// Verify against hash
if (HashUtils.verify(content, hash)) {
  console.log('Content is valid');
}

// Verify against SRI
if (HashUtils.verifyIntegrity(content, integrity)) {
  console.log('Integrity check passed');
}
```

## Integration Points

### With Lock Files

Lock files store module hashes for reproducible builds:

```json
{
  "modules": {
    "@alice/utils": {
      "resolved": "f8h4a9c2b5e1d7f3a8b2c9d5e2f7a1b4c8d9e3f5a6b7c8d9e0f1a2b3",
      "integrity": "sha256-Qw1bHtLNfhLjfW5V7HgqTB3G6HgpTbSjs8yH4rPkLJI=",
      "source": "https://gist.githubusercontent.com/alice/...",
      "fetchedAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### With Module Resolution

The resolver uses the cache for offline-first operation:

```typescript
// Pseudocode for module resolution
async function resolveModule(importPath: string) {
  // 1. Check lock file for hash
  const hash = lockFile.getHash(importPath);
  
  // 2. Check cache
  if (hash && await cache.has(hash)) {
    return await cache.get(hash);
  }
  
  // 3. Fetch from source
  const content = await fetchFromSource(importPath);
  
  // 4. Store in cache
  const entry = await cache.store(content, source, importPath);
  
  // 5. Update lock file
  lockFile.addEntry(importPath, entry.hash);
  
  return content;
}
```

### With Import Syntax

The system supports hash-based imports:

```mlld
# Import by module name (resolved via DNS/registry)
@import { utils } from @alice/utils

# Import by module name with short hash
@import { utils } from @alice/utils@f8h4

# Import with full hash (direct cache lookup)
@import { utils } from @alice/utils@f8h4a9c2b5e1d7f3a8b2c9d5e2f7a1b4c8d9e3f5a6b7c8d9e0f1a2b3
```

## Security Considerations

### Content Integrity

- Every read verifies the content hash
- Corrupted files are detected and reported
- Both hex hash and SRI integrity are checked

### Timing Attack Prevention

- Hash comparisons use `crypto.timingSafeEqual()`
- Prevents timing-based hash extraction attacks

### Cache Isolation

- Each user has their own cache in their home directory
- No shared global cache to prevent poisoning
- File permissions follow OS user permissions

## Performance Characteristics

### Storage Efficiency

- O(1) content lookup by hash
- ~100K modules with 2-char prefix = ~400 files per directory
- Deduplication: identical content stored once

### Operation Performance

- **Hash computation**: ~10ms for typical module
- **Cache write**: ~5ms (SSD)
- **Cache read**: ~2ms (SSD)
- **Short hash expansion**: O(n) where n = number of cached modules

### Memory Usage

- Index file loaded on demand
- Metadata files are small (~500 bytes)
- No persistent daemon or background process

## Error Handling

### Cache Corruption

When corruption is detected:
```typescript
throw new MlldError(
  `Cache corruption detected: Content hash mismatch for ${hash}`,
  { hash, path }
);
```

### Ambiguous Short Hash

When multiple modules match a short hash:
```typescript
throw new Error(
  `Ambiguous short hash '${shortHash}' matches ${matches.length} hashes`
);
```

### Filesystem Errors

- Missing files return `null` (not an error)
- Permission errors bubble up with context
- Disk full errors are reported clearly

## Future Enhancements

### Planned Features

1. **Cache Eviction**: Remove least-recently-used modules when cache exceeds size limit
2. **Compression**: Store content compressed to save disk space
3. **Parallel Operations**: Batch cache operations for better performance
4. **Cache Warming**: Pre-fetch popular modules
5. **Integrity Repair**: Attempt to re-fetch corrupted modules

### Considered But Deferred

1. **Alternative Hash Algorithms**: SHA-256 is sufficient for now
2. **Shared Network Cache**: Security concerns outweigh benefits
3. **In-Memory Cache**: Node process lifetime too short to benefit
4. **Cache Encryption**: Users can use filesystem encryption

## Testing

The system includes comprehensive tests:

- **HashUtils**: 19 tests covering all hashing operations
- **ModuleCache**: 17 tests covering storage, retrieval, and edge cases
- **Integration**: Tested with real module resolution flows

Key test scenarios:
- Content integrity verification
- Short hash expansion and ambiguity
- Cache corruption detection
- Concurrent access handling
- Large module storage
- Unicode content support

## Conclusion

The Hash & Cache system provides a robust foundation for mlld's module system, ensuring content integrity, enabling offline operation, and supporting reproducible builds. Its Git-like design is familiar to developers while being optimized for mlld's specific use cases.