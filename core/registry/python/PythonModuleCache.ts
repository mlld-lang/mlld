import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

/**
 * Metadata for a cached Python package
 */
export interface PythonCacheEntry {
  /** Package name (normalized, lowercase) */
  name: string;
  /** Package version */
  version: string;
  /** SHA256 hash of the file content */
  sha256: string;
  /** Original filename */
  filename: string;
  /** Type: wheel or sdist */
  type: 'wheel' | 'sdist';
  /** File size in bytes */
  size: number;
  /** When the package was cached */
  cachedAt: string;
  /** Python version constraint from package metadata */
  pythonRequires?: string;
  /** ABI tag for wheels (e.g., "cp311") */
  abiTag?: string;
  /** Platform tag for wheels (e.g., "macosx_11_0_arm64") */
  platformTag?: string;
  /** Source URL where package was downloaded from */
  sourceUrl?: string;
}

/**
 * Index structure for the Python module cache
 */
export interface PythonCacheIndex {
  /** Index version for future migrations */
  version: number;
  /** Last updated timestamp */
  updatedAt: string;
  /** Package entries keyed by sha256 hash */
  entries: Record<string, PythonCacheEntry>;
  /** Quick lookup: package name -> list of sha256 hashes */
  byName: Record<string, string[]>;
  /** Quick lookup: name@version -> sha256 hash */
  byNameVersion: Record<string, string>;
}

export interface CacheOptions {
  /** Custom cache directory (default: ~/.mlld/cache/python) */
  cacheDir?: string;
}

/**
 * Content-addressed cache for Python packages (wheels and sdist).
 *
 * Structure:
 * ~/.mlld/cache/python/
 * ├── wheels/
 * │   └── sha256/
 * │       └── <hash>  (wheel file content)
 * ├── sdist/
 * │   └── sha256/
 * │       └── <hash>  (sdist file content)
 * └── index.json
 */
export class PythonModuleCache {
  private cacheDir: string;
  private indexPath: string;
  private index: PythonCacheIndex | null = null;
  private indexDirty: boolean = false;

  constructor(options: CacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? path.join(os.homedir(), '.mlld', 'cache', 'python');
    this.indexPath = path.join(this.cacheDir, 'index.json');
  }

  /**
   * Initialize the cache directory structure
   */
  async initialize(): Promise<void> {
    await fs.promises.mkdir(path.join(this.cacheDir, 'wheels', 'sha256'), { recursive: true });
    await fs.promises.mkdir(path.join(this.cacheDir, 'sdist', 'sha256'), { recursive: true });
    await this.loadIndex();
  }

  /**
   * Load the cache index from disk
   */
  private async loadIndex(): Promise<void> {
    if (this.index) return;

    try {
      if (fs.existsSync(this.indexPath)) {
        const content = await fs.promises.readFile(this.indexPath, 'utf8');
        const parsed = JSON.parse(content);
        this.index = this.normalizeIndex(parsed);
      } else {
        this.index = this.createEmptyIndex();
      }
    } catch (error) {
      console.warn(`Failed to load cache index: ${(error as Error).message}`);
      this.index = this.createEmptyIndex();
    }
  }

  /**
   * Normalize index data from disk
   */
  private normalizeIndex(raw: any): PythonCacheIndex {
    const entries: Record<string, PythonCacheEntry> = {};
    const byName: Record<string, string[]> = {};
    const byNameVersion: Record<string, string> = {};

    if (raw?.entries && typeof raw.entries === 'object') {
      for (const [hash, entry] of Object.entries(raw.entries)) {
        if (entry && typeof entry === 'object') {
          const normalized = this.normalizeEntry(entry as any, hash);
          entries[hash] = normalized;

          const nameLower = normalized.name.toLowerCase();
          if (!byName[nameLower]) {
            byName[nameLower] = [];
          }
          byName[nameLower].push(hash);
          byNameVersion[`${nameLower}@${normalized.version}`] = hash;
        }
      }
    }

    return {
      version: typeof raw?.version === 'number' ? raw.version : 1,
      updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      entries,
      byName,
      byNameVersion
    };
  }

