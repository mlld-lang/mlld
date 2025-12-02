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
import type { Environment } from '@interpreter/env/Environment';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import type { StreamExecution, SDKEvent } from '@sdk/types';
import type { CLIOptions } from '../index';
import type { UserInteraction } from '../interaction/UserInteraction';
import type { OptionProcessor } from '../parsers/OptionProcessor';
import { PathContextBuilder, type PathContext } from '@core/services/PathContextService';
import { URLLoader } from '../utils/url-loader';
import { parseInjectOptions } from '../utils/inject-parser';

export interface ProcessingEnvironment {
  fileSystem: NodeFileSystem;
  pathService: PathService;
  configLoader: ConfigLoader;
  urlConfig?: ResolvedURLConfig;
  pathContext?: PathContext;
}

export type InterpretModeConfig = {
  mode: 'document' | 'stream' | 'debug' | 'structured';
  streaming?: { enabled: boolean };
  jsonOutput: boolean;
  emitter?: ExecutionEmitter;
};

export function resolveInterpretMode(cliOptions: CLIOptions): InterpretModeConfig {
  const jsonOutput = Boolean(cliOptions.json || cliOptions.showJson);
  const debugFlag = Boolean(cliOptions.debug);
  const structuredFlag = Boolean(cliOptions.structured);

  // Structured mode takes precedence (outputs JSON with effects, exports, etc.)
  if (structuredFlag) {
    return {
      mode: 'structured',
      streaming: { enabled: false },
      jsonOutput: true,
      emitter: new ExecutionEmitter()
    };
  }

  if (debugFlag && jsonOutput) {
    return {
      mode: 'debug',
      streaming: { enabled: false },
      jsonOutput,
      emitter: new ExecutionEmitter()
    };
  }

  if (debugFlag) {
    return {
      mode: 'stream',
      streaming: { enabled: true },
      jsonOutput: false,
      emitter: new ExecutionEmitter()
    };
  }

  if (cliOptions.noStream) {
    return {
      mode: 'document',
      streaming: { enabled: false },
      jsonOutput: false
    };
  }

  return { mode: 'document', jsonOutput: false };
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
    
    let interpretEnvironment: Environment | null = null; // Define outside try block for cleanup access
    let detachLogging: (() => void) | undefined;
    
    try {
      // Read stdin if available
      const stdinContent = await this.readStdinIfAvailable();

      const interpretation = await this.executeInterpretation(cliOptions, apiOptions, environment, stdinContent, isURL);
      interpretEnvironment = interpretation.interpretEnvironment ?? null;
      detachLogging = interpretation.detachLogging;

      if (interpretation.kind === 'stream') {
        await interpretation.handle.done();
        interpretation.detachLogging?.();
        if (interpretation.interpretEnvironment && 'cleanup' in interpretation.interpretEnvironment) {
          (interpretation.interpretEnvironment as any).cleanup();
        }
        process.exit(0);
        return;
      }

      if (interpretation.kind === 'debug') {
        const serialized = this.serializeDebugResult(interpretation.debugResult);
        console.log(serialized);
        interpretation.detachLogging?.();
        if (interpretation.interpretEnvironment && 'cleanup' in interpretation.interpretEnvironment) {
          (interpretation.interpretEnvironment as any).cleanup();
        }
        process.exit(0);
        return;
      }

      if (interpretation.kind === 'structured') {
        const serialized = this.serializeStructuredResult(interpretation.structuredResult);
        console.log(serialized);
        interpretation.detachLogging?.();
        if (interpretation.interpretEnvironment && 'cleanup' in interpretation.interpretEnvironment) {
          (interpretation.interpretEnvironment as any).cleanup();
        }
        process.exit(0);
        return;
      }

      await this.handleOutput(
        interpretation.result,
        cliOptions,
        environment,
        interpretation.hasExplicitOutput,
        interpretation.interpretEnvironment
      );

      interpretation.detachLogging?.();
      if (interpretation.interpretEnvironment && 'cleanup' in interpretation.interpretEnvironment) {
        cliLogger.debug('Calling environment cleanup');
        (interpretation.interpretEnvironment as any).cleanup();
      }

      if (cliOptions.stdout) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      cliLogger.debug('Cleanup complete, forcing process exit');
      await new Promise(resolve => setTimeout(resolve, 10));
      process.exit(0);
      return;
    } catch (error: any) {
      // Clean up environment even on error
      if (interpretEnvironment && 'cleanup' in interpretEnvironment) {
        cliLogger.debug('Calling environment cleanup (error path)');
        (interpretEnvironment as any).cleanup();
      }
      
      detachLogging?.();

      throw error;
    }
  }

  async setupEnvironment(options: CLIOptions): Promise<ProcessingEnvironment> {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService(fileSystem);
    
    // Build PathContext for the input file
    const pathContext = await PathContextBuilder.fromFile(
      path.resolve(options.input),
      fileSystem,
      { invocationDirectory: process.cwd() }
    );
    
    // Load configuration using PathContext
    const configLoader = new ConfigLoader(pathContext);
    const config = configLoader.load();
    const urlConfig = configLoader.resolveURLConfig(config);

    return {
      fileSystem,
      pathService,
      configLoader,
      urlConfig,
      pathContext
    };
  }

  async setupEnvironmentForURL(): Promise<ProcessingEnvironment> {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService(fileSystem);
    
    // For URLs, create default PathContext
    const pathContext = PathContextBuilder.fromDefaults({
      invocationDirectory: process.cwd()
    });
    
    // Use PathContext for config
    const configLoader = new ConfigLoader(pathContext);
    const config = configLoader.load();
    const urlConfig = configLoader.resolveURLConfig(config);

    return {
      fileSystem,
      pathService,
      configLoader,
      urlConfig,
      pathContext
    };
  }

  private async executeInterpretation(
    cliOptions: CLIOptions,
    apiOptions: any,
    environment: ProcessingEnvironment,
    stdinContent?: string,
    isURL?: boolean
  ): Promise<
    | { kind: 'document'; result: string; hasExplicitOutput: boolean; interpretEnvironment?: Environment | null; detachLogging?: () => void }
    | { kind: 'stream'; handle: StreamExecution; interpretEnvironment?: Environment | null; detachLogging?: () => void }
    | { kind: 'debug'; debugResult: any; interpretEnvironment?: Environment | null; detachLogging?: () => void }
    | { kind: 'structured'; structuredResult: any; interpretEnvironment?: Environment | null; detachLogging?: () => void }
  > {
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
    
    // Use PathContext from environment or build one if not available
    const pathContext = environment.pathContext || await PathContextBuilder.fromFile(
      effectivePath,
      environment.fileSystem,
      { invocationDirectory: process.cwd() }
    );
    
    // Call the interpreter with PathContext
    let resultEnvironment: Environment | null = null;
    const modeConfig = resolveInterpretMode(cliOptions);
    const detachLogging = modeConfig.emitter ? attachEmitterLogging(modeConfig.emitter) : undefined;

    // Parse dynamic modules from --inject flags
    const dynamicModules = cliOptions.inject
      ? await parseInjectOptions(cliOptions.inject, environment.fileSystem, path.dirname(effectivePath))
      : undefined;

    const interpretResult = await interpret(content, {
      pathContext,
      filePath: effectivePath, // Use effective path for error reporting
      format: this.normalizeFormat(cliOptions.format),
      fileSystem: environment.fileSystem,
      pathService: environment.pathService,
      strict: cliOptions.strict,
      urlConfig: finalUrlConfig,
      stdinContent: stdinContent,
      dynamicModules,
      outputOptions: {
        showProgress: cliOptions.showProgress !== undefined ? cliOptions.showProgress : outputConfig.showProgress,
        maxOutputLines: cliOptions.maxOutputLines !== undefined ? cliOptions.maxOutputLines : outputConfig.maxOutputLines,
        errorBehavior: cliOptions.errorBehavior || outputConfig.errorBehavior,
        collectErrors: cliOptions.collectErrors !== undefined ? cliOptions.collectErrors : outputConfig.collectErrors,
        showCommandContext: cliOptions.showCommandContext !== undefined ? cliOptions.showCommandContext : outputConfig.showCommandContext,
        timeout: cliOptions.commandTimeout
      },
      approveAllImports: cliOptions.riskyApproveAll || cliOptions.yolo || cliOptions.y,
      normalizeBlankLines: !cliOptions.noNormalizeBlankLines,
      enableTrace: true,
      useMarkdownFormatter: !cliOptions.noFormat,
      captureErrors: cliOptions.captureErrors,
      ephemeral: cliOptions.ephemeral,
      allowAbsolutePaths: cliOptions.allowAbsolute,
      captureEnvironment: env => {
        resultEnvironment = env;
      },
      mode: modeConfig.mode,
      streaming: modeConfig.streaming ?? (cliOptions.noStream !== undefined ? { enabled: !cliOptions.noStream } : undefined),
      emitter: modeConfig.emitter
    });
    
    if (modeConfig.mode === 'stream') {
      return {
        kind: 'stream',
        handle: interpretResult as StreamExecution,
        interpretEnvironment: resultEnvironment,
        detachLogging
      };
    }

    if (modeConfig.mode === 'debug') {
      return {
        kind: 'debug',
        debugResult: interpretResult,
        interpretEnvironment: resultEnvironment,
        detachLogging
      };
    }

    if (modeConfig.mode === 'structured') {
      return {
        kind: 'structured',
        structuredResult: interpretResult,
        interpretEnvironment: resultEnvironment,
        detachLogging
      };
    }

    const result = typeof interpretResult === 'string' ? interpretResult : (interpretResult as any).output;
    const hasExplicitOutput = resultEnvironment && (resultEnvironment as any).hasExplicitOutput;

    return {
      kind: 'document',
      result,
      hasExplicitOutput,
      interpretEnvironment: resultEnvironment,
      detachLogging
    };
  }

  private async handleOutput(
    result: string, 
    options: CLIOptions, 
    environment: ProcessingEnvironment,
    hasExplicitOutput: boolean,
    interpretEnvironment?: Environment | null
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

    // Check if streaming was enabled - if so, skip final output since it was already streamed
    const effectHandler = interpretEnvironment?.getEffectHandler?.();
    const isStreaming = effectHandler?.isStreamingEnabled?.() ?? false;
    
    // Output handling - skip if streaming already output everything
    if (stdout && !isStreaming) {
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

  private serializeDebugResult(result: any): string {
    const { environment, ...rest } = result ?? {};
    return JSON.stringify(
      rest,
      (_key, value) => {
        if (typeof value === 'function') {
          return undefined;
        }
        if (value instanceof Map) {
          return Object.fromEntries(value);
        }
        return value;
      },
      2
    );
  }

  private serializeStructuredResult(result: any): string {
    const { environment, ...rest } = result ?? {};

    // Build a clean structured output with effects and security metadata
    const structured = {
      output: rest.output,
      effects: (rest.effects ?? []).map((effect: any) => ({
        type: effect.type,
        content: effect.content?.slice?.(0, 200), // Truncate for readability
        path: effect.path,
        security: effect.security ? {
          labels: effect.security.labels,
          taint: effect.security.taint,
          sources: effect.security.sources
        } : undefined
      })),
      exports: Object.keys(rest.exports ?? {}),
      stateWrites: rest.stateWrites ?? []
    };

    return JSON.stringify(structured, null, 2);
  }
}

function attachEmitterLogging(emitter: ExecutionEmitter): () => void {
  const listeners: Array<[SDKEvent['type'], (event: SDKEvent) => void]> = [];
  const log = (message: string) => {
    console.error(message);
  };

  const register = (type: SDKEvent['type'], handler: (event: SDKEvent) => void) => {
    listeners.push([type, handler]);
    emitter.on(type, handler);
  };

  register('command:start', event => {
    log(
      `[command:start] stage=${(event as any).stageIndex ?? ''} parallel=${(event as any).parallelIndex ?? ''} pipeline=${(event as any).pipelineId ?? ''}`
    );
  });
  register('command:complete', event => {
    log(
      `[command:complete] stage=${(event as any).stageIndex ?? ''} parallel=${(event as any).parallelIndex ?? ''} pipeline=${(event as any).pipelineId ?? ''} duration=${(event as any).durationMs ?? ''}`
    );
  });
  register('effect', event => {
    const e = (event as any).effect;
    const security = e?.security;
    const taint = security?.taint?.length ? ` taint=[${security.taint.join(',')}]` : '';
    const labels = security?.labels?.length ? ` labels=[${security.labels.join(',')}]` : '';
    log(`[effect] ${e?.type}${taint}${labels}`);
  });
  register('execution:complete', () => {
    log('[execution:complete]');
  });

  return () => {
    for (const [type, handler] of listeners) {
      emitter.off(type, handler);
    }
  };
}
