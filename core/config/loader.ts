import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { 
  MlldConfig, 
  ResolvedURLConfig, 
  ResolvedOutputConfig,
  DeepPartial,
  URLSecurityConfig,
  URLCacheConfig,
  OutputConfig,
  CacheRule
} from './types';
import { parseDuration, parseSize } from './utils';
import type { PathContext } from '@core/services/PathContextService';

// Type guard to check if a value is an object
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Type guard for MlldConfig
function isMlldConfig(value: unknown): value is MlldConfig {
  if (!isObject(value)) return false;
  
  // Check optional fields if present
  if (value.security !== undefined && !isObject(value.security)) return false;
  if (value.cache !== undefined && !isObject(value.cache)) return false;
  if (value.output !== undefined && !isObject(value.output)) return false;
  
  return true;
}

// Parse JSON with type validation
function parseConfig(content: string): MlldConfig {
  const parsed: unknown = JSON.parse(content);
  
  if (!isMlldConfig(parsed)) {
    throw new Error('Invalid configuration format');
  }
  
  return parsed;
}

/**
 * Load Mlld configuration from both global and project locations
 */
export class ConfigLoader {
  private globalConfigPath: string;
  private projectConfigPath: string;
  private cachedConfig?: MlldConfig;
  private pathContext?: PathContext;

  constructor(projectPathOrContext?: string | PathContext) {
    // Global config location: ~/.config/mlld/mlld.lock.json
    this.globalConfigPath = path.join(os.homedir(), '.config', 'mlld', 'mlld.lock.json');
    
    // Handle both legacy string path and new PathContext
    if (typeof projectPathOrContext === 'string') {
      // Legacy mode - projectPath provided
      this.projectConfigPath = path.join(projectPathOrContext, 'mlld.config.json');
    } else if (projectPathOrContext) {
      // New mode - PathContext provided
      this.pathContext = projectPathOrContext;
      this.projectConfigPath = path.join(projectPathOrContext.projectRoot, 'mlld.config.json');
    } else {
      // No path provided, use current directory
      this.projectConfigPath = path.join(process.cwd(), 'mlld.config.json');
    }
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
        return parseConfig(content);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.warn(`Failed to load config from ${filePath}:`, error.message);
      } else {
        console.warn(`Failed to load config from ${filePath}:`, String(error));
      }
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

  private mergeURLSecurity(
    global?: DeepPartial<URLSecurityConfig>, 
    project?: DeepPartial<URLSecurityConfig>
  ): URLSecurityConfig | undefined {
    if (!global && !project) return undefined;
    
    const merged: URLSecurityConfig = {
      enabled: project?.enabled ?? global?.enabled ?? false,
      // Handle various array fields
      allow: this.mergeArrays(global?.allow, project?.allow),
      allowedDomains: this.mergeArrays(global?.allowedDomains, project?.allowedDomains),
      blockedDomains: this.mergeArrays(global?.blockedDomains, project?.blockedDomains),
      allowedProtocols: project?.allowedProtocols ?? global?.allowedProtocols,
      // Handle optional properties
      ...(project?.maxSize !== undefined || global?.maxSize !== undefined 
        ? { maxSize: project?.maxSize ?? global?.maxSize } : {}),
      ...(project?.timeout !== undefined || global?.timeout !== undefined
        ? { timeout: project?.timeout ?? global?.timeout } : {}),
      ...(project?.warnOnInsecureProtocol !== undefined || global?.warnOnInsecureProtocol !== undefined
        ? { warnOnInsecureProtocol: project?.warnOnInsecureProtocol ?? global?.warnOnInsecureProtocol } : {}),
      ...(project?.requireReviewOnUpdate !== undefined || global?.requireReviewOnUpdate !== undefined
        ? { requireReviewOnUpdate: project?.requireReviewOnUpdate ?? global?.requireReviewOnUpdate } : {}),
      ...(project?.gists !== undefined || global?.gists !== undefined
        ? { gists: this.mergeGistSecurity(global?.gists, project?.gists) } : {})
    };
    
    return merged;
  }

  private mergeArrays<T>(global?: T[], project?: T[]): T[] | undefined {
    if (!global && !project) return undefined;
    return [...(global || []), ...(project || [])];
  }

  private mergeGistSecurity(
    global?: DeepPartial<URLSecurityConfig['gists']>,
    project?: DeepPartial<URLSecurityConfig['gists']>
  ): URLSecurityConfig['gists'] | undefined {
    if (!global && !project) return undefined;
    
    return {
      enabled: project?.enabled ?? global?.enabled ?? false,
      ...(this.mergeArrays(global?.allowedUsers, project?.allowedUsers) 
        ? { allowedUsers: this.mergeArrays(global?.allowedUsers, project?.allowedUsers) } : {}),
      ...(this.mergeArrays(global?.allowedGists, project?.allowedGists)
        ? { allowedGists: this.mergeArrays(global?.allowedGists, project?.allowedGists) } : {}),
      ...(project?.pinToVersion !== undefined || global?.pinToVersion !== undefined
        ? { pinToVersion: project?.pinToVersion ?? global?.pinToVersion } : {}),
      ...(project?.transformUrls !== undefined || global?.transformUrls !== undefined
        ? { transformUrls: project?.transformUrls ?? global?.transformUrls } : {})
    };
  }