  /**
   * Normalize a single cache entry
   */
  private normalizeEntry(entry: any, hash: string): PythonCacheEntry {
    return {
      name: typeof entry.name === 'string' ? entry.name.toLowerCase() : 'unknown',
      version: typeof entry.version === 'string' ? entry.version : '0.0.0',
      sha256: hash,
      filename: typeof entry.filename === 'string' ? entry.filename : '',
      type: entry.type === 'sdist' ? 'sdist' : 'wheel',
      size: typeof entry.size === 'number' ? entry.size : 0,
      cachedAt: typeof entry.cachedAt === 'string' ? entry.cachedAt : new Date().toISOString(),
      pythonRequires: typeof entry.pythonRequires === 'string' ? entry.pythonRequires : undefined,
      abiTag: typeof entry.abiTag === 'string' ? entry.abiTag : undefined,
      platformTag: typeof entry.platformTag === 'string' ? entry.platformTag : undefined,
      sourceUrl: typeof entry.sourceUrl === 'string' ? entry.sourceUrl : undefined
    };
  }

  /**
   * Create an empty cache index
   */
  private createEmptyIndex(): PythonCacheIndex {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: {},
      byName: {},
      byNameVersion: {}
    };
  }

  /**
   * Ensure index is loaded
   */
  private async ensureIndex(): Promise<PythonCacheIndex> {
    if (!this.index) {
      await this.loadIndex();
    }
    return this.index!;
  }

  /**
   * Calculate SHA256 hash of content
   */
  calculateHash(content: Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Get the storage path for a cached file
   */
  private getStoragePath(type: 'wheel' | 'sdist', sha256: string): string {
    return path.join(this.cacheDir, type === 'wheel' ? 'wheels' : 'sdist', 'sha256', sha256);
  }

  /**
   * Check if a package is in the cache by hash
   */
  async hasHash(sha256: string): Promise<boolean> {
    const index = await this.ensureIndex();
    return sha256 in index.entries;
  }

  /**
   * Check if a package is in the cache by name and version
   */
  async hasPackage(name: string, version: string): Promise<boolean> {
    const index = await this.ensureIndex();
    const key = `${name.toLowerCase()}@${version}`;
    return key in index.byNameVersion;
  }

  /**
   * Get a cached package entry by hash
   */
  async getByHash(sha256: string): Promise<PythonCacheEntry | undefined> {
    const index = await this.ensureIndex();
    return index.entries[sha256];
  }

  /**
   * Get a cached package entry by name and version
   */
  async getByNameVersion(name: string, version: string): Promise<PythonCacheEntry | undefined> {
    const index = await this.ensureIndex();
    const key = `${name.toLowerCase()}@${version}`;
    const hash = index.byNameVersion[key];
    return hash ? index.entries[hash] : undefined;
  }

  /**
   * Get all cached versions of a package
   */
  async getPackageVersions(name: string): Promise<PythonCacheEntry[]> {
    const index = await this.ensureIndex();
    const hashes = index.byName[name.toLowerCase()] || [];
    return hashes.map(h => index.entries[h]).filter(Boolean);
  }

  /**
   * Get the file content from cache
   */
  async getContent(sha256: string): Promise<Buffer | undefined> {
    const entry = await this.getByHash(sha256);
    if (!entry) return undefined;

    const filePath = this.getStoragePath(entry.type, sha256);
    try {
      return await fs.promises.readFile(filePath);
    } catch {
      return undefined;
    }
  }

  /**
   * Get the file path for a cached package (for direct access)
   */
  async getFilePath(sha256: string): Promise<string | undefined> {
    const entry = await this.getByHash(sha256);
    if (!entry) return undefined;

    const filePath = this.getStoragePath(entry.type, sha256);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return undefined;
  }

  /**
   * Add a package to the cache
   */
  async add(
    content: Buffer,
    metadata: Omit<PythonCacheEntry, 'sha256' | 'size' | 'cachedAt'>
  ): Promise<PythonCacheEntry> {
    await this.initialize();
    const index = await this.ensureIndex();

    const sha256 = this.calculateHash(content);
    const size = content.length;

    // Check if already cached
    if (index.entries[sha256]) {
      return index.entries[sha256];
    }

    const entry: PythonCacheEntry = {
      ...metadata,
      name: metadata.name.toLowerCase(),
      sha256,
      size,
      cachedAt: new Date().toISOString()
    };

    // Write file to storage
    const storagePath = this.getStoragePath(entry.type, sha256);
    await fs.promises.writeFile(storagePath, content);

    // Update index
    index.entries[sha256] = entry;

    const nameLower = entry.name.toLowerCase();
    if (!index.byName[nameLower]) {
      index.byName[nameLower] = [];
    }
    if (!index.byName[nameLower].includes(sha256)) {
      index.byName[nameLower].push(sha256);
    }
    index.byNameVersion[`${nameLower}@${entry.version}`] = sha256;

    this.indexDirty = true;
    await this.saveIndex();

    return entry;
  }

  /**
   * Add a package from a file path
   */
  async addFromFile(
    filePath: string,
    metadata: Omit<PythonCacheEntry, 'sha256' | 'size' | 'cachedAt' | 'filename'>
  ): Promise<PythonCacheEntry> {
    const content = await fs.promises.readFile(filePath);
    const filename = path.basename(filePath);
    return this.add(content, { ...metadata, filename });
  }

  /**
   * Remove a package from the cache by hash
   */
  async remove(sha256: string): Promise<boolean> {
    const index = await this.ensureIndex();
    const entry = index.entries[sha256];

    if (!entry) return false;

    // Remove file
    const storagePath = this.getStoragePath(entry.type, sha256);
    try {
      await fs.promises.unlink(storagePath);
    } catch {
      // File might not exist, continue with index cleanup
    }

    // Update index
    delete index.entries[sha256];

    const nameLower = entry.name.toLowerCase();
    if (index.byName[nameLower]) {
      index.byName[nameLower] = index.byName[nameLower].filter(h => h !== sha256);
      if (index.byName[nameLower].length === 0) {
        delete index.byName[nameLower];
      }
    }

    delete index.byNameVersion[`${nameLower}@${entry.version}`];

    this.indexDirty = true;
    await this.saveIndex();

    return true;
  }

  /**
   * Verify integrity of a cached file
   */
  async verifyIntegrity(sha256: string): Promise<boolean> {
    const content = await this.getContent(sha256);
    if (!content) return false;

    const actualHash = this.calculateHash(content);
    return actualHash === sha256;
  }

  /**
   * Save the index to disk
   */
  async saveIndex(): Promise<void> {
    if (!this.indexDirty || !this.index) return;

    this.index.updatedAt = new Date().toISOString();

    await fs.promises.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.promises.writeFile(
      this.indexPath,
      JSON.stringify(this.index, null, 2)
    );

    this.indexDirty = false;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalPackages: number;
    totalSize: number;
    wheelCount: number;
    sdistCount: number;
    uniquePackages: number;
  }> {
    const index = await this.ensureIndex();
    const entries = Object.values(index.entries);

    return {
      totalPackages: entries.length,
      totalSize: entries.reduce((sum, e) => sum + e.size, 0),
      wheelCount: entries.filter(e => e.type === 'wheel').length,
      sdistCount: entries.filter(e => e.type === 'sdist').length,
      uniquePackages: Object.keys(index.byName).length
    };
  }

  /**
   * Clean up orphaned files (files not in index)
   */
  async cleanup(): Promise<number> {
    await this.initialize();
    const index = await this.ensureIndex();
    let cleaned = 0;

    for (const type of ['wheels', 'sdist'] as const) {
      const dir = path.join(this.cacheDir, type, 'sha256');
      try {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          if (!index.entries[file]) {
            await fs.promises.unlink(path.join(dir, file));
            cleaned++;
          }
        }
      } catch {
        // Directory might not exist
      }
    }

    return cleaned;
  }

  /**
   * Clear the entire cache
   */
  async clear(): Promise<void> {
    for (const type of ['wheels', 'sdist'] as const) {
      const dir = path.join(this.cacheDir, type, 'sha256');
      try {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          await fs.promises.unlink(path.join(dir, file));
        }
      } catch {
        // Directory might not exist
      }
    }

    this.index = this.createEmptyIndex();
    this.indexDirty = true;
    await this.saveIndex();
  }

  /**
   * Parse wheel filename to extract metadata
   * Format: {distribution}-{version}(-{build tag})?-{python tag}-{abi tag}-{platform tag}.whl
   */
  static parseWheelFilename(filename: string): {
    name: string;
    version: string;
    pythonTag?: string;
    abiTag?: string;
    platformTag?: string;
  } | null {
    const match = filename.match(
      /^([A-Za-z0-9_]+)-([^-]+)(?:-\d+)?-([^-]+)-([^-]+)-([^.]+)\.whl$/
    );

    if (!match) return null;

    return {
      name: match[1].toLowerCase().replace(/_/g, '-'),
      version: match[2],
      pythonTag: match[3],
      abiTag: match[4],
      platformTag: match[5]
    };
  }

  /**
   * Parse sdist filename to extract metadata
   * Format: {distribution}-{version}.tar.gz or {distribution}-{version}.zip
   */
  static parseSdistFilename(filename: string): {
    name: string;
    version: string;
  } | null {
    const match = filename.match(/^([A-Za-z0-9_.-]+)-(\d+(?:\.\d+)*(?:[ab]\d+)?(?:\.post\d+)?(?:\.dev\d+)?)\.(?:tar\.gz|zip)$/);

    if (!match) return null;

    return {
      name: match[1].toLowerCase().replace(/_/g, '-'),
      version: match[2]
    };
  }
}
