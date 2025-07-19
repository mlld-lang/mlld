import type { CLIOptions } from '../index';

export interface ProcessedOptions {
  cliOptions: CLIOptions;
  apiOptions: any; // Will be ProcessOptions from the API
}

export class OptionProcessor {
  
  /**
   * Convert CLI options to API options format
   */
  cliToApiOptions(cliOptions: CLIOptions): any {
    return {
      format: cliOptions.format,
      strict: cliOptions.strict,
      homePath: cliOptions.homePath,
      debug: cliOptions.debug,
      verbose: cliOptions.verbose,
      custom: cliOptions.custom,
      // URL support options
      allowUrls: cliOptions.allowUrls,
      urlTimeout: cliOptions.urlTimeout,
      urlMaxSize: cliOptions.urlMaxSize,
      urlAllowedDomains: cliOptions.urlAllowedDomains,
      urlBlockedDomains: cliOptions.urlBlockedDomains,
      // Output management options
      maxOutputLines: cliOptions.maxOutputLines,
      showProgress: cliOptions.showProgress,
      errorBehavior: cliOptions.errorBehavior,
      collectErrors: cliOptions.collectErrors,
      progressStyle: cliOptions.progressStyle,
      showCommandContext: cliOptions.showCommandContext,
      commandTimeout: cliOptions.commandTimeout,
      // Import approval options
      riskyApproveAll: cliOptions.riskyApproveAll || cliOptions.yolo || cliOptions.y,
      // Blank line normalization
      noNormalizeBlankLines: cliOptions.noNormalizeBlankLines,
      // Development mode
      dev: cliOptions.devMode,
      // Disable prettier formatting
      noFormat: cliOptions.noFormat,
      // Error capture for pattern development
      captureErrors: cliOptions.captureErrors
    };
  }

  /**
   * Normalize and validate CLI option values
   */
  normalizeOptions(options: CLIOptions): CLIOptions {
    const normalized = { ...options };

    // Normalize format
    if (normalized.format) {
      normalized.format = this.normalizeFormat(normalized.format);
    }

    // Normalize timeout values
    if (normalized.urlTimeout !== undefined && normalized.urlTimeout < 0) {
      normalized.urlTimeout = 30000; // Default timeout
    }

    if (normalized.commandTimeout !== undefined && normalized.commandTimeout < 0) {
      normalized.commandTimeout = 30000; // Default timeout
    }

    // Normalize array options
    if (normalized.urlAllowedDomains) {
      normalized.urlAllowedDomains = normalized.urlAllowedDomains.filter(Boolean);
    }

    if (normalized.urlBlockedDomains) {
      normalized.urlBlockedDomains = normalized.urlBlockedDomains.filter(Boolean);
    }

    return normalized;
  }

  /**
   * Validate option interdependencies and constraints
   */
  validateOptionConstraints(options: CLIOptions): void {
    // Validate output constraints
    if (options.output && options.stdout) {
      throw new Error('Cannot specify both --output and --stdout');
    }

    // Validate debug context visualization requirements
    if (options.debugContext) {
      if (options.visualizationType === 'variable-propagation' || options.visualizationType === 'timeline') {
        if (!options.variableName) {
          throw new Error(`--variable-name is required for ${options.visualizationType} visualization`);
        }
      }
    }

    // Validate URL timeout constraints
    if (options.urlTimeout !== undefined) {
      if (options.urlTimeout < 1000 || options.urlTimeout > 300000) {
        throw new Error('--url-timeout must be between 1000ms and 300000ms (5 minutes)');
      }
    }

    // Validate URL size constraints
    if (options.urlMaxSize !== undefined) {
      if (options.urlMaxSize < 1024 || options.urlMaxSize > 52428800) {
        throw new Error('--url-max-size must be between 1KB and 50MB');
      }
    }

    // Validate command timeout constraints
    if (options.commandTimeout !== undefined) {
      if (options.commandTimeout < 100 || options.commandTimeout > 600000) {
        throw new Error('--command-timeout must be between 100ms and 10 minutes');
      }
    }

    // Validate max output lines
    if (options.maxOutputLines !== undefined) {
      if (options.maxOutputLines < 1 || options.maxOutputLines > 10000) {
        throw new Error('--max-output-lines must be between 1 and 10000');
      }
    }
  }

  /**
   * Normalize format string to supported output format
   */
  private normalizeFormat(format?: string): 'markdown' | 'xml' {
    if (!format) return 'markdown';
    
    switch (format.toLowerCase()) {
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'xml':
      case 'llm':
        return 'xml';
      default:
        console.warn(`Warning: Unknown format '${format}', defaulting to markdown`);
        return 'markdown';
    }
  }

  /**
   * Process and merge configuration with CLI options
   */
  mergeWithConfiguration(cliOptions: CLIOptions, configOptions: any): CLIOptions {
    // CLI options take precedence over configuration
    return {
      ...configOptions,
      ...cliOptions,
      // Special handling for array options
      urlAllowedDomains: cliOptions.urlAllowedDomains || configOptions.urlAllowedDomains,
      urlBlockedDomains: cliOptions.urlBlockedDomains || configOptions.urlBlockedDomains,
    };
  }

  /**
   * Check if option requires a value
   */
  requiresValue(option: string): boolean {
    const optionsWithValues = [
      '--output', '-o',
      '--format', '-f',
      '--home-path',
      '--directive',
      '--url-timeout',
      '--url-max-size',
      '--url-allowed-domains',
      '--url-blocked-domains',
      '--max-output-lines',
      '--error-behavior',
      '--command-timeout',
      '--viz-type',
      '--root-state-id',
      '--variable-name',
      '--output-format'
    ];
    
    return optionsWithValues.includes(option);
  }

  /**
   * Get the default value for an option
   */
  getDefaultValue(option: string): any {
    const defaults: Record<string, any> = {
      format: 'markdown',
      strict: false,
      urlTimeout: 30000,
      urlMaxSize: 5242880, // 5MB
      maxOutputLines: 50,
      showProgress: true,
      errorBehavior: 'continue',
      commandTimeout: 30000,
      includeVars: true,
      includeTimestamps: true,
      includeFilePaths: true
    };
    
    return defaults[option.replace(/^--/, '').replace(/-/g, '')];
  }
}