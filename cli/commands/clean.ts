import { RegistryManager } from '@core/registry/RegistryManager';
import { LockFile } from '@core/registry/LockFile';
import { Cache } from '@core/registry/Cache';
import { OutputFormatter } from '../utils/output';
import { lockFileManager } from '../utils/lock-file';
import { getCommandContext } from '../utils/command-context';
import chalk from 'chalk';
import * as path from 'path';

export interface CleanOptions {
  all?: boolean;
  registry?: boolean;
  verbose?: boolean;
  basePath?: string;
}

export class CleanCommand {
  private lockFile: LockFile;
  private cache: Cache;
  
  constructor(basePath: string) {
    // Use lock file in project root, not in .mlld subdirectory
    this.lockFile = new LockFile(path.join(basePath, 'mlld.lock.json'));
    this.cache = new Cache(path.join(basePath, '.mlld', 'cache'));
  }

  async clean(moduleNames: string[] = [], options: CleanOptions = {}): Promise<void> {
    
    if (options.all) {
      await this.cleanAll(options);
    } else if (options.registry) {
      await this.cleanRegistry(options);
    } else if (moduleNames.length > 0) {
      await this.cleanModules(moduleNames, options);
    } else {
      console.error(chalk.red('Must specify module names, --all, or --registry'));
      this.showUsage();
      process.exit(1);
    }
  }

  private async cleanAll(options: CleanOptions): Promise<void> {
    const imports = this.lockFile.getAllImports();
    
    if (Object.keys(imports).length === 0) {
      console.log(chalk.gray('No modules in lock file to clean'));
      return;
    }
    
    if (options.verbose) {
      console.log(chalk.bold('Cleaning all modules:'));
      for (const importPath of Object.keys(imports)) {
        console.log(`  ${chalk.gray('-')} ${importPath}`);
      }
      console.log('');
    }
    
    // Clear all imports - remove each import individually
    for (const importPath of Object.keys(imports)) {
      await this.lockFile.removeImport(importPath);
    }
    
    // Clear all cache entries
    await this.cache.clear();
    
    console.log(chalk.green(`Cleaned ${Object.keys(imports).length} module(s) from lock file and cache`));
  }

  private async cleanRegistry(options: CleanOptions): Promise<void> {
    const imports = this.lockFile.getAllImports();
    
    const registryModules = Object.entries(imports).filter(([, entry]) => 
      entry.resolved.startsWith('registry://') || 
      entry.resolved.includes('gist.githubusercontent.com') ||
      entry.resolved.includes('github.com')
    );
    
    if (registryModules.length === 0) {
      console.log(chalk.gray('No registry modules in lock file to clean'));
      return;
    }
    
    if (options.verbose) {
      console.log(chalk.bold('Cleaning registry modules:'));
      for (const [importPath] of registryModules) {
        console.log(`  ${chalk.gray('-')} ${importPath}`);
      }
      console.log('');
    }
    
    // Remove registry imports
    for (const [importPath] of registryModules) {
      await this.lockFile.removeImport(importPath);
    }
    
    // Clear cache entries for registry modules
    for (const [, entry] of registryModules) {
      try {
        await this.cache.remove(entry.resolved, entry.gistRevision);
      } catch (error) {
        if (options.verbose) {
          console.log(chalk.yellow(`Warning: Could not remove cache for ${entry.resolved}: ${(error as Error).message}`));
        }
      }
    }
    
    console.log(chalk.green(`Cleaned ${registryModules.length} registry module(s) from lock file and cache`));
  }

  private async cleanModules(moduleNames: string[], options: CleanOptions): Promise<void> {
    const imports = this.lockFile.getAllImports();
    
    const cleanedModules: string[] = [];
    const notFoundModules: string[] = [];
    
    for (const moduleName of moduleNames) {
      // Find matching import path
      const importPath = this.findImportPath(moduleName, imports);
      
      if (!importPath) {
        notFoundModules.push(moduleName);
        continue;
      }
      
      const entry = imports[importPath];
      
      if (options.verbose) {
        console.log(`Cleaning ${chalk.cyan(moduleName)} (${importPath})`);
      }
      
      // Remove from lock file
      await this.lockFile.removeImport(importPath);
      
      // Remove from cache
      try {
        await this.cache.remove(entry.resolved, entry.gistRevision);
      } catch (error) {
        if (options.verbose) {
          console.log(chalk.yellow(`Warning: Could not remove cache for ${entry.resolved}: ${(error as Error).message}`));
        }
      }
      
      cleanedModules.push(moduleName);
    }
    
    // Report results
    if (cleanedModules.length > 0) {
      console.log(chalk.green(`Cleaned ${cleanedModules.length} module(s): ${cleanedModules.join(', ')}`));
    }
    
    if (notFoundModules.length > 0) {
      console.log(chalk.yellow(`Not found: ${notFoundModules.join(', ')}`));
    }
    
    if (cleanedModules.length === 0) {
      console.log(chalk.gray('No modules were cleaned'));
    }
  }

  private findImportPath(moduleName: string, imports: Record<string, any>): string | null {
    // Try exact match first
    if (imports[moduleName]) {
      return moduleName;
    }
    
    // Try with @ prefix if not present
    const withAt = moduleName.startsWith('@') ? moduleName : `@${moduleName}`;
    if (imports[withAt]) {
      return withAt;
    }
    
    // Try without @ prefix if present
    const withoutAt = moduleName.startsWith('@') ? moduleName.slice(1) : moduleName;
    if (imports[withoutAt]) {
      return withoutAt;
    }
    
    // Search for partial matches (case-insensitive)
    const lowerModule = moduleName.toLowerCase();
    for (const importPath of Object.keys(imports)) {
      if (importPath.toLowerCase().includes(lowerModule)) {
        return importPath;
      }
    }
    
    return null;
  }

  private showUsage(): void {
    console.log('');
    console.log(chalk.bold('Usage:'));
    console.log('  mlld clean <module...>     Clean specific modules');
    console.log('  mlld clean --all           Clean all modules');
    console.log('  mlld clean --registry      Clean only registry modules');
    console.log('');
    console.log(chalk.bold('Examples:'));
    console.log('  mlld clean @mlld/env');
    console.log('  mlld clean @mlld/env @mlld/github');
    console.log('  mlld clean mlld/env        # @ prefix optional');
    console.log('  mlld clean --all');
    console.log('  mlld clean --registry');
  }
}

export async function cleanCommand(moduleNames: string[] = [], options: CleanOptions = {}): Promise<void> {
  // Get command context to find project root
  const context = await getCommandContext({ startPath: options.basePath });
  const basePath = context.projectRoot;
  
  const cleaner = new CleanCommand(basePath);
  await cleaner.clean(moduleNames, options);
}

// CLI interface
export function createCleanCommand() {
  return {
    name: 'clean',
    description: 'Remove modules from lock file and cache',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: CleanOptions = {
        all: flags.all,
        registry: flags.registry,
        verbose: flags.verbose || flags.v,
        basePath: flags['base-path'] || process.cwd()
      };
      
      // Module names are the remaining arguments
      const moduleNames = args;
      
      try {
        await cleanCommand(moduleNames, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}