import { LockFile, type LockFileData, type ModuleLockEntry } from './LockFile';
import { normalizeModuleName } from './utils/moduleNames';

/**
 * In-memory LockFile implementation for ephemeral/CI environments.
 * It preserves the current LockFile module API without writing to disk.
 */
export class NoOpLockFile extends LockFile {
  private inMemoryLock: LockFileData = {
    lockfileVersion: 1,
    modules: {},
    metadata: {
      createdAt: new Date().toISOString()
    }
  };

  constructor(public readonly path: string) {
    super(path);
  }

  async load(): Promise<LockFileData> {
    return {
      ...this.inMemoryLock,
      modules: { ...this.inMemoryLock.modules },
      metadata: this.inMemoryLock.metadata ? { ...this.inMemoryLock.metadata } : undefined
    };
  }

  async save(): Promise<void> {
    // Intentionally empty.
  }

  getModule(moduleName: string): ModuleLockEntry | undefined {
    return this.inMemoryLock.modules[normalizeModuleName(moduleName)];
  }

  async addModule(moduleName: string, entry: ModuleLockEntry): Promise<void> {
    this.inMemoryLock.modules[normalizeModuleName(moduleName)] = { ...entry };
    this.touchMetadata();
  }

  async updateModule(moduleName: string, updates: Partial<ModuleLockEntry>): Promise<void> {
    const key = normalizeModuleName(moduleName);
    const existing = this.inMemoryLock.modules[key];
    if (!existing) {
      return;
    }

    this.inMemoryLock.modules[key] = {
      ...existing,
      ...updates
    };
    this.touchMetadata();
  }

  async removeModule(moduleName: string): Promise<void> {
    delete this.inMemoryLock.modules[normalizeModuleName(moduleName)];
    this.touchMetadata();
  }

  getAllModules(): Record<string, ModuleLockEntry> {
    return { ...this.inMemoryLock.modules };
  }

  getModuleEntries(): Array<{ moduleName: string; entry: ModuleLockEntry }> {
    return Object.entries(this.inMemoryLock.modules).map(([moduleName, entry]) => ({
      moduleName,
      entry: { ...entry }
    }));
  }

  async clear(): Promise<void> {
    this.inMemoryLock.modules = {};
    this.touchMetadata();
  }

  async exists(): Promise<boolean> {
    return false;
  }

  getData(): LockFileData {
    return {
      ...this.inMemoryLock,
      modules: { ...this.inMemoryLock.modules },
      metadata: this.inMemoryLock.metadata ? { ...this.inMemoryLock.metadata } : undefined
    };
  }

  private touchMetadata(): void {
    const metadata = this.inMemoryLock.metadata ?? (this.inMemoryLock.metadata = {});
    metadata.updatedAt = new Date().toISOString();
  }
}
