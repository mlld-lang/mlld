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
  resolverPrefixes?: PrefixConfig[]; // legacy top-level shape

  // Security settings
  security?: {
    allowedDomains?: string[];
    trustedDomains?: string[];
    blockedPatterns?: string[];
    allowedEnvVars?: string[];
    allowAbsolutePaths?: boolean;
    allowGuardBypass?: boolean;
  };

  // Validate command settings
  validate?: {
    suppressWarnings?: string[];
  };

  // Project settings
  projectname?: string;
  scriptDir?: string;
  mode?: 'development' | 'production';
  nodePackageManager?: string;

  // Development settings
  dev?: {
    localModulesPath?: string;  // defaults to "llm/modules"
    enabled?: boolean;
  };

  policy?: {
    import?: string[];
    environment?: string;
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
      this.validatePolicyConfig();
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
    if (this.data!.resolvers?.prefixes) {
      return this.data!.resolvers.prefixes;
    }
    if (this.data!.resolverPrefixes) {
      return this.data!.resolverPrefixes;
    }
    return [];
  }

  async setResolverPrefixes(prefixes: PrefixConfig[]): Promise<void> {
    this.ensureLoaded();
    if (!this.data!.resolvers) {
      this.data!.resolvers = {};
    }
    this.data!.resolvers.prefixes = prefixes;
    if (this.data!.resolverPrefixes) {
      delete this.data!.resolverPrefixes;
    }
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

  getAllowGuardBypass(): boolean {
    this.ensureLoaded();
    return this.data!.security?.allowGuardBypass !== false;
  }

  // Project settings
  getProjectName(): string | undefined {
    this.ensureLoaded();
    const name = this.data!.projectname;
    if (typeof name !== 'string') {
      return undefined;
    }
    const trimmed = name.trim();
    return trimmed ? trimmed : undefined;
  }

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

  getNodePackageManager(): string | undefined {
    this.ensureLoaded();
    return this.data!.nodePackageManager;
  }

  async setNodePackageManager(manager?: string): Promise<void> {
    this.ensureLoaded();
    if (manager && manager.trim().length > 0) {
      this.data!.nodePackageManager = manager;
    } else {
      delete this.data!.nodePackageManager;
    }
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

  getPolicyImports(): string[] {
    this.ensureLoaded();
    return this.data!.policy?.import ? [...this.data!.policy.import] : [];
  }

  getPolicyEnvironment(): string | undefined {
    this.ensureLoaded();
    return this.data!.policy?.environment;
  }

  getFilePath(): string {
    return this.filePath;
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

  private validatePolicyConfig(): void {
    if (!this.data?.policy) {
      return;
    }

    const policy = this.data.policy;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      throw new MlldError('Invalid policy configuration in mlld-config.json. Define policy.import with module references.', {
        code: 'INVALID_POLICY_CONFIG'
      });
    }

    const allowedKeys = new Set(['import', 'environment']);
    for (const key of Object.keys(policy)) {
      if (!allowedKeys.has(key)) {
        throw new MlldError('Inline policy configuration is not supported. Use policy.import to reference policy modules.', {
          code: 'INVALID_POLICY_CONFIG'
        });
      }
    }

    if (policy.import !== undefined) {
      if (!Array.isArray(policy.import) || policy.import.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
        throw new MlldError('policy.import must be an array of module references', {
          code: 'INVALID_POLICY_CONFIG'
        });
      }
    }

    if (policy.environment !== undefined && (typeof policy.environment !== 'string' || policy.environment.trim().length === 0)) {
      throw new MlldError('policy.environment must be a non-empty string when provided', {
        code: 'INVALID_POLICY_CONFIG'
      });
    }
  }
}
