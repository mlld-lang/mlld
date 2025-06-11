import { 
  Resolver, 
  ResolverContent, 
  ResolverCapabilities,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError } from '@core/errors';
import * as os from 'os';
import * as path from 'path';

/**
 * Built-in resolver for debug/environment information
 */
export class DebugResolver implements Resolver {
  name = 'DEBUG';
  description = 'Provides environment and debug information';
  type = 'input' as const;
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    needs: { network: false, cache: false, auth: false },
    contexts: { import: true, path: false, output: false },
    resourceType: 'function',
    priority: 1,
    cache: { strategy: 'none' }, // DEBUG info should be fresh
    supportedFormats: ['full', 'summary', 'markdown', 'json']
  };

  constructor() {
    // No caching - debug info should always be current
  }

  canResolve(ref: string): boolean {
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'DEBUG' || cleanRef.startsWith('DEBUG/');
  }

  async resolve(ref: string): Promise<ResolverContent> {
    // Extract format from reference
    const cleanRef = ref.replace(/^@/, '');
    const parts = cleanRef.split('/');
    const format = parts.length > 1 ? parts[1] : 'full';

    // Generate debug info
    const debugInfo = await this.generateDebugInfo(format);

    return {
      content: debugInfo,
      metadata: {
        source: 'DEBUG',
        timestamp: new Date()
      }
    };
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
    const cwd = process.cwd();
    const projectPath = await this.findProjectRoot(cwd);
    const time = this.getMockedTime() || new Date();

    return {
      timestamp: time.toISOString(),
      mlld: {
        version: await this.getMlldVersion(),
        configFile: await this.findConfigFile(projectPath || cwd)
      },
      environment: {
        cwd,
        projectPath,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        user: os.userInfo().username,
        hostname: os.hostname()
      },
      system: {
        cpus: os.cpus().length,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        },
        uptime: os.uptime(),
        loadAvg: os.loadavg()
      },
      process: {
        pid: process.pid,
        ppid: process.ppid,
        argv: process.argv,
        execPath: process.execPath,
        memoryUsage: process.memoryUsage()
      },
      env: this.getFilteredEnv()
    };
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
      `  Load Average: ${info.system.loadAvg.map(n => n.toFixed(2)).join(', ')}`,
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
    let currentPath = startPath;
    
    while (currentPath !== path.dirname(currentPath)) {
      try {
        const packagePath = path.join(currentPath, 'package.json');
        // Check if package.json exists (would need file system access)
        // For now, just return the current working directory
        return currentPath;
      } catch {
        currentPath = path.dirname(currentPath);
      }
    }
    
    return null;
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
   * Get exportable data for imports
   */
  async getExportData(format?: string): Promise<Record<string, any>> {
    // For specific format imports
    if (format && this.capabilities.supportedFormats?.includes(format)) {
      const result = await this.resolve(`@DEBUG/${format}`);
      return { [format]: result.content };
    }

    // For import { * } from @DEBUG
    const info = await this.collectDebugInfo();
    return {
      timestamp: info.timestamp,
      version: info.mlld.version,
      platform: info.environment.platform,
      nodeVersion: info.environment.nodeVersion,
      cwd: info.environment.cwd,
      projectPath: info.environment.projectPath,
      memory: info.system.memory,
      pid: info.process.pid
    };
  }
}