import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { OutputPathService } from '@services/fs/OutputPathService';
import { interpret } from '@interpreter/index';
import { logger, cliLogger } from '@core/utils/logger';
import { ConfigLoader } from '@core/config/loader';
import type { ResolvedURLConfig } from '@core/config/types';
import type { CLIOptions } from '../index';
import type { UserInteraction } from '../interaction/UserInteraction';
import type { OptionProcessor } from '../parsers/OptionProcessor';
import { PathContextBuilder, type PathContext } from '@core/services/PathContextService';
import { URLLoader } from '../utils/url-loader';

export interface ProcessingEnvironment {
  fileSystem: NodeFileSystem;
  pathService: PathService;
  configLoader: ConfigLoader;
  urlConfig?: ResolvedURLConfig;
}

export class FileProcessor {
  constructor(
    private userInteraction: UserInteraction,
    private optionProcessor: OptionProcessor
  ) {}

  async processFile(options: CLIOptions): Promise<void> {
    // Convert CLI options to API options
    const apiOptions = this.optionProcessor.cliToApiOptions(options);
    
    if (options.debugContext) {
      // TODO: debugContextCommand is not imported
      console.error('Debug context command not yet implemented');
      return;
    }

    if (options.debugResolution) {
      // TODO: debugResolutionCommand is not imported
      console.error('Debug resolution command not yet implemented');
      return;
    }

    if (options.debugTransform) {
      // TODO: debugTransformCommand is not imported  
      console.error('Debug transform command not yet implemented');
      return;
    }

    await this.processFileWithOptions(options, apiOptions);
  }

