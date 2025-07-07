import { RegistryManager } from '@core/registry/RegistryManager';
import { ProgressIndicator } from '../utils/progress';
import { OutputFormatter, formatModuleReference, formatInstallTarget } from '../utils/output';
import { lockFileManager } from '../utils/lock-file';
import { getCommandContext } from '../utils/command-context';
import chalk from 'chalk';

export interface InstallOptions {
  verbose?: boolean;
  noCache?: boolean;
  dryRun?: boolean;
  force?: boolean;
  basePath?: string;
}

export class InstallCommand {
  private registryManager: RegistryManager;
  private progress: ProgressIndicator;
  
  constructor(basePath: string, options: InstallOptions = {}) {
    this.registryManager = new RegistryManager(basePath, {
      enabled: true,
      telemetry: { enabled: false } // CLI should not enable telemetry by default
    });
    
    this.progress = new ProgressIndicator({
      style: 'emoji',
      verbose: options.verbose
    });
  }

  async install(modules: string[] = [], options: InstallOptions = {}): Promise<void> {
    try {
      if (modules.length === 0) {
        // Install from lock file
        await this.installFromLockFile(options);
      } else {
        // Install specific modules
        await this.installSpecificModules(modules, options);
      }
    } catch (error) {
      this.progress.fail(`Installation failed: ${error.message}`);
      throw error;
    }
  }

  private async installFromLockFile(options: InstallOptions): Promise<void> {
    this.progress.start('Reading lock file');
    
    const lockFile = this.registryManager.getLockFile();
    const imports = lockFile.getAllImports();
    const moduleCount = Object.keys(imports).length;
    
    if (moduleCount === 0) {
      this.progress.succeed('No modules to install');
      return;
    }
    
    this.progress.update(`Installing ${moduleCount} module${moduleCount !== 1 ? 's' : ''}`);
    
    let installedCount = 0;
    let cachedCount = 0;
    let failedCount = 0;
    
    for (const [importPath, entry] of Object.entries(imports)) {
      const moduleName = this.extractModuleName(importPath);
      
      try {
        this.progress.update(`Checking ${moduleName}`);
        
        // Check cache first
        const cache = this.registryManager.getCache();
        const cached = await cache.get(entry.resolved, entry.gistRevision);
        
        if (cached && !options.noCache) {
          cachedCount++;
          this.progress.info(`${moduleName} (cached)`);
        } else {
          // Need to fetch
          this.progress.update(`Fetching ${moduleName}`);
          
          if (options.dryRun) {
            this.progress.info(`Would fetch ${moduleName}`);
          } else {
            // Simulate fetching for now - in real implementation this would
            // call the resolver to fetch the content
            await this.simulateFetch(moduleName);
            installedCount++;
          }
        }
      } catch (error) {
        failedCount++;
        this.progress.warn(`Failed to install ${moduleName}: ${error.message}`);
        if (options.verbose) {
          console.error(OutputFormatter.formatError(error, { verbose: true }));
        }
      }
    }
    
    this.progress.finish();
    
    if (options.dryRun) {
      console.log(chalk.cyan('Dry run completed - no changes made'));
    }
    
    const summary = OutputFormatter.formatInstallSummary(installedCount, cachedCount, failedCount);
    console.log(summary);
    
    if (failedCount > 0) {
      console.log(chalk.yellow(`\nSome modules failed to install. Use --verbose for details.`));
    }
  }

  private async installSpecificModules(modules: string[], options: InstallOptions): Promise<void> {
    this.progress.start(`Installing ${modules.length} module${modules.length !== 1 ? 's' : ''}`);
    
    let installedCount = 0;
    let cachedCount = 0;
    let failedCount = 0;
    
    for (const moduleRef of modules) {
      try {
        const { username, moduleName, version } = formatModuleReference(moduleRef);
        const displayName = formatInstallTarget(moduleRef);
        
        this.progress.update(`Resolving ${displayName}`);
        
        // Check if already in lock file
        const lockFile = this.registryManager.getLockFile();
        const importPath = `mlld://${username}/${moduleName}`;
        const existing = lockFile.getImport(importPath);
        
        if (existing && !options.force) {
          // Check cache
          const cache = this.registryManager.getCache();
          const cached = await cache.get(existing.resolved, existing.gistRevision);
          
          if (cached && !options.noCache) {
            cachedCount++;
            this.progress.info(`${displayName} (already installed, cached)`);
            continue;
          }
        }
        
        if (options.dryRun) {
          this.progress.info(`Would install ${displayName}`);
          continue;
        }
        
        // Resolve through registry
        this.progress.update(`Fetching ${displayName}`);
        
        // For now, simulate the resolution
        await this.simulateResolveAndInstall(username, moduleName, version);
        installedCount++;
        
        this.progress.info(`Installed ${displayName}`);
        
      } catch (error) {
        failedCount++;
        const displayName = moduleRef;
        this.progress.warn(`Failed to install ${displayName}: ${error.message}`);
        if (options.verbose) {
          console.error(OutputFormatter.formatError(error, { verbose: true }));
        }
      }
    }
    
    this.progress.finish();
    
    if (options.dryRun) {
      console.log(chalk.cyan('Dry run completed - no changes made'));
    }
    
    const summary = OutputFormatter.formatInstallSummary(installedCount, cachedCount, failedCount);
    console.log(summary);
    
    if (failedCount > 0) {
      console.log(chalk.yellow(`\nSome modules failed to install. Use --verbose for details.`));
    }
    
    if (installedCount > 0 && !options.dryRun) {
      console.log(chalk.green('Lock file updated'));
    }
  }

  private extractModuleName(importPath: string): string {
    // Convert "mlld://username/module" to "@username/module"
    const cleaned = importPath.replace('mlld://', '');
    return `@${cleaned}`;
  }

  private async simulateFetch(_moduleName: string): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  }

  private async simulateResolveAndInstall(_username: string, _moduleName: string, _version?: string): Promise<void> {
    // Simulate resolution and installation
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 500));
    
    // In the real implementation, this would:
    // 1. Resolve through RegistryResolver
    // 2. Fetch content from GitHub gist
    // 3. Verify integrity
    // 4. Cache the content
    // 5. Update lock file
  }
}

export async function installCommand(modules: string[], options: InstallOptions = {}): Promise<void> {
  // Get command context to find project root
  const context = await getCommandContext({ startPath: options.basePath });
  const basePath = context.projectRoot;
  
  // Ensure we have a lock file
  await lockFileManager.ensureLockFile(basePath);
  
  const installer = new InstallCommand(basePath, options);
  await installer.install(modules, options);
}

// CLI interface
export function createInstallCommand() {
  return {
    name: 'install',
    aliases: ['i'],
    description: 'Install mlld modules',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: InstallOptions = {
        verbose: flags.verbose || flags.v,
        noCache: flags['no-cache'],
        dryRun: flags['dry-run'],
        force: flags.force || flags.f,
        basePath: flags['base-path'] || process.cwd()
      };
      
      try {
        await installCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}