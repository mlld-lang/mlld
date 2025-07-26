import type { LockFile, LockEntry, LockFileData } from './LockFile';

/**
 * No-operation implementation of LockFile for ephemeral/CI environments
 * Does not persist any data - always returns empty/not found
 */
export class NoOpLockFile implements LockFile {
  private inMemoryLock: LockFileData = {
    version: '1.0.0',
    imports: {}
  };

  constructor(public readonly path: string) {
    // Path is stored but never used
  }

  /**
   * Always returns empty lock file data
   */
  async load(): Promise<LockFileData> {
    return this.inMemoryLock;
  }

  /**
   * No-op - doesn't persist anything
   */
  async save(): Promise<void> {
    // Intentionally empty - no persistence
  }

  /**
   * Adds import to in-memory store only
   */
  async addImport(importPath: string, entry: LockEntry): Promise<void> {
    this.inMemoryLock.imports[importPath] = entry;
  }

  /**
   * Gets import from in-memory store
   */
  async getImport(importPath: string): Promise<LockEntry | undefined> {
    return this.inMemoryLock.imports[importPath];
  }

  /**
   * Removes import from in-memory store
   */
  async removeImport(importPath: string): Promise<void> {
    delete this.inMemoryLock.imports[importPath];
  }

  /**
   * Updates import in in-memory store
   */
  async updateImport(importPath: string, updates: Partial<LockEntry>): Promise<void> {
    const existing = this.inMemoryLock.imports[importPath];
    if (existing) {
      this.inMemoryLock.imports[importPath] = {
        ...existing,
        ...updates
      };
    }
  }

  /**
   * Check if import exists in in-memory store
   */
  async hasImport(importPath: string): Promise<boolean> {
    return importPath in this.inMemoryLock.imports;
  }

  /**
   * List all imports from in-memory store
   */
  async listImports(): Promise<string[]> {
    return Object.keys(this.inMemoryLock.imports);
  }

  /**
   * Clear all imports from in-memory store
   */
  async clear(): Promise<void> {
    this.inMemoryLock.imports = {};
  }

  /**
   * Always returns false - no file exists
   */
  async exists(): Promise<boolean> {
    return false;
  }

  /**
   * Get lock file data (in-memory only)
   */
  getData(): LockFileData {
    return this.inMemoryLock;
  }
}