  async processFileWithOptions(cliOptions: CLIOptions, apiOptions: any): Promise<void> {
    // Check if input is a URL
    const isURL = URLLoader.isURL(cliOptions.input);
    
    // For URLs, we need special handling
    let environment: ProcessingEnvironment;
    if (isURL) {
      // For URLs, use current directory for config
      environment = await this.setupEnvironmentForURL();
    } else {
      // For files, check existence first
      if (!existsSync(cliOptions.input)) {
        throw new Error(`Input file does not exist: ${cliOptions.input}`);
      }
      environment = await this.setupEnvironment(cliOptions);
    }
    
    let interpretEnvironment: any = null; // Define outside try block for cleanup access
    
    try {
      // Read stdin if available
      const stdinContent = await this.readStdinIfAvailable();

      // Execute interpretation
      const { result, hasExplicitOutput, interpretEnvironment: env } = await this.executeInterpretation(cliOptions, apiOptions, environment, stdinContent, isURL);
      interpretEnvironment = env;

      // Handle output
      await this.handleOutput(result, cliOptions, environment, hasExplicitOutput);
      
      // Clean up environment to prevent event loop from staying alive
      if (interpretEnvironment && 'cleanup' in interpretEnvironment) {
        cliLogger.debug('Calling environment cleanup');
        (interpretEnvironment as any).cleanup();
      }
      
      // For stdout mode, ensure clean exit after output
      if (cliOptions.stdout) {
        // Give a small delay to ensure all output is flushed
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Give a small delay for cleanup to complete, then force exit
      cliLogger.debug('Cleanup complete, forcing process exit');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Force exit to prevent hanging on active event loop handles
      process.exit(0);
    } catch (error: any) {
      // Clean up environment even on error
      if (interpretEnvironment && 'cleanup' in interpretEnvironment) {
        cliLogger.debug('Calling environment cleanup (error path)');
        (interpretEnvironment as any).cleanup();
      }
      
      // Let error propagate to ErrorHandler instead of exiting early
      throw error;
    }
  }

  async setupEnvironment(options: CLIOptions): Promise<ProcessingEnvironment> {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService(fileSystem);
    
    // Load configuration
    const configLoader = new ConfigLoader(path.dirname(options.input));
    const config = configLoader.load();
    const urlConfig = configLoader.resolveURLConfig(config);

    return {
      fileSystem,
      pathService,
      configLoader,
      urlConfig
    };
  }

  async setupEnvironmentForURL(): Promise<ProcessingEnvironment> {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService(fileSystem);
    
    // For URLs, use current working directory for config
    const configLoader = new ConfigLoader(process.cwd());
    const config = configLoader.load();
    const urlConfig = configLoader.resolveURLConfig(config);

    return {
      fileSystem,
      pathService,
      configLoader,
      urlConfig
    };
  }

  private async executeInterpretation(
    cliOptions: CLIOptions, 
    apiOptions: any, 
    environment: ProcessingEnvironment,
    stdinContent?: string,
    isURL?: boolean
  ): Promise<{ result: string; hasExplicitOutput: boolean; interpretEnvironment?: any }> {
    // Get content either from URL or file
    let content: string;
    let effectivePath: string;
    
    if (isURL) {
      cliLogger.debug(`Loading content from URL: ${cliOptions.input}`);
      const urlResult = await URLLoader.load(cliOptions.input, {
        timeout: cliOptions.urlTimeout,
        maxSize: cliOptions.urlMaxSize
      });
      content = urlResult.content;
      // Use the URL as the effective path for error reporting
      effectivePath = urlResult.finalUrl;
    } else {
      // Read the input file
      content = await fs.readFile(cliOptions.input, 'utf8');
      effectivePath = path.resolve(cliOptions.input);
    }
    
    // Merge CLI URL config with loaded config
    const finalUrlConfig = this.mergeUrlConfig(cliOptions, environment.urlConfig);
    
    // Get output config
    const outputConfig = environment.configLoader.resolveOutputConfig(environment.configLoader.load());
    
    // Build PathContext - for URLs use current directory
    let pathContext: PathContext;
    if (isURL) {
      // For URLs, create a PathContext for the current directory
      pathContext = await PathContextBuilder.fromFile(
        path.join(process.cwd(), 'virtual.mld'), // Virtual file in current directory
        environment.fileSystem
      );
    } else {
      pathContext = await PathContextBuilder.fromFile(
        cliOptions.input,
        environment.fileSystem
      );
    }
    
    // Call the interpreter with PathContext
    const interpretResult = await interpret(content, {
      pathContext,
      filePath: effectivePath, // Use effective path for error reporting
      format: this.normalizeFormat(cliOptions.format),
      fileSystem: environment.fileSystem,
      pathService: environment.pathService,
      strict: cliOptions.strict,
      urlConfig: finalUrlConfig,
      stdinContent: stdinContent,
      outputOptions: {
        showProgress: cliOptions.showProgress !== undefined ? cliOptions.showProgress : outputConfig.showProgress,
        maxOutputLines: cliOptions.maxOutputLines !== undefined ? cliOptions.maxOutputLines : outputConfig.maxOutputLines,
        errorBehavior: cliOptions.errorBehavior || outputConfig.errorBehavior,
        collectErrors: cliOptions.collectErrors !== undefined ? cliOptions.collectErrors : outputConfig.collectErrors,
        showCommandContext: cliOptions.showCommandContext !== undefined ? cliOptions.showCommandContext : outputConfig.showCommandContext,
        timeout: cliOptions.commandTimeout
      },
      returnEnvironment: true,
      approveAllImports: cliOptions.riskyApproveAll || cliOptions.yolo || cliOptions.y,
      normalizeBlankLines: !cliOptions.noNormalizeBlankLines,
      devMode: cliOptions.devMode,
      enableTrace: true,
      useMarkdownFormatter: !cliOptions.noFormat,
      captureErrors: cliOptions.captureErrors,
      ephemeral: cliOptions.ephemeral
    });
    
    // Extract result and environment
    const result = typeof interpretResult === 'string' ? interpretResult : interpretResult.output;
    const resultEnvironment = typeof interpretResult === 'string' ? null : interpretResult.environment;
    
    // Check if @output was used in the document
    const hasExplicitOutput = resultEnvironment && (resultEnvironment as any).hasExplicitOutput;
    
    return { result, hasExplicitOutput, interpretEnvironment: resultEnvironment };
  }

  private async handleOutput(
    result: string, 
    options: CLIOptions, 
    environment: ProcessingEnvironment,
    hasExplicitOutput: boolean
  ): Promise<void> {
    const stdout = options.stdout || (!options.output);
    
    // Determine output path
    let outputPath = options.output;
    if (!stdout && !outputPath) {
      const outputPathService = new OutputPathService();
      outputPath = await outputPathService.getSafeOutputPath(options.input, this.normalizeFormat(options.format), options.output);
    }

    // Check for input/output file conflict
    if (outputPath && outputPath === options.input) {
      throw new Error('Input and output files cannot be the same.');
    }

    // Output handling - skip default output if @output was used (unless explicitly requested)
    if (stdout) {
      console.log(result);
    } else if (outputPath && (!hasExplicitOutput || options.output)) {
      const { outputPath: finalPath, shouldOverwrite } = await this.userInteraction.confirmOverwrite(outputPath);
      if (shouldOverwrite) {
        // Use Node's fs directly
        const dirPath = path.dirname(finalPath);
        
        // Create directory if it doesn't exist
        if (!existsSync(dirPath)) {
          await fs.mkdir(dirPath, { recursive: true });
        }
        
        // Write the file
        await fs.writeFile(finalPath, result, 'utf8');
        
        if (!options.stdout) {
          console.log(`Output written to: ${finalPath}`);
        }
      }
    }
  }

  private normalizeFormat(format?: string): 'markdown' | 'xml' {
    if (!format) return 'markdown';
    
    const normalized = format.toLowerCase();
    if (normalized === 'md' || normalized === 'markdown') {
      return 'markdown';
    }
    if (normalized === 'xml') {
      return 'xml';
    }
    return 'markdown';
  }

  private mergeUrlConfig(cliOptions: CLIOptions, loadedUrlConfig?: ResolvedURLConfig): ResolvedURLConfig | undefined {
    let finalUrlConfig: ResolvedURLConfig | undefined = loadedUrlConfig;
    
    if (cliOptions.allowUrls) {
      // CLI explicitly enables URLs, override config
      finalUrlConfig = {
        enabled: true,
        allowedDomains: cliOptions.urlAllowedDomains || loadedUrlConfig?.allowedDomains || [],
        blockedDomains: cliOptions.urlBlockedDomains || loadedUrlConfig?.blockedDomains || [],
        allowedProtocols: loadedUrlConfig?.allowedProtocols || ['https', 'http'],
        timeout: cliOptions.urlTimeout || loadedUrlConfig?.timeout || 30000,
        maxSize: cliOptions.urlMaxSize || loadedUrlConfig?.maxSize || 5 * 1024 * 1024,
        warnOnInsecureProtocol: loadedUrlConfig?.warnOnInsecureProtocol ?? true,
        cache: loadedUrlConfig?.cache || {
          enabled: true,
          defaultTTL: 5 * 60 * 1000,
          rules: []
        }
      };
    } else if (loadedUrlConfig?.enabled && cliOptions.allowUrls !== false) {
      // Config enables URLs and CLI doesn't explicitly disable
      finalUrlConfig = loadedUrlConfig;
    } else {
      // URLs disabled
      finalUrlConfig = undefined;
    }

    return finalUrlConfig;
  }

  async readStdinIfAvailable(): Promise<string | undefined> {
    if (process.stdin.isTTY) {
      return undefined;
    }

    return new Promise((resolve) => {
      let data = '';
      
      const timeout = setTimeout(() => {
        resolve(undefined);
      }, 100);

      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        clearTimeout(timeout);
        data += chunk;
      });

      process.stdin.on('end', () => {
        clearTimeout(timeout);
        resolve(data || undefined);
      });

      process.stdin.on('error', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    });
  }

  loadConfiguration(inputPath: string): any {
    // Load and return configuration for the given input path
    const configLoader = new ConfigLoader(path.dirname(inputPath));
    return configLoader.load();
  }

  validateInputFile(inputPath: string): void {
    if (!existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }
  }
}