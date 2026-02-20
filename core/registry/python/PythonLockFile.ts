import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Python package lock entry - tracks installed Python packages
 */
export interface PythonLockEntry {
  /** Resolved version (e.g., "2.0.1") */
  version: string;
  /** Resolved package filename or URL */
  resolved: string;
  /** Hash of the resolved package (sha256:...) */
  resolvedHash: string;
  /** Source: "pypi" | "local" | url */
  source: string;
  /** Integrity hash of package content */
  integrity: string;
  /** ISO timestamp when fetched */
  fetchedAt: string;
  /** Package dependencies (name -> version spec) */
  dependencies?: Record<string, string>;
  /** Extras that were installed (e.g., ["dev", "test"]) */
  extras?: string[];
  /** Python version constraint (e.g., ">=3.8") */
  pythonRequires?: string;
}

/**
 * Python-specific lock file data structure
 * This is stored as the `python` field within mlld-lock.json
 */
export interface PythonLockData {
  /** Python interpreter version used (e.g., "3.11") */
  pythonVersion?: string;
  /** Package manager used ("pip" | "uv") */
  manager?: 'pip' | 'uv';
  /** Virtual environment path relative to project root */
  venvPath?: string;
  /** Locked Python packages (name@version -> entry) */
  packages: Record<string, PythonLockEntry>;
}

/**
 * Extended lock file data that includes Python packages
 */
export interface ExtendedLockFileData {
  lockfileVersion: number;
  modules: Record<string, any>;
  python?: PythonLockData;
  metadata?: {
    mlldVersion?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Manager for Python packages within mlld-lock.json
 *
 * This class reads/writes the `python` section of mlld-lock.json,
 * leaving the existing `modules` section untouched.
 */
export class PythonLockFile {
  private filePath: string;
  private data: ExtendedLockFileData | null = null;
  private isDirty: boolean = false;
  private loaded: boolean = false;

  constructor(lockFilePath: string) {
    this.filePath = path.resolve(lockFilePath);
  }

  /**
   * Ensure the lock file is loaded from disk
   */
  private ensureLoaded(): void {
    if (this.loaded) return;

    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(content);
        this.data = this.normalizeData(parsed);
      } catch (error) {
        console.warn(`Failed to parse lock file ${this.filePath}: ${(error as Error).message}`);
        this.data = this.createEmptyData();
      }
    } else {
      this.data = this.createEmptyData();
    }

    this.loaded = true;
  }

  /**
   * Normalize raw lock file data
   */
  private normalizeData(raw: any): ExtendedLockFileData {
    const lockfileVersion = typeof raw?.lockfileVersion === 'number' ? raw.lockfileVersion : 1;

    // Preserve existing modules section
    const modules = raw?.modules && typeof raw.modules === 'object'
      ? { ...raw.modules }
      : {};

    // Parse Python section
    const python = this.normalizePythonData(raw?.python);

    // Preserve metadata
    const metadata = raw?.metadata && typeof raw.metadata === 'object'
      ? { ...raw.metadata }
      : { createdAt: new Date().toISOString() };

    return {
      lockfileVersion,
      modules,
      python,
      metadata
    };
  }

  /**
   * Normalize Python lock data
   */
  private normalizePythonData(raw: any): PythonLockData {
    if (!raw || typeof raw !== 'object') {
      return { packages: {} };
    }

    const packages: Record<string, PythonLockEntry> = {};

    if (raw.packages && typeof raw.packages === 'object') {
      for (const [key, entry] of Object.entries(raw.packages)) {
        packages[key] = this.normalizePythonEntry(entry, key);
      }
    }

    return {
      pythonVersion: typeof raw.pythonVersion === 'string' ? raw.pythonVersion : undefined,
      manager: raw.manager === 'pip' || raw.manager === 'uv' ? raw.manager : undefined,
      venvPath: typeof raw.venvPath === 'string' ? raw.venvPath : undefined,
      packages
    };
  }

  /**
   * Normalize a single Python package entry
   */
  private normalizePythonEntry(entry: any, key: string): PythonLockEntry {
    if (!entry || typeof entry !== 'object') {
      // Extract version from key if it contains @
      const parts = key.split('@');
      const version = parts.length > 1 ? parts[1] : 'latest';

      return {
        version,
        resolved: '',
        resolvedHash: '',
        source: 'pypi',
        integrity: '',
        fetchedAt: new Date().toISOString()
      };
    }

    return {
      version: typeof entry.version === 'string' ? entry.version : 'latest',
      resolved: typeof entry.resolved === 'string' ? entry.resolved : '',
      resolvedHash: typeof entry.resolvedHash === 'string' ? entry.resolvedHash : '',
      source: typeof entry.source === 'string' ? entry.source : 'pypi',
      integrity: typeof entry.integrity === 'string' ? entry.integrity : '',
      fetchedAt: typeof entry.fetchedAt === 'string' ? entry.fetchedAt : new Date().toISOString(),
      dependencies: entry.dependencies && typeof entry.dependencies === 'object'
        ? { ...entry.dependencies }
        : undefined,
      extras: Array.isArray(entry.extras) ? [...entry.extras] : undefined,
      pythonRequires: typeof entry.pythonRequires === 'string' ? entry.pythonRequires : undefined
    };
  }

