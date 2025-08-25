import * as fs from 'fs';
import * as path from 'path';
import { MlldError } from '@core/errors';
import type { PrefixConfig } from '@core/resolvers/types';

export interface LockEntry {
  resolved: string;           // The resolved path (gist URL or registry path)
  gistRevision?: string;      // For gist imports
  integrity: string;          // SHA256 hash of content
  registryVersion?: string;   // Registry version when resolved
  approvedAt: string;         // ISO timestamp
  approvedBy?: string;        // User who approved
}

export interface LockFileData {
  version: string;
  imports: Record<string, LockEntry>;
  modules: Record<string, any>;
  cache: Record<string, any>;
  metadata?: {
    mlldVersion?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  config?: {
    resolvers?: {
      prefixes?: PrefixConfig[];
      registries?: any[];
    };
    security?: {
      allowedDomains?: string[];
      trustedDomains?: string[];
      blockedPatterns?: string[];
      allowedEnv?: string[];
    };
    scriptDir?: string;
    mode?: string; // 'development', 'production', or undefined (default user mode)
  };
  security?: {
    registries?: Record<string, RegistryEntry>;
    policies?: any;
    approvedImports?: Record<string, any>;
    blockedPatterns?: string[];
    trustedDomains?: string[];
    allowedEnv?: string[];
    allowAbsolutePaths?: boolean;
    allowedEnvVars?: string[];
  };
}

export interface RegistryEntry {
  url?: string;
  resolver?: string;
  type?: 'input' | 'output' | 'io';
  priority?: number;
  patterns?: string[];
  config?: any;
}

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
        this.data = JSON.parse(content);
      } else {
        // Initialize with empty lock file
        this.data = {
          version: '1.0.0',
          imports: {},
          modules: {},
          cache: {}
        };
      }
    } catch (error) {
      console.warn(`Failed to load lock file: ${error.message}`);
      // Initialize with empty lock file on error
      this.data = {
        version: '1.0.0',
        imports: {},
        modules: {},
        cache: {}
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

  getImport(importPath: string): LockEntry | undefined {
    this.ensureLoaded();
    return this.data!.imports[importPath];
  }

  async addImport(importPath: string, entry: LockEntry): Promise<void> {
    this.ensureLoaded();
    this.data!.imports[importPath] = entry;
    this.isDirty = true;
    await this.save();
  }

  async updateImport(importPath: string, entry: Partial<LockEntry>): Promise<void> {
    this.ensureLoaded();
    const existing = this.data!.imports[importPath];
    if (!existing) {
      throw new MlldError(`No lock entry found for ${importPath}`);
    }
    
    this.data!.imports[importPath] = { ...existing, ...entry };
    this.isDirty = true;
    await this.save();
  }

  async removeImport(importPath: string): Promise<void> {
    this.ensureLoaded();
    delete this.data!.imports[importPath];
    this.isDirty = true;
    await this.save();
  }

  getAllImports(): Record<string, LockEntry> {
    this.ensureLoaded();
    return { ...this.data!.imports };
  }

  async verifyIntegrity(importPath: string, content: string): Promise<boolean> {
    const entry = this.getImport(importPath);
    if (!entry) return true; // No lock entry to verify against
    
    const hash = await this.calculateIntegrity(content);
    return hash === entry.integrity;
  }

  async calculateIntegrity(content: string): Promise<string> {
    // Use Node.js crypto for SHA256
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return `sha256:${hash.digest('hex')}`;
  }

  // Check if any imports are outdated (for mlld outdated command)
  async checkOutdated(
    checkFn: (importPath: string, entry: LockEntry) => Promise<boolean>
  ): Promise<Array<{ importPath: string; entry: LockEntry }>> {
    this.ensureLoaded();
    const outdated: Array<{ importPath: string; entry: LockEntry }> = [];
    
    for (const [importPath, entry] of Object.entries(this.data!.imports)) {
      if (await checkFn(importPath, entry)) {
        outdated.push({ importPath, entry });
      }
    }
    
    return outdated;
  }

  // Registry/Resolver configuration methods
  getRegistries(): Record<string, RegistryEntry> {
    this.ensureLoaded();
    return this.data!.security?.registries || {};
  }

  getRegistryConfig(name: string): RegistryEntry | undefined {
    this.ensureLoaded();
    return this.data!.security?.registries?.[name];
  }

  async setRegistry(name: string, config: RegistryEntry): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.security) {
      this.data!.security = {};
    }
    if (!this.data!.security.registries) {
      this.data!.security.registries = {};
    }
    
    this.data!.security.registries[name] = config;
    this.isDirty = true;
    await this.save();
  }

  async removeRegistry(name: string): Promise<void> {
    this.ensureLoaded();
    if (this.data!.security?.registries) {
      delete this.data!.security.registries[name];
      this.isDirty = true;
      await this.save();
    }
  }

  // Get all resolver configurations sorted by priority
  getResolverConfigs(): Array<{ name: string; config: RegistryEntry }> {
    const registries = this.getRegistries();
    const configs = Object.entries(registries).map(([name, config]) => ({
      name,
      config
    }));

    // Sort by priority (lower number = higher priority)
    return configs.sort((a, b) => {
      const priorityA = a.config.priority ?? 999;
      const priorityB = b.config.priority ?? 999;
      return priorityA - priorityB;
    });
  }

  // Security policy methods
  getSecurityPolicy(): any {
    this.ensureLoaded();
    return this.data!.security?.policies || {};
  }

  getTrustedDomains(): string[] {
    this.ensureLoaded();
    return this.data!.security?.trustedDomains || [];
  }

  async setTrustedDomains(domains: string[]): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.security) {
      this.data!.security = {};
    }
    this.data!.security.trustedDomains = domains;
    this.isDirty = true;
    await this.save();
  }

  getBlockedPatterns(): string[] {
    this.ensureLoaded();
    return this.data!.security?.blockedPatterns || [];
  }

  async setSecurityPolicy(policy: any): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.security) {
      this.data!.security = {};
    }
    
    this.data!.security.policies = policy;
    this.isDirty = true;
    await this.save();
  }

  getAllowAbsolutePaths(): boolean {
    this.ensureLoaded();
    return this.data!.security?.allowAbsolutePaths === true;
  }

  // Environment variable management methods
  getAllowedEnvVars(): string[] {
    this.ensureLoaded();
    return this.data!.security?.allowedEnvVars || [];
  }

  async addAllowedEnvVar(varName: string): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.security) {
      this.data!.security = {};
    }
    if (!this.data!.security.allowedEnvVars) {
      this.data!.security.allowedEnvVars = [];
    }
    
    // Only add if not already present
    if (!this.data!.security.allowedEnvVars.includes(varName)) {
      this.data!.security.allowedEnvVars.push(varName);
      this.isDirty = true;
      await this.save();
    }
  }

  async removeAllowedEnvVar(varName: string): Promise<void> {
    this.ensureLoaded();
    if (this.data!.security?.allowedEnvVars) {
      const index = this.data!.security.allowedEnvVars.indexOf(varName);
      if (index !== -1) {
        this.data!.security.allowedEnvVars.splice(index, 1);
        this.isDirty = true;
        await this.save();
      }
    }
  }

  async clearAllowedEnvVars(): Promise<void> {
    this.ensureLoaded();
    if (this.data!.security?.allowedEnvVars) {
      this.data!.security.allowedEnvVars = [];
      this.isDirty = true;
      await this.save();
    }
  }

  hasAllowedEnvVarsConfigured(): boolean {
    this.ensureLoaded();
    return (this.data!.security?.allowedEnvVars && this.data!.security.allowedEnvVars.length > 0) || false;
  }

  // Prefix configuration management methods
  getResolverPrefixes(): PrefixConfig[] {
    this.ensureLoaded();
    if (!this.data!.config?.resolvers?.prefixes) {
      return [];
    }
    return this.data!.config.resolvers.prefixes;
  }

  async setResolverPrefixes(prefixes: PrefixConfig[]): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.config) {
      this.data!.config = {};
    }
    if (!this.data!.config.resolvers) {
      this.data!.config.resolvers = {};
    }
    
    this.data!.config.resolvers.prefixes = prefixes;
    this.isDirty = true;
    await this.save();
  }
  
  // Get the script directory configuration
  getScriptDir(): string | undefined {
    this.ensureLoaded();
    return this.data!.config?.scriptDir;
  }
  
  // Set the script directory configuration
  async setScriptDir(scriptDir: string): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.config) {
      this.data!.config = {};
    }
    this.data!.config.scriptDir = scriptDir;
    this.isDirty = true;
    await this.save();
  }
  
  // Update the lock file path (for project root discovery)
  updatePath(newPath: string): void {
    this.filePath = newPath;
    this.loaded = false; // Force reload on next access
  }
}