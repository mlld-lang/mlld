import { 
  Resolver, 
  ResolverContent, 
  ResolverCapabilities,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError, ResolverErrorCode } from '@core/errors';
import * as os from 'os';
import * as path from 'path';

/**
 * Built-in resolver for debug/environment information
 */
export class DebugResolver implements Resolver {
  name = 'debug';
  description = 'Provides environment and debug information';
  type = 'input' as const;
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['data', 'text'],
    defaultContentType: 'data',  // Returns object by default
    priority: 1,
    cache: { strategy: 'none' } // debug info should be fresh
  };

  constructor() {
    // No caching - debug info should always be current
  }

  canResolve(ref: string): boolean {
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'debug' || cleanRef.startsWith('debug/');
  }

  async resolve(ref: string, config?: any): Promise<ResolverContent> {
    // Variable context - return debug object as data
    if (!config?.context || config.context === 'variable') {
      const info = await this.collectDebugInfo();
      const metadata = {
        source: 'debug',
        timestamp: new Date()
      };
      return {
        content: JSON.stringify(info),
        contentType: 'data',
        mx: metadata,
        metadata
      };
    }
    
    // Import context - return structured data based on requested imports
    if (config.context === 'import') {
      const info = await this.collectDebugInfo();
      const exports: Record<string, any> = {};
      const imports = config.requestedImports || ['json', 'reduced', 'markdown'];
      
      for (const importName of imports) {
        switch (importName) {
          case 'environment':
            exports.environment = info.environment;
            break;
          case 'system':
            exports.system = info.system;
            break;
          case 'process':
            exports.process = info.process;
            break;
          case 'mlld':
            exports.mlld = info.mlld;
            break;
          case 'full':
            exports.full = info;
            break;
          case 'json':
            exports.json = JSON.stringify(info, null, 2);
            break;
          case 'reduced':
            exports.reduced = JSON.stringify({
              environment: info.environment,
              version: info.mlld.version
            });
            break;
          case 'summary':
            exports.summary = this.formatSummary(info);
            break;
          case 'markdown':
            exports.markdown = this.formatMarkdown(info);
            break;
          default:
            // Try to find nested field
            const value = this.getNestedValue(info, importName);
            if (value !== undefined) {
              exports[importName] = value;
            }
        }
      }
      
      const metadata = {
        source: 'debug',
        timestamp: new Date()
      };
      return {
        content: JSON.stringify(exports),
        contentType: 'data',
        mx: metadata,
        metadata
      };
    }
    
    throw new ResolverError(
      'DEBUG resolver only supports variable and import contexts',
      ResolverErrorCode.UNSUPPORTED_CONTEXT,
      {
        resolverName: this.name,
        context: config?.context,
        operation: 'resolve'
      }
    );
  }

  /**
   * Generate debug information in requested format
   */
  private async generateDebugInfo(format: string): Promise<string> {
    const info = await this.collectDebugInfo();
    
    switch (format.toLowerCase()) {
      case 'summary':
        return this.formatSummary(info);
      
      case 'markdown':
        return this.formatMarkdown(info);
      
      case 'json':
        return JSON.stringify(info, null, 2);
      
      case 'full':
      default:
        return this.formatFull(info);
    }
  }

  /**
   * Collect all debug information
   */
  private async collectDebugInfo(): Promise<Record<string, any>> {
    const cwd = (process as any).cwd?.() || '/';
    const projectPath = await this.findProjectRoot(cwd);
    const time = this.getMockedTime() || new Date();

    const version = await this.getMlldVersion();
    
    const userInfo = this.safeCall(() => os.userInfo(), {
      username: 'unknown',
      uid: -1,
      gid: -1,
      shell: '',
      homedir: ''
    } as os.UserInfo<string>);

    const loadAvg = this.safeCall(() => os.loadavg(), [0, 0, 0] as [number, number, number]);
    const uptime = this.safeCall(() => os.uptime(), 0);
    const cpuCount = this.safeCall(() => os.cpus().length, 0);
    const totalMem = this.safeCall(() => os.totalmem(), 0);
    const freeMem = this.safeCall(() => os.freemem(), 0);

    return {
      timestamp: time.toISOString(),
      version, // Top-level for backward compatibility
      mlld: {
        version,
        configFile: await this.findConfigFile(projectPath || cwd)
      },
      project: {
        basePath: projectPath || cwd,
        configFile: await this.findConfigFile(projectPath || cwd)
      },
      environment: {
        cwd,
        projectPath,
        nodeVersion: (process as any).version || 'unknown',
        platform: (process as any).platform || 'unknown',
        arch: (process as any).arch || 'unknown',
        user: userInfo.username,
        hostname: this.safeCall(() => os.hostname(), 'unknown')
      },
      system: {
        cpus: cpuCount,
        memory: {
          total: totalMem,
          free: freeMem,
          used: Math.max(totalMem - freeMem, 0)
        },
        uptime,
        loadAvg
      },
      process: {
        pid: (process as any).pid || 0,
        ppid: (process as any).ppid || 0,
        argv: (process as any).argv || [],
        execPath: (process as any).execPath || '',
        memoryUsage: (process as any).memoryUsage?.() || {}
      },
      env: this.getFilteredEnv()
    };
  }

  private safeCall<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  /**
   * Format as summary (key info only)
   */
  private formatSummary(info: Record<string, any>): string {
    return [
      `MLLD Debug Summary`,
      `==================`,
      `Time: ${info.timestamp}`,
      `Version: ${info.mlld.version}`,
      `Platform: ${info.environment.platform} (${info.environment.arch})`,
      `Node: ${info.environment.nodeVersion}`,
      `CWD: ${info.environment.cwd}`,
      `Project: ${info.environment.projectPath || 'Not found'}`,
      `Memory: ${this.formatBytes(info.system.memory.used)} / ${this.formatBytes(info.system.memory.total)}`
    ].join('\n');
  }

  /**
   * Format as markdown
   */
  private formatMarkdown(info: Record<string, any>): string {
    return [
      `# MLLD Debug Information`,
      ``,
      `## Environment`,
      `- **Time**: ${info.timestamp}`,
      `- **MLLD Version**: ${info.mlld.version}`,
      `- **Platform**: ${info.environment.platform} (${info.environment.arch})`,
      `- **Node Version**: ${info.environment.nodeVersion}`,
      `- **Current Directory**: \`${info.environment.cwd}\``,
      `- **Project Root**: \`${info.environment.projectPath || 'Not found'}\``,
      ``,
      `## System`,
      `- **CPUs**: ${info.system.cpus}`,
      `- **Memory**: ${this.formatBytes(info.system.memory.used)} / ${this.formatBytes(info.system.memory.total)}`,
      `- **System Uptime**: ${this.formatDuration(info.system.uptime)}`,
      ``,
      `## Process`,
      `- **PID**: ${info.process.pid}`,
      `- **Memory Usage**:`,
      `  - Heap: ${this.formatBytes(info.process.memoryUsage.heapUsed)} / ${this.formatBytes(info.process.memoryUsage.heapTotal)}`,
      `  - RSS: ${this.formatBytes(info.process.memoryUsage.rss)}`,
      `  - External: ${this.formatBytes(info.process.memoryUsage.external)}`
    ].join('\n');
  }

  /**
   * Format as full text output
   */
  private formatFull(info: Record<string, any>): string {
    const sections: string[] = [];
    
    // Header
    sections.push([
      `MLLD Debug Information`,
      `======================`,
      `Generated: ${info.timestamp}`,
      ``
    ].join('\n'));

    // MLLD section
    sections.push([
      `MLLD:`,
      `  Version: ${info.mlld.version}`,
      `  Config: ${info.mlld.configFile || 'Not found'}`,
      ``
    ].join('\n'));

    // Environment section
    sections.push([
      `Environment:`,
      `  Current Directory: ${info.environment.cwd}`,
      `  Project Root: ${info.environment.projectPath || 'Not found'}`,
      `  Node Version: ${info.environment.nodeVersion}`,
      `  Platform: ${info.environment.platform} (${info.environment.arch})`,
      `  User: ${info.environment.user}`,
      `  Hostname: ${info.environment.hostname}`,
      ``
    ].join('\n'));

    // System section
    sections.push([
      `System:`,
      `  CPUs: ${info.system.cpus}`,
      `  Memory:`,
      `    Total: ${this.formatBytes(info.system.memory.total)}`,
      `    Free: ${this.formatBytes(info.system.memory.free)}`,
      `    Used: ${this.formatBytes(info.system.memory.used)}`,
      `  Uptime: ${this.formatDuration(info.system.uptime)}`,
      `  Load Average: ${info.system.loadAvg.map((n: number) => n.toFixed(2)).join(', ')}`,
      ``
    ].join('\n'));

    // Process section
    sections.push([
      `Process:`,
      `  PID: ${info.process.pid}`,
      `  Parent PID: ${info.process.ppid}`,
      `  Executable: ${info.process.execPath}`,
      `  Memory Usage:`,
      `    RSS: ${this.formatBytes(info.process.memoryUsage.rss)}`,
      `    Heap Total: ${this.formatBytes(info.process.memoryUsage.heapTotal)}`,
      `    Heap Used: ${this.formatBytes(info.process.memoryUsage.heapUsed)}`,
      `    External: ${this.formatBytes(info.process.memoryUsage.external)}`,
      ``
    ].join('\n'));

    // Environment variables (filtered)
    sections.push([
      `Environment Variables (filtered):`,
      ...Object.entries(info.env).map(([key, value]) => `  ${key}=${value}`),
      ``
    ].join('\n'));

    return sections.join('\n');
  }

  /**
   * Find project root by looking for package.json
   */
  private async findProjectRoot(startPath: string): Promise<string | null> {
    // For now, just return the start path as the project root
    // In a real implementation, this would look for package.json, .git, etc.
    return startPath;
  }

  /**
   * Find mlld config file
   */
  private async findConfigFile(projectPath: string): Promise<string | null> {
    const configFiles = ['mlld.config.json', '.mlldrc', '.mlldrc.json'];
    
    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile);
      // Would need to check if file exists
      // For now, return null
    }
    
    return null;
  }

  /**
   * Get mlld version
   */
  private async getMlldVersion(): Promise<string> {
    try {
      // Would need to read from package.json
      return '1.0.0';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get filtered environment variables
   */
  private getFilteredEnv(): Record<string, string> {
    const filtered: Record<string, string> = {};
    const includePatterns = [
      /^MLLD_/,
      /^NODE_/,
      /^npm_/,
      /^PATH$/,
      /^HOME$/,
      /^USER$/,
      /^SHELL$/,
      /^LANG$/,
      /^LC_/,
      /^TERM/
    ];
    
    for (const [key, value] of Object.entries(process.env)) {
      if (includePatterns.some(pattern => pattern.test(key))) {
        filtered[key] = value || '';
      }
    }
    
    return filtered;
  }

  /**
   * Format bytes as human-readable
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Format duration in seconds as human-readable
   */
  private formatDuration(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
  }

  /**
   * Get mocked time for testing
   */
  private getMockedTime(): Date | null {
    if (process.env.MLLD_MOCK_TIME) {
      if (/^\d+$/.test(process.env.MLLD_MOCK_TIME)) {
        return new Date(parseInt(process.env.MLLD_MOCK_TIME) * 1000);
      }
      return new Date(process.env.MLLD_MOCK_TIME);
    }
    return null;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
}