  private mergeURLCache(
    global?: DeepPartial<URLCacheConfig>, 
    project?: DeepPartial<URLCacheConfig>
  ): URLCacheConfig | undefined {
    if (!global && !project) return undefined;
    
    const merged: URLCacheConfig = {
      enabled: project?.enabled ?? global?.enabled ?? false,
      ...(project?.defaultTTL !== undefined || global?.defaultTTL !== undefined
        ? { defaultTTL: project?.defaultTTL ?? global?.defaultTTL } : {}),
      ...(project?.rules !== undefined || global?.rules !== undefined
        ? { rules: this.mergeCacheRules(global?.rules, project?.rules) } : {}),
      ...(project?.immutable !== undefined || global?.immutable !== undefined
        ? { immutable: project?.immutable ?? global?.immutable } : {}),
      ...(project?.autoRefresh !== undefined || global?.autoRefresh !== undefined
        ? { autoRefresh: this.mergeAutoRefresh(global?.autoRefresh, project?.autoRefresh) } : {}),
      ...(project?.storageLocation !== undefined || global?.storageLocation !== undefined
        ? { storageLocation: project?.storageLocation ?? global?.storageLocation } : {})
    };
    
    return merged;
  }

  private mergeAutoRefresh(
    global?: DeepPartial<URLCacheConfig['autoRefresh']>,
    project?: DeepPartial<URLCacheConfig['autoRefresh']>
  ): URLCacheConfig['autoRefresh'] | undefined {
    if (!global && !project) return undefined;
    
    return {
      enabled: project?.enabled ?? global?.enabled ?? false,
      ...(project?.defaultTTL !== undefined || global?.defaultTTL !== undefined
        ? { defaultTTL: project?.defaultTTL ?? global?.defaultTTL } : {}),
      ...(project?.rules !== undefined || global?.rules !== undefined
        ? { rules: this.mergeCacheRules(global?.rules, project?.rules) } : {}),
      ...(project?.requireReview !== undefined || global?.requireReview !== undefined
        ? { requireReview: project?.requireReview ?? global?.requireReview } : {})
    };
  }

  private mergeCacheRules(
    global?: DeepPartial<CacheRule[]>,
    project?: DeepPartial<CacheRule[]>
  ): CacheRule[] | undefined {
    if (!global && !project) return undefined;
    
    const globalRules = (global || []) as CacheRule[];
    const projectRules = (project || []) as CacheRule[];
    
    if (projectRules.length === 0) return globalRules;
    
    const projectPatterns = new Set(projectRules.map(r => r.pattern));
    const filteredGlobal = globalRules.filter(r => !projectPatterns.has(r.pattern));
    
    return [...projectRules, ...filteredGlobal];
  }

  private mergeOutputConfig(
    global?: DeepPartial<OutputConfig>, 
    project?: DeepPartial<OutputConfig>
  ): OutputConfig | undefined {
    if (!global && !project) return undefined;
    
    const merged: OutputConfig = {
      ...(project?.showProgress !== undefined || global?.showProgress !== undefined
        ? { showProgress: project?.showProgress ?? global?.showProgress } : {}),
      ...(project?.maxOutputLines !== undefined || global?.maxOutputLines !== undefined
        ? { maxOutputLines: project?.maxOutputLines ?? global?.maxOutputLines } : {}),
      ...(project?.errorBehavior !== undefined || global?.errorBehavior !== undefined
        ? { errorBehavior: project?.errorBehavior ?? global?.errorBehavior } : {}),
      ...(project?.collectErrors !== undefined || global?.collectErrors !== undefined
        ? { collectErrors: project?.collectErrors ?? global?.collectErrors } : {}),
      ...(project?.progressStyle !== undefined || global?.progressStyle !== undefined
        ? { progressStyle: project?.progressStyle ?? global?.progressStyle } : {}),
      ...(project?.preserveFullOutput !== undefined || global?.preserveFullOutput !== undefined
        ? { preserveFullOutput: project?.preserveFullOutput ?? global?.preserveFullOutput } : {}),
      ...(project?.logOutputToFile !== undefined || global?.logOutputToFile !== undefined
        ? { logOutputToFile: project?.logOutputToFile ?? global?.logOutputToFile } : {}),
      ...(project?.showCommandContext !== undefined || global?.showCommandContext !== undefined
        ? { showCommandContext: project?.showCommandContext ?? global?.showCommandContext } : {}),
      ...(project?.errorFormatting !== undefined || global?.errorFormatting !== undefined
        ? { errorFormatting: this.mergeErrorFormatting(global?.errorFormatting, project?.errorFormatting) } : {})
    };
    
    return merged;
  }

  private mergeErrorFormatting(
    global?: DeepPartial<OutputConfig['errorFormatting']>,
    project?: DeepPartial<OutputConfig['errorFormatting']>
  ): OutputConfig['errorFormatting'] | undefined {
    if (!global && !project) return undefined;
    
    return {
      ...(project?.useColors !== undefined || global?.useColors !== undefined
        ? { useColors: project?.useColors ?? global?.useColors } : {}),
      ...(project?.useSourceContext !== undefined || global?.useSourceContext !== undefined
        ? { useSourceContext: project?.useSourceContext ?? global?.useSourceContext } : {}),
      ...(project?.contextLines !== undefined || global?.contextLines !== undefined
        ? { contextLines: project?.contextLines ?? global?.contextLines } : {}),
      ...(project?.showCommandDetails !== undefined || global?.showCommandDetails !== undefined
        ? { showCommandDetails: project?.showCommandDetails ?? global?.showCommandDetails } : {})
    };
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

  private resolveCacheRules(rules: CacheRule[]): Array<{ pattern: RegExp; ttl: number }> {
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
      showProgress: outputConfig?.showProgress ?? false,
      maxOutputLines: outputConfig?.maxOutputLines ?? 50,
      errorBehavior: outputConfig?.errorBehavior ?? 'continue',
      collectErrors: outputConfig?.collectErrors ?? true,
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