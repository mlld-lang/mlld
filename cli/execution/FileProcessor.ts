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
import { parseDuration, formatDuration } from '@core/config/utils';
import chalk from 'chalk';

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
    // Check if input is a URL, stdin, or inline eval
    const isURL = URLLoader.isURL(cliOptions.input);
    const isStdinInput = cliOptions.input === '/dev/stdin' || cliOptions.input === '-';
    const isEvalInput = cliOptions.eval !== undefined;

    // Set up environment based on input type
    let environment: ProcessingEnvironment;
    if (isURL) {
      environment = await this.setupEnvironmentForURL();
    } else if (isStdinInput || isEvalInput) {
      environment = await this.setupEnvironmentForStdin();
    } else {
      if (!existsSync(cliOptions.input)) {
        throw new Error(`Input file does not exist: ${cliOptions.input}`);
      }
      environment = await this.setupEnvironment(cliOptions);
    }

    let interpretEnvironment: Environment | null = null;
    let detachLogging: (() => void) | undefined;

    // Parse --timeout if provided
    let timeoutMs: number | undefined;
    if (cliOptions.timeout) {
      try {
        timeoutMs = parseDuration(cliOptions.timeout);
        if (timeoutMs <= 0) {
          throw new Error('--timeout must be a positive duration');
        }
      } catch {
        throw new Error('--timeout must be a valid duration (e.g., 5m, 1h, 30s, or milliseconds)');
      }
    }

    try {
      // Read stdin if available, but NOT if input is /dev/stdin (or - alias) since
      // fs.readFile('/dev/stdin') will consume stdin directly
      const stdinContent = isStdinInput ? undefined : await this.readStdinIfAvailable();

      const startTime = cliOptions.metrics ? performance.now() : 0;

      // Execute with optional timeout
      let interpretPromise = this.executeInterpretation(
        cliOptions,
        apiOptions,
        environment,
        stdinContent,
        isURL,
        isStdinInput,
        isEvalInput
      );

      if (timeoutMs) {
        const timeout = timeoutMs;
        interpretPromise = Promise.race([
          interpretPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Execution timed out after ${formatDuration(timeout)}`)), timeout)
          )
        ]);
      }

      const interpretation = await interpretPromise;

      if (cliOptions.metrics) {
        const elapsed = performance.now() - startTime;
        console.error(chalk.gray(`\nTotal: ${elapsed.toFixed(1)}ms`));
      }

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

      const outputOptions = isEvalInput ? { ...cliOptions, stdout: true } : cliOptions;
      await this.handleOutput(
        interpretation.result,
        outputOptions,
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

      // Force exit after cleanup to ensure process terminates
      // Node.js VM contexts (used by NodeShadowEnvironment) can prevent natural exit
      // even after cleanup() clears timers/intervals. This ensures the CLI exits cleanly.
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

  async setupEnvironmentForStdin(): Promise<ProcessingEnvironment> {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService(fileSystem);

    // For stdin input, use cwd-based PathContext
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
    isURL?: boolean,
    isStdinInput?: boolean,
    isEvalInput?: boolean
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
    } else if (isEvalInput) {
      content = cliOptions.eval ?? '';
      effectivePath = path.resolve(process.cwd(), '<eval>.mld');
    } else {
      // Read the input file
      content = await fs.readFile(cliOptions.input, 'utf8');
      // For stdin input, use cwd as the effective path base for imports
      // Detect mode from content: if first directive uses / prefix, it's markdown mode
      if (isStdinInput) {
        const isMarkdownMode = this.detectMarkdownMode(content);
        effectivePath = path.resolve(process.cwd(), isMarkdownMode ? '<stdin>.mld.md' : '<stdin>.mld');
      } else {
        effectivePath = path.resolve(cliOptions.input);
      }
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
      mlldMode: cliOptions.mode,
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
      checkpoint: cliOptions.checkpoint,
      noCheckpoint: cliOptions.noCheckpoint,
      fresh: cliOptions.fresh,
      resume: cliOptions.resume,
      fork: cliOptions.fork,
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

  /**
   * Detect if content uses markdown mode (slash-prefixed directives in .md/.mld.md files).
   * Looks at the first non-empty, non-comment line to determine mode.
   */
  private detectMarkdownMode(content: string): boolean {
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) continue;

      // Skip YAML frontmatter start/end
      if (trimmed === '---') continue;

      // Skip markdown comments (HTML comments)
      if (trimmed.startsWith('<!--')) continue;

      // Skip mlld comments (>>)
      if (trimmed.startsWith('>>')) continue;

      // Check if line starts with / followed by a letter (markdown mode directive)
      if (/^\/[a-zA-Z]/.test(trimmed)) {
        return true;
      }

      // Check if line starts with a bare directive keyword (strict mode)
      // Common directives: var, show, run, exe, for, foreach, when, import, export, let, log, output, append
      if (/^(var|show|run|exe|for|foreach|when|import|export|let|log|output|append|guard|needs|parallel|while|break|continue|return)\b/.test(trimmed)) {
        return false;
      }

      // If it's plain text (not a directive), it's likely markdown mode
      // since strict mode would error on plain text
      if (/^[a-zA-Z#*\-\[]/.test(trimmed)) {
        return true;
      }

      // Default to strict mode for other patterns
      return false;
    }

    // Empty content or only comments - default to strict mode
    return false;
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
