import * as path from 'path';
import * as fs from 'fs/promises';
import { watch } from 'fs/promises';
import { existsSync } from 'fs';
import { registryCommand } from './commands/registry';
import { createInstallCommand } from './commands/install';
import { createLsCommand } from './commands/ls';
import { createInfoCommand } from './commands/info';
import { createAuthCommand } from './commands/auth';
import { createPublishCommand } from './commands/publish';
import { createInitModuleCommand } from './commands/init-module';
import { createAddNeedsCommand } from './commands/add-needs';
import { createSetupCommand } from './commands/setup';
import { createAliasCommand } from './commands/alias';
import { envCommand } from './commands/env';
import { languageServerCommand } from './commands/language-server';
import { testCommand } from './commands/test';
import { createRunCommand } from './commands/run';
import { errorTestCommand } from './commands/error-test';
import chalk from 'chalk';
import { version } from '@core/version';
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { OutputPathService } from '@services/fs/OutputPathService';
import { interpret } from '@interpreter/index';
import { logger, cliLogger } from '@core/utils/logger';
import { ConfigLoader } from '@core/config/loader';
import type { ResolvedURLConfig } from '@core/config/types';
import type { MlldMode } from '@core/types/mode';
import type { Environment } from '@interpreter/env/Environment';
import { ErrorHandler } from './error/ErrorHandler';
import { PathContextBuilder } from '@core/services/PathContextService';
import { UserInteraction } from './interaction/UserInteraction';
import { OutputManager } from './interaction/OutputManager';
import { HelpSystem } from './interaction/HelpSystem';
import { ArgumentParser } from './parsers/ArgumentParser';
import { OptionProcessor } from './parsers/OptionProcessor';
import { CLIOrchestrator } from './CLIOrchestrator';

// CLI Options interface
export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'md' | 'xml';
  mode?: MlldMode;
  stdout?: boolean;
  verbose?: boolean;
  debug?: boolean;
  json?: boolean;
  strict?: boolean;
  homePath?: string;
  watch?: boolean;
  version?: boolean;
  help?: boolean;
  custom?: boolean; // Flag for custom filesystem in tests
  debugResolution?: boolean;
  variableName?: string;
  outputFormat?: 'json' | 'text' | 'mermaid';
  debugContext?: boolean;
  visualizationType?: 'hierarchy' | 'variable-propagation' | 'combined' | 'timeline';
  rootStateId?: string;
  includeVars?: boolean;
  includeTimestamps?: boolean;
  includeFilePaths?: boolean;
  debugTransform?: boolean;
  directiveType?: string;
  includeContent?: boolean;
  debugSourceMaps?: boolean; // Flag to display source mapping information
  detailedSourceMaps?: boolean; // Flag to display detailed source mapping information
  pretty?: boolean; // Flag to enable Prettier formatting
  // URL support options
  allowUrls?: boolean;
  urlTimeout?: number;
  urlMaxSize?: number;
  urlAllowedDomains?: string[];
  urlBlockedDomains?: string[];
  // No transform options - transformation is always enabled
  // Output management options
  maxOutputLines?: number;
  showProgress?: boolean;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  progressStyle?: 'emoji' | 'text';
  showCommandContext?: boolean;
  commandTimeout?: number;
  // Import approval options
  riskyApproveAll?: boolean;
  yolo?: boolean;
  y?: boolean;
  // Blank line normalization
  noNormalizeBlankLines?: boolean;
  // Disable prettier formatting
  noFormat?: boolean;
  // Error capture for pattern development
  captureErrors?: boolean;
  // Ephemeral mode for CI/serverless
  ephemeral?: boolean;
  // Environment file path
  env?: string;
  // Allow absolute paths outside project root
  allowAbsolute?: boolean;
  // Serve command options
  serveConfigPath?: string;
  serveEnvOverrides?: string;
  serveTools?: string;
  // Streaming options
  noStream?: boolean;
  showJson?: boolean;
  appendJson?: string;
  // Streaming visibility options
  showThinking?: boolean;
  showTools?: boolean;
  showMetadata?: boolean;
  showAllStreaming?: boolean;
  streamOutputFormat?: 'text' | 'ansi' | 'json';
  // Structured output mode
  structured?: boolean;
  // Dynamic module injection
  inject?: string[];  // ['@module=value', '@data=@file.json']
  _?: string[]; // Remaining args after command
}
const globalErrorHandler = new ErrorHandler();

async function handleError(error: unknown, options: CLIOptions): Promise<void> {
  await globalErrorHandler.handleError(error, options);
  process.exit(1);
}


/**
 * Normalize format string to supported output format
 */

/**
 * Parse command line arguments
 */

/**
 * Display help information
 */

