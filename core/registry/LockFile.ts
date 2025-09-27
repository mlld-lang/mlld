import * as fs from 'fs';
import * as path from 'path';
import { MlldError } from '@core/errors';

export interface ModuleLockEntry {
  version: string;
  resolved: string;
  source: string;
  integrity: string;
  fetchedAt: string;
  registryVersion?: string;
  sourceUrl?: string;
  dependencies?: Record<string, string>;
}

export interface LockFileData {
  lockfileVersion: number;
  modules: Record<string, ModuleLockEntry>;
  metadata?: {
    mlldVersion?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface LockFileOptions {
  fallbackPaths?: string[];
  canonicalPath?: string;
}

export class LockFile {
  private data: LockFileData | null = null;
  private isDirty: boolean = false;
  private loaded: boolean = false;
  private canonicalPath: string;
  private currentPath: string;
  private fallbackPaths: string[];

  constructor(filePath: string, options: LockFileOptions = {}) {
    this.canonicalPath = options.canonicalPath ?? filePath;
    this.currentPath = filePath;
    this.fallbackPaths = options.fallbackPaths ?? [];
  }

  private getSearchPaths(): string[] {
    const seen = new Set<string>();
    const candidates = [this.currentPath, ...this.fallbackPaths, this.canonicalPath];
    const paths: string[] = [];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const resolved = path.resolve(candidate);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      paths.push(resolved);
    }
    return paths;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;

    let content: string | undefined;
    let usedPath: string | undefined;

    for (const candidate of this.getSearchPaths()) {
      if (fs.existsSync(candidate)) {
        try {
          content = fs.readFileSync(candidate, 'utf8');
          usedPath = candidate;
          break;
        } catch (error) {
          console.warn(`Failed to read lock file ${candidate}: ${(error as Error).message}`);
        }
      }
    }

    if (content && usedPath) {
      try {
        const parsed = JSON.parse(content);
        this.data = this.normalizeData(parsed);
        this.currentPath = usedPath;
      } catch (error) {
        console.warn(`Failed to parse lock file ${usedPath}: ${(error as Error).message}`);
        this.data = this.createEmptyData();
        this.currentPath = this.canonicalPath;
      }
    } else {
      this.data = this.createEmptyData();
      this.currentPath = this.canonicalPath;
    }

    this.loaded = true;
  }

  private normalizeData(raw: any): LockFileData {
    const lockfileVersion = typeof raw?.lockfileVersion === 'number' ? raw.lockfileVersion : 1;
    const modules: Record<string, ModuleLockEntry> = {};

    if (raw?.modules && typeof raw.modules === 'object') {
      for (const [name, entry] of Object.entries(raw.modules as Record<string, any>)) {
        const normalizedName = this.normalizeModuleName(name);
        modules[normalizedName] = this.normalizeLockEntry(entry, normalizedName);
      }
    }

    if (raw?.imports && typeof raw.imports === 'object') {
      for (const [name, entry] of Object.entries(raw.imports as Record<string, any>)) {
        const normalizedName = this.normalizeModuleName(name);
        if (!modules[normalizedName]) {
          modules[normalizedName] = this.normalizeLegacyImport(entry);
        }
      }
    }

    const metadata = raw?.metadata && typeof raw.metadata === 'object'
      ? { ...raw.metadata }
      : {};

    if (!metadata.createdAt) {
      metadata.createdAt = new Date().toISOString();
    }

    return {
      lockfileVersion,
      modules,
      metadata
    };
  }

  private createEmptyData(): LockFileData {
    return {
      lockfileVersion: 1,
      modules: {},
      metadata: {
        createdAt: new Date().toISOString()
      }
    };
  }

  private normalizeModuleName(name: string): string {
    if (!name) return name;
    if (name.startsWith('mlld://')) {
      name = name.slice('mlld://'.length);
    }
    if (!name.startsWith('@')) {
      return `@${name}`;
    }
    return name;
  }

  private normalizeLockEntry(entry: any, moduleName: string): ModuleLockEntry {
    if (!entry || typeof entry !== 'object') {
      return {
        version: 'latest',
        resolved: '',
        source: moduleName,
        integrity: '',
        fetchedAt: new Date().toISOString()
      };
    }

    const resolved = typeof entry.resolved === 'string' ? entry.resolved : '';
    const integrity = typeof entry.integrity === 'string' ? entry.integrity : '';

    return {
      version: typeof entry.version === 'string' && entry.version ? entry.version : 'latest',
      resolved,
      source: typeof entry.source === 'string' ? entry.source : moduleName,
      integrity: integrity || (resolved ? `sha256:${resolved}` : ''),
      fetchedAt: typeof entry.fetchedAt === 'string' ? entry.fetchedAt : new Date().toISOString(),
      registryVersion: typeof entry.registryVersion === 'string' ? entry.registryVersion : undefined,
      sourceUrl: typeof entry.sourceUrl === 'string' ? entry.sourceUrl : undefined,
      dependencies: typeof entry.dependencies === 'object' && entry.dependencies ? { ...entry.dependencies } : undefined
    };
  }

  private normalizeLegacyImport(entry: any): ModuleLockEntry {
    if (!entry || typeof entry !== 'object') {
      return {
        version: 'latest',
        resolved: '',
        source: '',
        integrity: '',
        fetchedAt: new Date().toISOString()
      };
    }

    return {
      version: 'latest',
      resolved: typeof entry.resolved === 'string' ? entry.resolved : '',
      source: typeof entry.resolved === 'string' ? entry.resolved : '',
      integrity: typeof entry.integrity === 'string' ? entry.integrity : '',
      fetchedAt: typeof entry.approvedAt === 'string' ? entry.approvedAt : new Date().toISOString(),
      registryVersion: undefined,
      sourceUrl: typeof entry.resolved === 'string' ? entry.resolved : undefined
    };
  }

  private ensureData(): LockFileData {
    this.ensureLoaded();
    return this.data!;
  }

  async save(): Promise<void> {
    if (!this.isDirty) return;
    const data = this.ensureData();

    const targetPath = path.resolve(this.canonicalPath);
    const dir = path.dirname(targetPath);
    await fs.promises.mkdir(dir, { recursive: true });

    await fs.promises.writeFile(
      targetPath,
      JSON.stringify(data, null, 2)
    );

    this.currentPath = targetPath;
    this.isDirty = false;
  }

  async calculateIntegrity(content: string): Promise<string> {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return `sha256:${hash.digest('hex')}`;
  }

  async checkOutdated(
    checkFn: (moduleName: string, entry: ModuleLockEntry) => Promise<boolean>
  ): Promise<Array<{ moduleName: string; entry: ModuleLockEntry }>> {
    const result: Array<{ moduleName: string; entry: ModuleLockEntry }> = [];
    const modules = this.getAllModules();
    for (const [moduleName, entry] of Object.entries(modules)) {
      if (await checkFn(moduleName, entry)) {
        result.push({ moduleName, entry });
      }
    }
    return result;
  }

  getModule(moduleName: string): ModuleLockEntry | undefined {
    const data = this.ensureData();
    const key = this.normalizeModuleName(moduleName);
    return data.modules[key];
  }

  async addModule(moduleName: string, entry: ModuleLockEntry): Promise<void> {
    const data = this.ensureData();
    const key = this.normalizeModuleName(moduleName);
    data.modules[key] = this.normalizeLockEntry(entry, key);
    this.touchMetadata();
    this.isDirty = true;
    await this.save();
  }

  async updateModule(moduleName: string, entry: Partial<ModuleLockEntry>): Promise<void> {
    const data = this.ensureData();
    const key = this.normalizeModuleName(moduleName);
    const existing = data.modules[key];
    if (!existing) {
      throw new MlldError(`No lock entry found for module ${moduleName}`);
    }

    data.modules[key] = {
      ...existing,
      ...entry
    };
    this.touchMetadata();
    this.isDirty = true;
    await this.save();
  }

  async removeModule(moduleName: string): Promise<void> {
    const data = this.ensureData();
    const key = this.normalizeModuleName(moduleName);
    if (data.modules[key]) {
      delete data.modules[key];
      this.touchMetadata();
      this.isDirty = true;
      await this.save();
    }
  }

  getAllModules(): Record<string, ModuleLockEntry> {
    const data = this.ensureData();
    return { ...data.modules };
  }

  getModuleEntries(): Array<{ moduleName: string; entry: ModuleLockEntry }> {
    return Object.entries(this.getAllModules()).map(([moduleName, entry]) => ({ moduleName, entry }));
  }

  async verifyModuleIntegrity(moduleName: string, content: string): Promise<boolean> {
    const entry = this.getModule(moduleName);
    if (!entry) return true;
    const hash = await this.calculateIntegrity(content);
    return hash === entry.integrity;
  }

  updatePath(newPath: string, options: LockFileOptions = {}): void {
    this.canonicalPath = options.canonicalPath ?? newPath;
    this.currentPath = newPath;
    if (options.fallbackPaths) {
      this.fallbackPaths = options.fallbackPaths;
    }
    this.loaded = false;
    this.data = null;
  }

  // Compatibility layer for legacy callers -------------------------------

  getImport(importPath: string): ModuleLockEntry | undefined {
    return this.getModule(importPath);
  }

  async addImport(importPath: string, entry: ModuleLockEntry): Promise<void> {
    await this.addModule(importPath, entry);
  }

  async updateImport(importPath: string, entry: Partial<ModuleLockEntry>): Promise<void> {
    await this.updateModule(importPath, entry);
  }

  async removeImport(importPath: string): Promise<void> {
    await this.removeModule(importPath);
  }

  getAllImports(): Record<string, ModuleLockEntry> {
    return this.getAllModules();
  }

  private touchMetadata(): void {
    const data = this.ensureData();
    const metadata = data.metadata || (data.metadata = {});
    metadata.updatedAt = new Date().toISOString();
  }
}
