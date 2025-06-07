import chalk from 'chalk';

export interface ModuleDisplayInfo {
  name: string;
  hash?: string;
  size?: number;
  registry?: string;
  cached?: boolean;
  missing?: boolean;
  error?: string;
}

export class OutputFormatter {
  
  static formatModuleList(modules: ModuleDisplayInfo[], options: { verbose?: boolean } = {}): string {
    if (modules.length === 0) {
      return chalk.gray('No modules found');
    }

    const lines: string[] = [];
    
    for (const module of modules) {
      const status = this.getModuleStatus(module);
      const size = module.size ? this.formatSize(module.size) : '-';
      const registry = module.registry ? chalk.gray(`(${module.registry})`) : '';
      
      if (options.verbose) {
        const hash = module.hash ? chalk.gray(module.hash.slice(0, 8)) : '-';
        lines.push(`  ${module.name}@${hash}  ${status}  ${size.padStart(8)}  ${registry}`);
      } else {
        lines.push(`  ${module.name}  ${status}  ${size.padStart(8)}  ${registry}`);
      }
    }

    return lines.join('\n');
  }

  static formatInstallSummary(
    installed: number, 
    cached: number, 
    failed: number = 0
  ): string {
    const parts: string[] = [];
    
    if (installed > 0) {
      parts.push(`${installed} module${installed !== 1 ? 's' : ''} installed`);
    }
    
    if (cached > 0) {
      parts.push(`${cached} from cache`);
    }
    
    if (failed > 0) {
      parts.push(chalk.red(`${failed} failed`));
    }
    
    if (parts.length === 0) {
      return chalk.gray('No modules processed');
    }
    
    return parts.join(', ');
  }

  static formatModuleInfo(module: {
    name: string;
    description?: string;
    author?: string;
    gist?: string;
    tags?: string[];
    created?: string;
    installed?: boolean;
    version?: string;
    approvedAt?: string;
    advisories?: Array<{ severity: string; description: string }>;
  }): string {
    const lines: string[] = [];
    
    lines.push(chalk.bold(`Module: ${module.author}/${module.name}`));
    
    if (module.description) {
      lines.push(`Description: ${module.description}`);
    }
    
    if (module.gist) {
      lines.push(`Gist: ${chalk.cyan(`https://gist.github.com/${module.author}/${module.gist}`)}`);
    }
    
    if (module.tags && module.tags.length > 0) {
      lines.push(`Tags: ${module.tags.join(', ')}`);
    }
    
    if (module.created) {
      lines.push(`Created: ${new Date(module.created).toLocaleDateString()}`);
    }
    
    lines.push(''); // Empty line before status
    
    if (module.installed) {
      lines.push(chalk.green('✓ Installed'));
      if (module.version) {
        lines.push(`  Version: ${module.version}`);
      }
      if (module.approvedAt) {
        lines.push(`  Approved: ${new Date(module.approvedAt).toLocaleDateString()}`);
      }
    } else {
      lines.push(chalk.gray('○ Not installed'));
    }
    
    if (module.advisories && module.advisories.length > 0) {
      lines.push('');
      lines.push(chalk.yellow('⚠️  Security Advisories:'));
      for (const advisory of module.advisories) {
        const severityColor = advisory.severity === 'high' ? chalk.red : 
                             advisory.severity === 'medium' ? chalk.yellow : chalk.gray;
        lines.push(`   ${severityColor(advisory.severity)}: ${advisory.description}`);
      }
    }
    
    return lines.join('\n');
  }

  static formatError(error: Error, options: { verbose?: boolean } = {}): string {
    const lines: string[] = [];
    
    lines.push(chalk.red(`Error: ${error.message}`));
    
    if (options.verbose && error.stack) {
      lines.push('');
      lines.push(chalk.gray('Stack trace:'));
      lines.push(chalk.gray(error.stack));
    }
    
    return lines.join('\n');
  }

  static formatTable(headers: string[], rows: string[][]): string {
    if (rows.length === 0) {
      return chalk.gray('No data to display');
    }

    // Calculate column widths
    const widths = headers.map((header, i) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
      return Math.max(header.length, maxRowWidth);
    });

    const lines: string[] = [];
    
    // Header
    const headerLine = headers.map((header, i) => header.padEnd(widths[i])).join(' │ ');
    lines.push(`┌─${widths.map(w => '─'.repeat(w)).join('─┬─')}─┐`);
    lines.push(`│ ${headerLine} │`);
    lines.push(`├─${widths.map(w => '─'.repeat(w)).join('─┼─')}─┤`);
    
    // Rows
    for (const row of rows) {
      const rowLine = row.map((cell, i) => (cell || '').padEnd(widths[i])).join(' │ ');
      lines.push(`│ ${rowLine} │`);
    }
    
    lines.push(`└─${widths.map(w => '─'.repeat(w)).join('─┴─')}─┘`);
    
    return lines.join('\n');
  }

  private static getModuleStatus(module: ModuleDisplayInfo): string {
    if (module.error) {
      return chalk.red('✗ error');
    } else if (module.missing) {
      return chalk.yellow('✗ missing');
    } else if (module.cached) {
      return chalk.green('✓ cached');
    } else {
      return chalk.gray('○ not cached');
    }
  }

  private static formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}b`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}kb`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
    }
  }
}

export function formatModuleReference(ref: string): { username: string; moduleName: string; version?: string } {
  // Handle different formats:
  // @username/module
  // @username/module@version
  // username/module
  // username/module@version
  
  const cleanRef = ref.startsWith('@') ? ref.slice(1) : ref;
  
  const [fullName, version] = cleanRef.split('@');
  const [username, moduleName] = fullName.split('/');
  
  if (!username || !moduleName) {
    throw new Error(`Invalid module reference: ${ref}. Expected format: @username/module or username/module`);
  }
  
  return { username, moduleName, version };
}

export function formatInstallTarget(ref: string): string {
  const { username, moduleName, version } = formatModuleReference(ref);
  return version ? `@${username}/${moduleName}@${version}` : `@${username}/${moduleName}`;
}