/**
 * Prompt for file overwrite confirmation
 */

/**
 * Convert CLI options to API options
 */


/**
 * Read stdin content if available
 */
async function readStdinIfAvailable(): Promise<string | undefined> {
  // Check if stdin is a TTY (terminal) - if so, there's no piped input
  if (process.stdin.isTTY) {
    return undefined;
  }
  
  // Read from stdin
  const chunks: Buffer[] = [];
  
  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout;
    
    // Set a short timeout to check if data is available
    timeout = setTimeout(() => {
      // No data received within timeout, assume no stdin
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      if (typeof process.stdin.unref === 'function') {
        process.stdin.unref();
      }
      resolve(undefined);
    }, 100);
    
    process.stdin.on('data', (chunk) => {
      clearTimeout(timeout);
      chunks.push(chunk);
    });
    
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      const content = Buffer.concat(chunks).toString('utf8');
      if (typeof process.stdin.unref === 'function') {
        process.stdin.unref();
      }
      resolve(content);
    });
    
    // Start reading
    process.stdin.resume();
  });
}

/**
 * Process a file with specific API options
 */
async function processFileWithOptions(cliOptions: CLIOptions, apiOptions: ProcessOptions): Promise<void> {
  const { input, output, format, stdout, debug } = cliOptions;
  let outputPath = output;
  const normalizedFormat = normalizeFormat(format); // Use normalized format
  let environment: Environment | null = null; // Define outside try block for cleanup access


  if (!stdout && !outputPath) {
    const outputPathService = new OutputPathService();
    outputPath = await outputPathService.getSafeOutputPath(input, normalizedFormat, output);
  }

  if (outputPath && outputPath === input) {
    console.error('Error: Input and output files cannot be the same.');
    process.exit(1);
  }

  try {
    // Create services for the interpreter
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();

    if (debug) {
      console.log('CLI Options:', cliOptions);
      console.log('API Options:', apiOptions);
      console.log('Output Path:', outputPath);
    }

    // Build PathContext early
    const pathContext = await PathContextBuilder.fromFile(
      path.resolve(input),
      fileSystem,
      { invocationDirectory: process.cwd() }
    );
    
    // Read the input file using Node's fs directly
    const fs = await import('fs/promises');
    const content = await fs.readFile(input, 'utf8');
    
    // Read stdin if available
    const stdinContent = await readStdinIfAvailable();
    
    // Load configuration using PathContext
    const configLoader = new ConfigLoader(pathContext);
    const config = configLoader.load();
    const urlConfig = configLoader.resolveURLConfig(config);
    const outputConfig = configLoader.resolveOutputConfig(config);
    
    // CLI options override config
    let finalUrlConfig: ResolvedURLConfig | undefined = urlConfig;
    
    if (cliOptions.allowUrls) {
      // CLI explicitly enables URLs, override config
      finalUrlConfig = {
        enabled: true,
        allowedDomains: cliOptions.urlAllowedDomains || urlConfig?.allowedDomains || [],
        blockedDomains: cliOptions.urlBlockedDomains || urlConfig?.blockedDomains || [],
        allowedProtocols: urlConfig?.allowedProtocols || ['https', 'http'],
        timeout: cliOptions.urlTimeout || urlConfig?.timeout || 30000,
        maxSize: cliOptions.urlMaxSize || urlConfig?.maxSize || 5 * 1024 * 1024,
        warnOnInsecureProtocol: urlConfig?.warnOnInsecureProtocol ?? true,
        cache: urlConfig?.cache || {
          enabled: true,
          defaultTTL: 5 * 60 * 1000,
          rules: []
        }
      };
    } else if (urlConfig?.enabled && cliOptions.allowUrls !== false) {
      // Config enables URLs and CLI doesn't explicitly disable
      finalUrlConfig = urlConfig;
    } else {
      // URLs disabled
      finalUrlConfig = undefined;
    }

    const streamingOptions = cliOptions.noStream !== undefined ? { enabled: !cliOptions.noStream } : undefined;
    
    // Use the new interpreter
    const interpretResult = await interpret(content, {
      pathContext: pathContext,
      filePath: path.resolve(input), // Pass the current file path for error reporting
      format: normalizedFormat,
      mlldMode: cliOptions.mode,
      fileSystem: fileSystem,
      pathService: pathService,
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
      streaming: streamingOptions,
      approveAllImports: cliOptions.riskyApproveAll || cliOptions.yolo || cliOptions.y,
      normalizeBlankLines: !cliOptions.noNormalizeBlankLines,
      enableTrace: true, // Enable directive trace for better error debugging
      useMarkdownFormatter: !cliOptions.noFormat,
      captureErrors: cliOptions.captureErrors,
      captureEnvironment: env => {
        environment = env;
      }
    });

    // Extract result and environment
    const result = typeof interpretResult === 'string' ? interpretResult : interpretResult.output;
    
    // Check if @output was used in the document
    const hasExplicitOutput = environment && (environment as any).hasExplicitOutput;

    // Output handling - skip default output if @output was used (unless explicitly requested)
    if (stdout) {
      console.log(result);
    } else if (outputPath && (!hasExplicitOutput || output)) {
      const { outputPath: finalPath, shouldOverwrite } = await userInteraction.confirmOverwrite(outputPath);
      if (shouldOverwrite) {
        // Use Node's fs directly
        const dirPath = path.dirname(finalPath);
        
        // Ensure the output directory exists
        await fs.mkdir(dirPath, { recursive: true });
        
        // Write the file
        await fs.writeFile(finalPath, result, 'utf8');
        console.log(`\nOutput written to ${finalPath}`);
      } else {
        console.log('Operation cancelled by user.');
      }
    }
    
    // Clean up environment to prevent event loop from staying alive
    if (environment && 'cleanup' in environment) {
      cliLogger.debug('Calling environment cleanup');
      (environment as any).cleanup();
    }
    
    // For stdout mode, ensure clean exit after output
    if (stdout) {
      // Give a small delay to ensure all output is flushed
      await new Promise(resolve => setTimeout(resolve, 10));
      process.exit(0);
    }
    
    // Force exit if not in stdout mode but cleanup is complete
    // This is a workaround for a Prettier v3 bug where the process doesn't exit naturally
    // after formatting markdown content. The issue persists in v3.6.2.
    cliLogger.debug('Forcing process exit after cleanup');
    await new Promise(resolve => setTimeout(resolve, 50));
    process.exit(0);
  } catch (error: any) {
    // Clean up environment even on error
    if (environment && 'cleanup' in environment) {
      cliLogger.debug('Calling environment cleanup (error path)');
      environment.cleanup();
    }
    await handleError(error, cliOptions);
    
    // For stdout mode, ensure clean exit even on error
    if (stdout) {
      process.exit(1);
    }
    
    throw error;
  }
}

