import * as fs from 'fs';
import * as path from 'path';
import { MlldError } from '@core/errors';
import type { PrefixConfig } from '@core/resolvers/types';

export interface ModuleLockEntry {
  version: string;           // The resolved version
  resolved: string;          // SHA-256 hash of content
  source: string;           // The source URL (gist or github)
  integrity: string;        // SRI integrity hash
  fetchedAt: string;        // ISO timestamp when fetched
  registryVersion?: string; // Version from registry when resolved
}

export interface LockFileData {
  lockfileVersion: number;  // Lock file format version
  modules: Record<string, ModuleLockEntry>;
  metadata?: {
    mlldVersion?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

// RegistryEntry interface removed - now handled by ConfigFile

export class LockFile {
  private data: LockFileData | null = null;
  private isDirty: boolean = false;
  private loaded: boolean = false;

  constructor(private readonly filePath: string) {
    // Lazy loading - don't load in constructor
  }

  private ensureLoaded(): void {
    if (this.loaded) return;

    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(content);

        this.data = {
          lockfileVersion: parsed.lockfileVersion || 1,
          modules: parsed.modules || {},
          metadata: parsed.metadata
        };
      } else {
        // Initialize with empty lock file
        this.data = {
          lockfileVersion: 1,
          modules: {},
          metadata: {
            createdAt: new Date().toISOString()
          }
        };
      }
    } catch (error) {
      console.warn(`Failed to load lock file: ${error.message}`);
      // Initialize with empty lock file on error
      this.data = {
        lockfileVersion: 1,
        modules: {},
        metadata: {
          createdAt: new Date().toISOString()
        }
      };
    }

    this.loaded = true;
  }

  async save(): Promise<void> {
    if (!this.isDirty) return;
    this.ensureLoaded();

    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    await fs.promises.writeFile(
      this.filePath,
      JSON.stringify(this.data, null, 2)
    );
    
    this.isDirty = false;
  }


  async calculateIntegrity(content: string): Promise<string> {
    // Use Node.js crypto for SHA256
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return `sha256:${hash.digest('hex')}`;
  }

  // Check if any modules are outdated (for mlld outdated command)
  async checkOutdated(
    checkFn: (moduleName: string, entry: ModuleLockEntry) => Promise<boolean>
  ): Promise<Array<{ moduleName: string; entry: ModuleLockEntry }>> {
    this.ensureLoaded();
    const outdated: Array<{ moduleName: string; entry: ModuleLockEntry }> = [];
    
    for (const [moduleName, entry] of Object.entries(this.data!.modules)) {
      if (await checkFn(moduleName, entry)) {
        outdated.push({ moduleName, entry });
      }
    }
    
    return outdated;
  }

  // Module management methods
  getModule(moduleName: string): ModuleLockEntry | undefined {
    this.ensureLoaded();
    return this.data!.modules[moduleName];
  }

  async addModule(moduleName: string, entry: ModuleLockEntry): Promise<void> {
    this.ensureLoaded();
    this.data!.modules[moduleName] = entry;
    this.data!.metadata = {
      ...this.data!.metadata,
      updatedAt: new Date().toISOString()
    };
    this.isDirty = true;
    await this.save();
  }

  async updateModule(moduleName: string, entry: Partial<ModuleLockEntry>): Promise<void> {
    this.ensureLoaded();
    const existing = this.data!.modules[moduleName];
    if (!existing) {
      throw new MlldError(`No lock entry found for module ${moduleName}`);
    }

    this.data!.modules[moduleName] = { ...existing, ...entry };
    this.data!.metadata = {
      ...this.data!.metadata,
      updatedAt: new Date().toISOString()
    };
    this.isDirty = true;
    await this.save();
  }

  async removeModule(moduleName: string): Promise<void> {
    this.ensureLoaded();
    delete this.data!.modules[moduleName];
    this.data!.metadata = {
      ...this.data!.metadata,
      updatedAt: new Date().toISOString()
    };
    this.isDirty = true;
    await this.save();
  }

  getAllModules(): Record<string, ModuleLockEntry> {
    this.ensureLoaded();
    return { ...this.data!.modules };
  }

  // Check module integrity
  async verifyModuleIntegrity(moduleName: string, content: string): Promise<boolean> {
    const entry = this.getModule(moduleName);
    if (!entry) return true; // No lock entry to verify against

    const hash = await this.calculateIntegrity(content);
    return hash === entry.integrity;
  }
  
  // Update the lock file path (for project root discovery)
  updatePath(newPath: string): void {
    this.filePath = newPath;
    this.loaded = false; // Force reload on next access
  }
}
