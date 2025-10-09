import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { ModuleWorkspace, type ModuleLockEntry } from '@core/registry';
import { OutputFormatter } from '../utils/output';
import { getCommandContext } from '../utils/command-context';

export interface CleanOptions {
  all?: boolean;
  registry?: boolean;
  verbose?: boolean;
  basePath?: string;
}

export class CleanCommand {
  private readonly workspace: ModuleWorkspace;
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.workspace = new ModuleWorkspace({ projectRoot: basePath });
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
    const modules = this.workspace.lockFile.getAllModules();

    if (Object.keys(modules).length === 0) {
      console.log(chalk.gray('No modules in lock file to clean'));
      return;
    }

    if (options.verbose) {
      console.log(chalk.bold('Cleaning all modules:'));
      for (const moduleName of Object.keys(modules)) {
        console.log(`  ${chalk.gray('-')} ${moduleName}`);
      }
      console.log('');
    }

    for (const [moduleName, entry] of Object.entries(modules)) {
      await this.removeModule(moduleName, entry, options);
    }

    console.log(chalk.green(`Cleaned ${Object.keys(modules).length} module(s) from lock file and cache`));
  }

  private async cleanRegistry(options: CleanOptions): Promise<void> {
    const modules = this.workspace.lockFile.getAllModules();
    const registryModules = Object.entries(modules).filter(([, entry]) => this.isRegistryModule(entry));

    if (registryModules.length === 0) {
      console.log(chalk.gray('No registry modules in lock file to clean'));
      return;
    }

    if (options.verbose) {
      console.log(chalk.bold('Cleaning registry modules:'));
      for (const [moduleName] of registryModules) {
        console.log(`  ${chalk.gray('-')} ${moduleName}`);
      }
      console.log('');
    }

    for (const [moduleName, entry] of registryModules) {
      await this.removeModule(moduleName, entry, options);
    }

    console.log(chalk.green(`Cleaned ${registryModules.length} registry module(s) from lock file and cache`));
  }

  private async cleanModules(moduleNames: string[], options: CleanOptions): Promise<void> {
    const modules = this.workspace.lockFile.getAllModules();
    const cleanedModules: string[] = [];
    const notFoundModules: string[] = [];

    for (const name of moduleNames) {
      const normalized = this.workspace.normalizeModuleName(name);
      const entry = modules[normalized];

      if (!entry) {
        notFoundModules.push(name);
        continue;
      }

      if (options.verbose) {
        console.log(`Cleaning ${chalk.cyan(normalized)}`);
      }

      await this.removeModule(normalized, entry, options);
      cleanedModules.push(normalized);
    }

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

  private async removeModule(moduleName: string, entry: ModuleLockEntry, options: CleanOptions): Promise<void> {
    try {
      if (entry.resolved) {
        await this.workspace.moduleCache.remove(entry.resolved);
      }
    } catch (error) {
      if (options.verbose) {
        console.log(chalk.yellow(`Warning: Could not remove cache for ${moduleName}: ${(error as Error).message}`));
      }
    }

    if (entry.sourceUrl) {
      await this.cleanLegacyImportCache(entry.sourceUrl);
    }

    await this.workspace.lockFile.removeModule(moduleName);
  }

  private isRegistryModule(entry: ModuleLockEntry): boolean {
    const source = entry.sourceUrl ?? entry.source ?? '';
    return source.startsWith('registry://') || source.includes('gist.githubusercontent.com') || source.includes('github.com');
  }

  private async cleanLegacyImportCache(resolvedUrl: string): Promise<void> {
    const importCachePath = path.join(this.basePath, '.mlld', 'cache', 'imports');

    try {
      const hash = crypto.createHash('sha256').update(resolvedUrl).digest('hex');
      const cacheFile = path.join(importCachePath, hash);
      const metaFile = `${cacheFile}.meta.json`;

      await fs.unlink(cacheFile).catch(() => {});
      await fs.unlink(metaFile).catch(() => {});
    } catch {
      // Ignore legacy cache cleanup errors
    }
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
  const context = await getCommandContext({ startPath: options.basePath });
  const cleaner = new CleanCommand(context.projectRoot);
  await cleaner.clean(moduleNames, options);
}

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

      try {
        await cleanCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}