/**
 * Process a single file
 */
async function processFile(options: CLIOptions): Promise<void> {
  // Convert CLI options to API options
  const optionProcessorInstance = new OptionProcessor();
  const apiOptions = optionProcessorInstance.cliToApiOptions(options);
  
  if (options.debugContext) {
    // TODO: debugContextCommand is not imported
    console.error('Debug context command not yet implemented');
    return;
    /*
    await debugContextCommand({
      filePath: options.input,
      variableName: options.variableName,
      visualizationType: options.visualizationType || 'hierarchy',
      rootStateId: options.rootStateId,
      outputFormat: options.outputFormat as 'mermaid' | 'dot' | 'json' || 'mermaid',
      outputFile: options.output,
      includeVars: options.includeVars,
      includeTimestamps: options.includeTimestamps,
      includeFilePaths: options.includeFilePaths
    });
    return;
    */
  }

  // Use the common processing function
  await processFileWithOptions(options, apiOptions);
}

// Keep track of error messages we've seen
const seenErrors = new Set<string>();

// Flag to bypass the error deduplication for formatted errors
const bypassDeduplication = false;

// Check if error deduplication should be completely disabled
const disableDeduplication = !!(global as any).MLLD_DISABLE_ERROR_DEDUPLICATION;

// Store the original console.error
const originalConsoleError = console.error;

// Replace console.error with our custom implementation
console.error = function(...args: any[]) {
  // If deduplication is completely disabled via global flag, call original directly
  if (disableDeduplication) {
    originalConsoleError.apply(console, args);
    return;
  }

  // Enhanced error displays from our service should bypass deduplication
  if (bypassDeduplication) {
    // Call the original console.error directly
    originalConsoleError.apply(console, args);
    return;
  }
  
  // Convert the arguments to a string for comparison
  const errorMsg = args.join(' ');
  
  // If we've seen this error before, don't print it
  if (seenErrors.has(errorMsg)) {
    return;
  }
  
  // Add this error to the set of seen errors
  seenErrors.add(errorMsg);
  
  // Call the original console.error
  originalConsoleError.apply(console, args);
};

// Moved handleError definition before main

/**
 * Central entry point for the CLI, parsing arguments and orchestrating file processing.
 * Allows injecting a filesystem adapter for testing.
 */
export async function main(customArgs?: string[]): Promise<void> {
  // Clear the set of seen errors
  seenErrors.clear();

  const orchestrator = new CLIOrchestrator();
  await orchestrator.main(customArgs);
}

// This file is now imported by cli-entry.ts, which handles the main execution
