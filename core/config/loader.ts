import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { MlldConfig, ResolvedURLConfig, ResolvedOutputConfig } from './types';
import { parseDuration, parseSize } from './utils';

/**
 * Load Mlld configuration from both global and project locations
 */
export class ConfigLoader {
  private globalConfigPath: string;
  private projectConfigPath: string;
  private cachedConfig?: MlldConfig;

  constructor(projectPath?: string) {
    // Global config location: ~/.config/mlld.json
    this.globalConfigPath = path.join(os.homedir(), '.config', 'mlld.json');
    
    // Project config location: <project>/mlld.config.json
    this.projectConfigPath = projectPath 
      ? path.join(projectPath, 'mlld.config.json')
      : path.join(process.cwd(), 'mlld.config.json');
  }

  /**
   * Load and merge configurations
   */
  load(): MlldConfig {
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
  private loadConfigFile(filePath: string): MlldConfig {
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
  private mergeConfigs(global: MlldConfig, project: MlldConfig): MlldConfig {
    const merged: MlldConfig = {};

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

    // Merge output config
    if (global.output || project.output) {
      merged.output = this.mergeOutputConfig(
        global.output,
        project.output
      );
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

  private mergeOutputConfig(global?: any, project?: any): any {
    if (!global && !project) return undefined;
    
    const merged = { ...global };
    
    if (project) {
      // Simple properties override
      if (project.showProgress !== undefined) merged.showProgress = project.showProgress;
      if (project.maxOutputLines !== undefined) merged.maxOutputLines = project.maxOutputLines;
      if (project.errorBehavior !== undefined) merged.errorBehavior = project.errorBehavior;
      if (project.collectErrors !== undefined) merged.collectErrors = project.collectErrors;
      if (project.progressStyle !== undefined) merged.progressStyle = project.progressStyle;
      if (project.preserveFullOutput !== undefined) merged.preserveFullOutput = project.preserveFullOutput;
      if (project.logOutputToFile !== undefined) merged.logOutputToFile = project.logOutputToFile;
      if (project.showCommandContext !== undefined) merged.showCommandContext = project.showCommandContext;
      
      // Merge error formatting config
      if (project.errorFormatting) {
        merged.errorFormatting = {
          ...(global?.errorFormatting || {}),
          ...project.errorFormatting
        };
      }
    }
    
    return merged;
  }

  /**
   * Resolve configuration to runtime values
   */
  resolveURLConfig(config: MlldConfig): ResolvedURLConfig | undefined {
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

  /**
   * Resolve output configuration to runtime values
   */
  resolveOutputConfig(config: MlldConfig): ResolvedOutputConfig {
    const outputConfig = config.output;
    
    return {
      showProgress: outputConfig?.showProgress ?? true,
      maxOutputLines: outputConfig?.maxOutputLines ?? 50,
      errorBehavior: outputConfig?.errorBehavior ?? 'continue',
      collectErrors: outputConfig?.collectErrors ?? false,
      progressStyle: outputConfig?.progressStyle ?? 'emoji',
      preserveFullOutput: outputConfig?.preserveFullOutput ?? false,
      logOutputToFile: outputConfig?.logOutputToFile ?? false,
      showCommandContext: outputConfig?.showCommandContext ?? true,
      errorFormatting: {
        useColors: outputConfig?.errorFormatting?.useColors ?? true,
        useSourceContext: outputConfig?.errorFormatting?.useSourceContext ?? true,
        contextLines: outputConfig?.errorFormatting?.contextLines ?? 2,
        showCommandDetails: outputConfig?.errorFormatting?.showCommandDetails ?? true
      }
    };
  }
}