  /**
   * Create empty lock file data
   */
  private createEmptyData(): ExtendedLockFileData {
    return {
      lockfileVersion: 1,
      modules: {},
      python: { packages: {} },
      metadata: {
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Ensure data is loaded and return it
   */
  private ensureData(): ExtendedLockFileData {
    this.ensureLoaded();
    return this.data!;
  }

  /**
   * Generate a package key (name@version)
   */
  private packageKey(name: string, version: string): string {
    return `${name.toLowerCase()}@${version}`;
  }

  /**
   * Calculate integrity hash for content
   */
  calculateIntegrity(content: string | Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return `sha256:${hash.digest('hex')}`;
  }

  /**
   * Get a Python package entry
   */
  getPackage(name: string, version?: string): PythonLockEntry | undefined {
    const data = this.ensureData();
    const python = data.python || { packages: {} };

    // If version specified, look for exact match
    if (version) {
      return python.packages[this.packageKey(name, version)];
    }

    // Otherwise, find any version of this package
    const prefix = `${name.toLowerCase()}@`;
    for (const [key, entry] of Object.entries(python.packages)) {
      if (key.startsWith(prefix)) {
        return entry;
      }
    }

    return undefined;
  }

  /**
   * Check if a package is locked
   */
  hasPackage(name: string, version?: string): boolean {
    return this.getPackage(name, version) !== undefined;
  }

  /**
   * Add or update a Python package entry
   */
  async setPackage(name: string, entry: PythonLockEntry): Promise<void> {
    const data = this.ensureData();

    if (!data.python) {
      data.python = { packages: {} };
    }

    const key = this.packageKey(name, entry.version);
    data.python.packages[key] = entry;

    this.touchMetadata();
    this.isDirty = true;
  }

  /**
   * Remove a Python package entry
   */
  async removePackage(name: string, version?: string): Promise<void> {
    const data = this.ensureData();
    const python = data.python;

    if (!python?.packages) return;

    if (version) {
      const key = this.packageKey(name, version);
      if (python.packages[key]) {
        delete python.packages[key];
        this.touchMetadata();
        this.isDirty = true;
      }
    } else {
      // Remove all versions
      const prefix = `${name.toLowerCase()}@`;
      let removed = false;
      for (const key of Object.keys(python.packages)) {
        if (key.startsWith(prefix)) {
          delete python.packages[key];
          removed = true;
        }
      }
      if (removed) {
        this.touchMetadata();
        this.isDirty = true;
      }
    }
  }

  /**
   * Get all Python packages
   */
  getAllPackages(): Record<string, PythonLockEntry> {
    const data = this.ensureData();
    return { ...(data.python?.packages || {}) };
  }

  /**
   * Get Python configuration (version, manager, venv path)
   */
  getPythonConfig(): Omit<PythonLockData, 'packages'> {
    const data = this.ensureData();
    const python = data.python || { packages: {} };

    return {
      pythonVersion: python.pythonVersion,
      manager: python.manager,
      venvPath: python.venvPath
    };
  }

  /**
   * Set Python configuration
   */
  async setPythonConfig(config: Partial<Omit<PythonLockData, 'packages'>>): Promise<void> {
    const data = this.ensureData();

    if (!data.python) {
      data.python = { packages: {} };
    }

    if (config.pythonVersion !== undefined) {
      data.python.pythonVersion = config.pythonVersion;
    }
    if (config.manager !== undefined) {
      data.python.manager = config.manager;
    }
    if (config.venvPath !== undefined) {
      data.python.venvPath = config.venvPath;
    }

    this.touchMetadata();
    this.isDirty = true;
  }

  /**
   * Verify package integrity
   */
  async verifyPackageIntegrity(name: string, version: string, content: string | Buffer): Promise<boolean> {
    const entry = this.getPackage(name, version);
    if (!entry || !entry.integrity) return true;

    const hash = this.calculateIntegrity(content);
    return hash === entry.integrity;
  }

  /**
   * Save the lock file to disk
   */
  async save(): Promise<void> {
    if (!this.isDirty) return;

    const data = this.ensureData();
    const dir = path.dirname(this.filePath);

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.filePath,
      JSON.stringify(data, null, 2)
    );

    this.isDirty = false;
  }

  /**
   * Force save even if not dirty
   */
  async forceSave(): Promise<void> {
    this.isDirty = true;
    await this.save();
  }

  /**
   * Reload from disk
   */
  reload(): void {
    this.loaded = false;
    this.data = null;
    this.isDirty = false;
    this.ensureLoaded();
  }

  /**
   * Update metadata timestamp
   */
  private touchMetadata(): void {
    const data = this.ensureData();
    const metadata = data.metadata || (data.metadata = {});
    metadata.updatedAt = new Date().toISOString();
  }
}
