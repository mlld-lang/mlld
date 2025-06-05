import * as path from 'path';
import { RegistryManager } from '@core/registry/RegistryManager';
import { OutputFormatter, formatModuleReference } from '../utils/output';
import { lockFileManager } from '../utils/lock-file';
import chalk from 'chalk';

export interface InfoOptions {
  verbose?: boolean;
  basePath?: string;
  format?: 'text' | 'json';
}

export interface ModuleInfo {
  name: string;
  author: string;
  description?: string;
  gist?: string;
  tags?: string[];
  created?: string;
  installed?: boolean;
  version?: string;
  approvedAt?: string;
  approvedBy?: string;
  integrity?: string;
  size?: number;
  advisories?: Array<{
    severity: string;
    description: string;
  }>;
  dependencies?: string[];
  repository?: string;
  license?: string;
}

export class InfoCommand {
  private registryManager: RegistryManager;
  
  constructor(basePath: string) {
    this.registryManager = new RegistryManager(basePath, {
      enabled: true,
      telemetry: { enabled: false }
    });
  }

  async getInfo(moduleRef: string, options: InfoOptions = {}): Promise<ModuleInfo> {
    const { username, moduleName } = formatModuleReference(moduleRef);
    
    // Get module info from registry
    const moduleInfo = await this.fetchModuleInfo(username, moduleName);
    
    // Check if installed locally
    const lockFile = this.registryManager.getLockFile();
    const importPath = `mlld://${username}/${moduleName}`;
    const lockEntry = lockFile.getImport(importPath);
    
    const info: ModuleInfo = {
      name: moduleName,
      author: username,
      description: moduleInfo.description,
      gist: moduleInfo.gist,
      tags: moduleInfo.tags,
      created: moduleInfo.created,
      repository: moduleInfo.repository,
      license: moduleInfo.license,
      installed: !!lockEntry
    };
    
    // Add installation details if installed
    if (lockEntry) {
      info.version = lockEntry.gistRevision;
      info.approvedAt = lockEntry.approvedAt;
      info.approvedBy = lockEntry.approvedBy;
      info.integrity = lockEntry.integrity;
      
      // Try to get cached content size
      try {
        const cache = this.registryManager.getCache();
        const cached = await cache.get(lockEntry.resolved, lockEntry.gistRevision);
        if (cached) {
          info.size = Buffer.byteLength(cached, 'utf8');
        }
      } catch (error) {
        // Ignore cache errors
      }
    }
    
    // Check for security advisories
    if (moduleInfo.gist) {
      try {
        const resolver = this.registryManager.getResolver();
        info.advisories = await resolver.checkUserAdvisories(username, moduleName, moduleInfo.gist);
      } catch (error) {
        if (options.verbose) {
          console.warn(chalk.yellow(`Warning: Could not check advisories: ${error.message}`));
        }
      }
    }
    
    return info;
  }

  async displayInfo(moduleRef: string, options: InfoOptions = {}): Promise<void> {
    try {
      const info = await this.getInfo(moduleRef, options);
      
      if (options.format === 'json') {
        console.log(JSON.stringify(info, null, 2));
        return;
      }
      
      // Text format
      console.log(OutputFormatter.formatModuleInfo(info));
      
      // Additional verbose information
      if (options.verbose && info.installed) {
        console.log('\nDetailed Installation Info:');
        if (info.integrity) {
          console.log(`  Integrity: ${info.integrity}`);
        }
        if (info.size) {
          console.log(`  Size: ${this.formatSize(info.size)}`);
        }
      }
      
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        console.error(chalk.red(`Module not found: ${moduleRef}`));
        console.log('\nSuggestions:');
        console.log(chalk.gray('  • Check the module name spelling'));
        console.log(chalk.gray('  • Ensure the format is: @username/module or username/module'));
        console.log(chalk.gray(`  • Search for modules: mlld search ${moduleRef.split('/')[0] || moduleRef}`));
      } else {
        throw error;
      }
    }
  }

  private async fetchModuleInfo(username: string, moduleName: string): Promise<{
    description?: string;
    gist?: string;
    tags?: string[];
    created?: string;
    repository?: string;
    license?: string;
  }> {
    // In the real implementation, this would call the registry resolver
    // For now, simulate fetching module information
    
    // Simulate some delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return mock data for demonstration
    return {
      description: `A utility module by ${username}`,
      gist: 'abc123def456',
      tags: ['utility', 'helper'],
      created: new Date().toISOString(),
      repository: `https://github.com/${username}/${moduleName}`,
      license: 'MIT'
    };
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} bytes`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}

export async function infoCommand(moduleRef: string, options: InfoOptions = {}): Promise<void> {
  if (!moduleRef) {
    console.error(chalk.red('Module reference is required'));
    console.log('Usage: mlld info @username/module');
    process.exit(1);
  }
  
  const basePath = options.basePath || process.cwd();
  
  // Ensure we have a lock file (for checking installation status)
  await lockFileManager.ensureLockFile(basePath);
  
  const infoCmd = new InfoCommand(basePath);
  await infoCmd.displayInfo(moduleRef, options);
}

// CLI interface
export function createInfoCommand() {
  return {
    name: 'info',
    aliases: ['show'],
    description: 'Show detailed information about a module',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const moduleRef = args[0];
      
      if (!moduleRef) {
        console.error(chalk.red('Module reference is required'));
        console.log('Usage: mlld info @username/module');
        process.exit(1);
      }
      
      const options: InfoOptions = {
        verbose: flags.verbose || flags.v,
        basePath: flags['base-path'] || process.cwd(),
        format: flags.format || 'text'
      };
      
      // Validate format
      if (options.format && !['text', 'json'].includes(options.format)) {
        console.error(chalk.red('Invalid format. Must be: text or json'));
        process.exit(1);
      }
      
      try {
        await infoCommand(moduleRef, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}