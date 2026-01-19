import * as fs from 'fs';
import * as path from 'path';
import { LockFile } from './LockFile';
import { ConfigFile } from './ConfigFile';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import type { PrefixConfig } from '@core/resolvers/types';

/**
 * Unified manager for mlld-config.json and mlld-lock.json
 * Handles the split configuration architecture
 */
export class ProjectConfig {
  private configFile: ConfigFile;
  private lockFile: LockFile;
  private projectRoot: string;

  constructor(projectRoot?: string) {
    // Find project root if not provided
    this.projectRoot = projectRoot || findProjectRoot(process.cwd());

    // Initialize both files
    this.configFile = new ConfigFile(path.join(this.projectRoot, 'mlld-config.json'));
    this.lockFile = new LockFile(path.join(this.projectRoot, 'mlld-lock.json'), {
      fallbackPaths: [
        path.join(this.projectRoot, 'mlld.lock.json'),
        path.join(this.projectRoot, '.mlld', 'mlld.lock.json')
      ]
    });
  }

  // === Config File Methods (User-editable) ===

  getDependencies(): Record<string, string> {
    return this.configFile.getDependencies();
  }

  async addDependency(name: string, version: string = 'latest'): Promise<void> {
    await this.configFile.addDependency(name, version);
  }

  async removeDependency(name: string): Promise<void> {
    await this.configFile.removeDependency(name);
    // Also remove from lock file
    await this.lockFile.removeModule(name);
  }

  getResolverPrefixes(): PrefixConfig[] {
    return this.configFile.getResolverPrefixes();
  }

  async setResolverPrefixes(prefixes: PrefixConfig[]): Promise<void> {
    await this.configFile.setResolverPrefixes(prefixes);
  }

  getAllowedEnvVars(): string[] {
    return this.configFile.getAllowedEnvVars();
  }

  async addAllowedEnvVar(varName: string): Promise<void> {
    await this.configFile.addAllowedEnvVar(varName);
  }

  async removeAllowedEnvVar(varName: string): Promise<void> {
    const currentVars = this.getAllowedEnvVars();
    const index = currentVars.indexOf(varName);
    if (index !== -1) {
      currentVars.splice(index, 1);
      const security = this.configFile.getSecurityConfig() || {};
      await this.configFile.setSecurityConfig({
        ...security,
        allowedEnvVars: currentVars
      });
    }
  }

  async clearAllowedEnvVars(): Promise<void> {
    const security = this.configFile.getSecurityConfig() || {};
    await this.configFile.setSecurityConfig({
      ...security,
      allowedEnvVars: []
    });
  }

  getTrustedDomains(): string[] {
    return this.configFile.getTrustedDomains();
  }

  async setTrustedDomains(domains: string[]): Promise<void> {
    await this.configFile.setTrustedDomains(domains);
  }

  getAllowAbsolutePaths(): boolean {
    return this.configFile.getAllowAbsolutePaths();
  }

  getAllowGuardBypass(): boolean {
    return this.configFile.getAllowGuardBypass();
  }

  getScriptDir(): string | undefined {
    return this.configFile.getScriptDir();
  }

  async setScriptDir(scriptDir: string): Promise<void> {
    await this.configFile.setScriptDir(scriptDir);
  }

  getNodePackageManager(): string | undefined {
    return this.configFile.getNodePackageManager();
  }

  async setNodePackageManager(manager?: string): Promise<void> {
    await this.configFile.setNodePackageManager(manager);
  }

  isDevMode(): boolean {
    return this.configFile.isDevMode();
  }

  async setDevMode(enabled: boolean): Promise<void> {
    await this.configFile.setDevMode(enabled);
  }

  getLocalModulesPath(): string {
    return this.configFile.getLocalModulesPath();
  }

  getPolicyImports(): string[] {
    return this.configFile.getPolicyImports();
  }

  getPolicyEnvironment(): string | undefined {
    return this.configFile.getPolicyEnvironment();
  }

  getConfigFilePath(): string {
    return this.configFile.getFilePath();
  }

  // === Lock File Methods (Auto-generated) ===

  getLockedModule(moduleName: string) {
    return this.lockFile.getModule(moduleName);
  }

  async lockModule(moduleName: string, version: string, hash: string, source: string, integrity: string) {
    await this.lockFile.addModule(moduleName, {
      version,
      resolved: hash,
      source,
      integrity,
      fetchedAt: new Date().toISOString()
    });
  }

  async updateLockedModule(moduleName: string, updates: any) {
    await this.lockFile.updateModule(moduleName, updates);
  }

  getAllLockedModules() {
    return this.lockFile.getAllModules();
  }

  async verifyModuleIntegrity(moduleName: string, content: string): Promise<boolean> {
    return this.lockFile.verifyModuleIntegrity(moduleName, content);
  }


  /**
   * Initialize a new project with default config
   */
  async init(): Promise<void> {
    const configPath = path.join(this.projectRoot, 'mlld-config.json');
    const lockPath = path.join(this.projectRoot, 'mlld-lock.json');

    // Create default config if it doesn't exist
    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        dependencies: {},
        resolvers: {
          prefixes: []
        },
        dev: {
          localModulesPath: "llm/modules",
          enabled: false
        }
      };
      await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    }

    // Create empty lock file if it doesn't exist
    if (!fs.existsSync(lockPath)) {
      const emptyLock = {
        lockfileVersion: 1,
        modules: {},
        metadata: {
          createdAt: new Date().toISOString()
        }
      };
      await fs.promises.writeFile(lockPath, JSON.stringify(emptyLock, null, 2));
    }
  }

  // === Utility Methods ===

  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Update paths when project root changes
   */
  updateProjectRoot(newRoot: string): void {
    this.projectRoot = newRoot;
    this.configFile.updatePath(path.join(newRoot, 'mlld-config.json'));
    this.lockFile.updatePath(path.join(newRoot, 'mlld-lock.json'));
  }
}
