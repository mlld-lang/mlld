import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { MeldConfig, ResolvedURLConfig } from './types';
import { parseDuration, parseSize } from './utils';

/**
 * Load Meld configuration from both global and project locations
 */
export class ConfigLoader {
  private globalConfigPath: string;
  private projectConfigPath: string;
  private cachedConfig?: MeldConfig;

  constructor(projectPath?: string) {
    // Global config location: ~/.config/meld.json
    this.globalConfigPath = path.join(os.homedir(), '.config', 'meld.json');
    
    // Project config location: <project>/meld.config.json
    this.projectConfigPath = projectPath 
      ? path.join(projectPath, 'meld.config.json')
      : path.join(process.cwd(), 'meld.config.json');
  }

  /**
   * Load and merge configurations
   */
  load(): MeldConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    // Load global config
    const globalConfig = this.loadConfigFile(this.globalConfigPath);
    
    // Load project config
    const projectConfig = this.loadConfigFile(this.projectConfigPath);
    
    // Merge configs (project overrides global)
    this.cachedConfig = this.mergeConfigs(globalConfig, projectConfig);
    
    return this.cachedConfig;
  }

  /**
   * Load a single config file
   */
  private loadConfigFile(filePath: string): MeldConfig {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Failed to load config from ${filePath}:`, error);
    }
    
    return {};
  }

  /**
   * Deep merge two config objects
   */
  private mergeConfigs(global: MeldConfig, project: MeldConfig): MeldConfig {
    const merged: MeldConfig = {};

    // Merge security config
    if (global.security || project.security) {
      merged.security = {
        urls: this.mergeURLSecurity(
          global.security?.urls,
          project.security?.urls
        )
      };
    }

    // Merge cache config
    if (global.cache || project.cache) {
      merged.cache = {
        urls: this.mergeURLCache(
          global.cache?.urls,
          project.cache?.urls
        )
      };
    }

    return merged;
  }

  private mergeURLSecurity(global?: any, project?: any): any {
    if (!global && !project) return undefined;
    
    const merged = { ...global };
    
    if (project) {
      // Simple properties override
      if (project.enabled !== undefined) merged.enabled = project.enabled;
      if (project.maxSize !== undefined) merged.maxSize = project.maxSize;
      if (project.timeout !== undefined) merged.timeout = project.timeout;
      if (project.warnOnInsecureProtocol !== undefined) {
        merged.warnOnInsecureProtocol = project.warnOnInsecureProtocol;
      }
      
      // Arrays merge (project adds to global)
      if (project.allowedDomains) {
        merged.allowedDomains = [
          ...(global?.allowedDomains || []),
          ...project.allowedDomains
        ];
      }
      
      if (project.blockedDomains) {
        merged.blockedDomains = [
          ...(global?.blockedDomains || []),
          ...project.blockedDomains
        ];
      }
      
      if (project.allowedProtocols) {
        merged.allowedProtocols = project.allowedProtocols;
      }
    }
    
    return merged;
  }

  private mergeURLCache(global?: any, project?: any): any {
    if (!global && !project) return undefined;
    
    const merged = { ...global };
    
    if (project) {
      if (project.enabled !== undefined) merged.enabled = project.enabled;
      if (project.defaultTTL !== undefined) merged.defaultTTL = project.defaultTTL;
      
      // Merge cache rules (project rules take precedence)
      if (project.rules) {
        const globalRules = global?.rules || [];
        const projectPatterns = new Set(project.rules.map((r: any) => r.pattern));
        
        // Keep global rules that don't conflict
        const filteredGlobal = globalRules.filter(
          (r: any) => !projectPatterns.has(r.pattern)
        );
        
        merged.rules = [...project.rules, ...filteredGlobal];
      }
    }
    
    return merged;
  }

  /**
   * Resolve configuration to runtime values
   */
  resolveURLConfig(config: MeldConfig): ResolvedURLConfig | undefined {
    const urlConfig = config.security?.urls;
    if (!urlConfig) return undefined;

    return {
      enabled: urlConfig.enabled || false,
      allowedDomains: urlConfig.allowedDomains || [],
      blockedDomains: urlConfig.blockedDomains || [],
      allowedProtocols: urlConfig.allowedProtocols || ['https', 'http'],
      maxSize: urlConfig.maxSize 
        ? parseSize(urlConfig.maxSize)
        : 5 * 1024 * 1024, // 5MB default
      timeout: urlConfig.timeout
        ? parseDuration(urlConfig.timeout)
        : 30000, // 30s default
      warnOnInsecureProtocol: urlConfig.warnOnInsecureProtocol ?? true,
      cache: {
        enabled: config.cache?.urls?.enabled ?? true,
        defaultTTL: config.cache?.urls?.defaultTTL
          ? parseDuration(config.cache.urls.defaultTTL)
          : 5 * 60 * 1000, // 5m default
        rules: this.resolveCacheRules(config.cache?.urls?.rules || [])
      }
    };
  }

  private resolveCacheRules(rules: Array<{ pattern: string; ttl: string }>) {
    return rules.map(rule => ({
      pattern: this.patternToRegex(rule.pattern),
      ttl: parseDuration(rule.ttl)
    }));
  }

  private patternToRegex(pattern: string): RegExp {
    // Convert URL pattern with wildcards to regex
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
      .replace(/\*/g, '.*'); // Convert * to .*
    
    return new RegExp(`^${escaped}$`);
  }
}