import * as fs from 'fs';
import * as path from 'path';
import { MlldError } from '@core/errors';
import type { PrefixConfig } from '@core/resolvers/types';

/**
 * User-editable configuration for mlld projects
 * This replaces the config section that was previously in mlld.lock.json
 */
export interface ConfigFileData {
  // Module dependencies (like package.json dependencies)
  dependencies?: Record<string, string>;  // @author/module: version/tag

  // Resolver configuration
  resolvers?: {
    prefixes?: PrefixConfig[];
  };

  // Security settings
  security?: {
    allowedDomains?: string[];
    trustedDomains?: string[];
    blockedPatterns?: string[];
    allowedEnvVars?: string[];
    allowAbsolutePaths?: boolean;
  };

  // Project settings
  scriptDir?: string;
  mode?: 'development' | 'production';

  // Development settings
  dev?: {
    localModulesPath?: string;  // defaults to "llm/modules"
    enabled?: boolean;
  };
}

export class ConfigFile {
  private data: ConfigFileData | null = null;
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
        // Initialize with empty config
        this.data = {};
      }
    } catch (error) {
      console.warn(`Failed to load config file: ${error.message}`);
      // Initialize with empty config on error
      this.data = {};
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

  // Dependencies management
  getDependencies(): Record<string, string> {
    this.ensureLoaded();
    return { ...(this.data!.dependencies || {}) };
  }

  async addDependency(name: string, version: string): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.dependencies) {
      this.data!.dependencies = {};
    }
    this.data!.dependencies[name] = version;
    this.isDirty = true;
    await this.save();
  }

  async removeDependency(name: string): Promise<void> {
    this.ensureLoaded();
    if (this.data!.dependencies) {
      delete this.data!.dependencies[name];
      this.isDirty = true;
      await this.save();
    }
  }

  // Resolver configuration
  getResolverPrefixes(): PrefixConfig[] {
    this.ensureLoaded();
    return this.data!.resolvers?.prefixes || [];
  }

  async setResolverPrefixes(prefixes: PrefixConfig[]): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.resolvers) {
      this.data!.resolvers = {};
    }
    this.data!.resolvers.prefixes = prefixes;
    this.isDirty = true;
    await this.save();
  }

  // Security configuration
  getSecurityConfig(): ConfigFileData['security'] {
    this.ensureLoaded();
    return this.data!.security;
  }

  async setSecurityConfig(security: ConfigFileData['security']): Promise<void> {
    this.ensureLoaded();
    this.data!.security = security;
    this.isDirty = true;
    await this.save();
  }

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

    if (!this.data!.security.allowedEnvVars.includes(varName)) {
      this.data!.security.allowedEnvVars.push(varName);
      this.isDirty = true;
      await this.save();
    }
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

  getAllowAbsolutePaths(): boolean {
    this.ensureLoaded();
    return this.data!.security?.allowAbsolutePaths === true;
  }

  // Project settings
  getScriptDir(): string | undefined {
    this.ensureLoaded();
    return this.data!.scriptDir;
  }

  async setScriptDir(scriptDir: string): Promise<void> {
    this.ensureLoaded();
    this.data!.scriptDir = scriptDir;
    this.isDirty = true;
    await this.save();
  }

  getMode(): 'development' | 'production' | undefined {
    this.ensureLoaded();
    return this.data!.mode;
  }

  async setMode(mode: 'development' | 'production' | undefined): Promise<void> {
    this.ensureLoaded();
    this.data!.mode = mode;
    this.isDirty = true;
    await this.save();
  }

  // Dev mode configuration
  isDevMode(): boolean {
    this.ensureLoaded();
    return this.data!.dev?.enabled === true || this.data!.mode === 'development';
  }

  getLocalModulesPath(): string {
    this.ensureLoaded();
    return this.data!.dev?.localModulesPath || 'llm/modules';
  }

  async setDevMode(enabled: boolean): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.dev) {
      this.data!.dev = {};
    }
    this.data!.dev.enabled = enabled;
    this.isDirty = true;
    await this.save();
  }

  // Get the entire config data
  getData(): ConfigFileData {
    this.ensureLoaded();
    return { ...this.data! };
  }

  // Update the file path (for project root discovery)
  updatePath(newPath: string): void {
    this.filePath = newPath;
    this.loaded = false; // Force reload on next access
  }
}