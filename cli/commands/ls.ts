import * as path from 'path';
import { RegistryManager } from '@core/registry/RegistryManager';
import { OutputFormatter, type ModuleDisplayInfo } from '../utils/output';
import { lockFileManager } from '../utils/lock-file';
import chalk from 'chalk';

export interface LsOptions {
  verbose?: boolean;
  lock?: boolean;
  cached?: boolean;
  missing?: boolean;
  basePath?: string;
  format?: 'table' | 'list' | 'json';
}

export class LsCommand {
  private registryManager: RegistryManager;
  
  constructor(basePath: string) {
    this.registryManager = new RegistryManager(basePath, {
      enabled: true,
      telemetry: { enabled: false }
    });
  }

  async list(options: LsOptions = {}): Promise<void> {
    if (options.cached) {
      await this.listCachedModules(options);
    } else {
      await this.listLockedModules(options);
    }
  }

  private async listLockedModules(options: LsOptions): Promise<void> {
    const lockFile = this.registryManager.getLockFile();
    const imports = lockFile.getAllImports();
    
    if (Object.keys(imports).length === 0) {
      console.log(chalk.gray('No modules in lock file'));
      console.log(chalk.gray('Run \'mlld install @username/module\' to install modules'));
      return;
    }
    
    const modules: ModuleDisplayInfo[] = [];
    const cache = this.registryManager.getCache();
    
    for (const [importPath, entry] of Object.entries(imports)) {
      const moduleName = this.extractModuleName(importPath);
      
      try {
        // Check cache status
        const cached = await cache.get(entry.resolved, entry.gistRevision);
        const size = cached ? await this.estimateSize(cached) : undefined;
        
        modules.push({
          name: moduleName,
          hash: entry.gistRevision || entry.integrity?.split(':')[1],
          size,
          registry: this.extractRegistry(entry.resolved),
          cached: !!cached,
          missing: !cached
        });
      } catch (error) {
        modules.push({
          name: moduleName,
          hash: entry.gistRevision || entry.integrity?.split(':')[1],
          registry: this.extractRegistry(entry.resolved),
          cached: false,
          missing: true,
          error: error.message
        });
      }
    }
    
    // Filter based on options
    let filteredModules = modules;
    if (options.missing) {
      filteredModules = modules.filter(m => m.missing);
    }
    
    // Sort modules by name
    filteredModules.sort((a, b) => a.name.localeCompare(b.name));
    
    // Output based on format
    if (options.format === 'json') {
      console.log(JSON.stringify(filteredModules, null, 2));
      return;
    }
    
    if (options.format === 'table') {
      this.outputAsTable(filteredModules, options);
    } else {
      this.outputAsList(filteredModules, options);
    }
    
    // Summary
    this.outputSummary(modules, options);
  }

  private async listCachedModules(options: LsOptions): Promise<void> {
    // This would require the Cache class to expose a list method
    // For now, we'll list from lock file and show cache status
    console.log(chalk.gray('Listing cache status for locked modules...'));
    await this.listLockedModules({ ...options, cached: false });
  }

  private outputAsList(modules: ModuleDisplayInfo[], options: LsOptions): void {
    if (modules.length === 0) {
      console.log(chalk.gray('No modules match the filter criteria'));
      return;
    }
    
    console.log(chalk.bold('Modules in mlld.lock.json:'));
    console.log(OutputFormatter.formatModuleList(modules, { verbose: options.verbose }));
  }

  private outputAsTable(modules: ModuleDisplayInfo[], options: LsOptions): void {
    if (modules.length === 0) {
      console.log(chalk.gray('No modules match the filter criteria'));
      return;
    }
    
    const headers = options.verbose 
      ? ['Module', 'Version', 'Status', 'Size', 'Registry']
      : ['Module', 'Status', 'Size', 'Registry'];
    
    const rows = modules.map(module => {
      const status = this.getStatusText(module);
      const size = module.size ? this.formatSize(module.size) : '-';
      const registry = module.registry || '-';
      
      if (options.verbose) {
        const version = module.hash ? module.hash.slice(0, 8) : '-';
        return [module.name, version, status, size, registry];
      } else {
        return [module.name, status, size, registry];
      }
    });
    
    console.log(OutputFormatter.formatTable(headers, rows));
  }

  private outputSummary(modules: ModuleDisplayInfo[], options: LsOptions): void {
    const total = modules.length;
    const cached = modules.filter(m => m.cached).length;
    const missing = modules.filter(m => m.missing).length;
    const errors = modules.filter(m => m.error).length;
    
    console.log('');
    
    if (total === 0) {
      return;
    }
    
    const parts: string[] = [];
    parts.push(`${total} module${total !== 1 ? 's' : ''}`);
    
    if (cached > 0) {
      parts.push(chalk.green(`${cached} cached`));
    }
    
    if (missing > 0) {
      parts.push(chalk.yellow(`${missing} missing`));
    }
    
    if (errors > 0) {
      parts.push(chalk.red(`${errors} error${errors !== 1 ? 's' : ''}`));
    }
    
    console.log(parts.join(', '));
    
    if (missing > 0 && !options.missing) {
      console.log(chalk.gray('Run \'mlld install\' to fetch missing modules'));
    }
  }

  private extractModuleName(importPath: string): string {
    // Convert "mlld://username/module" to "@username/module"
    const cleaned = importPath.replace('mlld://', '');
    return `@${cleaned}`;
  }

  private extractRegistry(resolved: string): string {
    if (resolved.includes('gist.githubusercontent.com')) {
      return 'gist';
    } else if (resolved.includes('github.com')) {
      return 'github';
    } else if (resolved.startsWith('https://')) {
      try {
        const url = new URL(resolved);
        return url.hostname;
      } catch {
        return 'unknown';
      }
    }
    return 'local';
  }

  private getStatusText(module: ModuleDisplayInfo): string {
    if (module.error) {
      return chalk.red('error');
    } else if (module.missing) {
      return chalk.yellow('missing');
    } else if (module.cached) {
      return chalk.green('cached');
    } else {
      return chalk.gray('unknown');
    }
  }

  private async estimateSize(content: string): Promise<number> {
    // Estimate size of module content in bytes
    return Buffer.byteLength(content, 'utf8');
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}b`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}kb`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
    }
  }
}

export async function lsCommand(options: LsOptions = {}): Promise<void> {
  const basePath = options.basePath || process.cwd();
  
  // Ensure we have a lock file
  const lockFile = await lockFileManager.ensureLockFile(basePath);
  
  const lister = new LsCommand(basePath);
  await lister.list(options);
}

// CLI interface
export function createLsCommand() {
  return {
    name: 'ls',
    aliases: ['list'],
    description: 'List installed mlld modules',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: LsOptions = {
        verbose: flags.verbose || flags.v,
        lock: flags.lock,
        cached: flags.cached,
        missing: flags.missing,
        basePath: flags['base-path'] || process.cwd(),
        format: flags.format || 'list'
      };
      
      // Validate format
      if (options.format && !['table', 'list', 'json'].includes(options.format)) {
        console.error(chalk.red('Invalid format. Must be: table, list, or json'));
        process.exit(1);
      }
      
      try {
        await lsCommand(options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}