import 'reflect-metadata';
import '@core/di-config.js';

// CLI initialization

import { main as apiMain } from '@api/index.js';
import { version } from '@core/version.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { loggingConfig } from '@core/config/logging.js';
import { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { createInterface } from 'readline';
import { initCommand } from './commands/init.js';
import { ProcessOptions } from '../core/types/index.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import fs from 'fs/promises';
import path from 'path';
import { watch } from 'fs/promises';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { debugResolutionCommand } from './commands/debug-resolution.js';
import { debugContextCommand } from './commands/debug-context.js';
import { debugTransformCommand } from './commands/debug-transform.js';
import chalk from 'chalk';
import { existsSync } from 'fs';

// CLI Options interface
export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'md' | 'xml';
  stdout?: boolean;
  verbose?: boolean;
  debug?: boolean;
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
  useDI?: boolean; // Flag to enable/disable DI
  // No transform options - transformation is always enabled
}

/**
 * Normalize format string to supported output format
 */
function normalizeFormat(format?: string): 'markdown' | 'xml' {
  if (!format) return 'markdown';
  
  switch (format.toLowerCase()) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'xml':
      return 'xml'; // Return 'xml' for XML format
    default:
      return 'markdown';
  }
}

/**
 * Get file extension for the given format
 */
function getOutputExtension(format: 'markdown' | 'xml'): string {
  switch (format) {
    case 'markdown':
      return '.md';
    case 'xml':
      return '.xml';
    default:
      return '.md';
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    input: '',
    format: 'markdown', // Default to markdown format
    strict: false  // Default to permissive mode
  };

  // Check for debug-resolution command
  if (args.length > 0 && args[0] === 'debug-resolution') {
    options.debugResolution = true;
    // Remove the command from args
    args = args.slice(1);
  }

  // Check for debug-transform command
  if (args.length > 0 && args[0] === 'debug-transform') {
    options.debugTransform = true;
    // Remove the command from args
    args = args.slice(1);
  }

  // Check for debug-context command
  if (args.length > 0 && args[0] === 'debug-context') {
    options.debugContext = true;
    // Remove the command from args
    args = args.slice(1);
  }

  // Add context debug options
  if (args.includes('--debug-context')) {
    options.debugContext = true;
    // Remove the flag so it doesn't get treated as a file path
    args = args.filter(arg => arg !== '--debug-context');
  }

  // Handle visualization type
  const vizTypeIndex = args.findIndex(arg => arg === '--viz-type');
  if (vizTypeIndex !== -1 && vizTypeIndex < args.length - 1) {
    const vizType = args[vizTypeIndex + 1];
    if (['hierarchy', 'variable-propagation', 'combined', 'timeline'].includes(vizType)) {
      options.visualizationType = vizType as 'hierarchy' | 'variable-propagation' | 'combined' | 'timeline';
    } else {
      console.error(`Invalid visualization type: ${vizType}. Using default.`);
    }
    // Remove from args to avoid treating as file path
    args.splice(vizTypeIndex, 2);
  }

  // Handle root state ID
  const rootStateIdIndex = args.findIndex(arg => arg === '--root-state-id');
  if (rootStateIdIndex !== -1 && rootStateIdIndex < args.length - 1) {
    options.rootStateId = args[rootStateIdIndex + 1];
    // Remove from args
    args.splice(rootStateIdIndex, 2);
  }

  // Include vars option
  if (args.includes('--no-vars')) {
    options.includeVars = false;
    args = args.filter(arg => arg !== '--no-vars');
  }

  // Include timestamps option
  if (args.includes('--no-timestamps')) {
    options.includeTimestamps = false;
    args = args.filter(arg => arg !== '--no-timestamps');
  }

  // Include file paths option
  if (args.includes('--no-file-paths')) {
    options.includeFilePaths = false;
    args = args.filter(arg => arg !== '--no-file-paths');
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--version':
      case '-V':
        options.version = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--format':
      case '-f':
        options.format = normalizeFormat(args[++i]);
        break;
      case '--stdout':
        options.stdout = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--debug':
      case '-d':
        options.debug = true;
        break;
      case '--debug-source-maps':
        options.debugSourceMaps = true;
        break;
      case '--detailed-source-maps':
        options.detailedSourceMaps = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--permissive':
        options.strict = false;
        break;
      case '--home-path':
        options.homePath = args[++i];
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      // Add DI related options
      case '--use-di':
        options.useDI = true;
        break;
      case '--no-di':
        options.useDI = false;
        break;
      // Add new debug-resolution options
      case '--var':
      case '--variable':
      case '--variable-name':
        options.variableName = args[++i];
        break;
      case '--output-format':
        options.outputFormat = args[++i] as 'json' | 'text' | 'mermaid';
        break;
      // Add directive type option for debug-transform
      case '--directive':
        options.directiveType = args[++i];
        break;
      // Add include-content option for debug-transform
      case '--include-content':
        options.includeContent = true;
        break;
      // Transformation is always enabled by default
      // No transform flags needed
      default:
        if (!arg.startsWith('-') && !options.input) {
          options.input = arg;
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  // Version and help can be used without an input file
  if (!options.input && !options.version && !options.help) {
    throw new Error('No input file specified');
  }

  return options;
}

/**
 * Display help information
 */
function displayHelp(command?: string) {
  if (command === 'debug-resolution') {
    console.log(`
Usage: meld debug-resolution [options] <input-file>

Debug variable resolution in a Meld file.

Options:
  --var, --variable <n>     Filter to a specific variable
  --output-format <format>     Output format (json, text) [default: text]
  -w, --watch                  Watch for changes and reprocess
  -v, --verbose                Enable verbose output
  --home-path <path>           Custom home path for ~/ substitution
  -h, --help                   Display this help message
    `);
    return;
  }
  
  if (command === 'debug-transform') {
    console.log(`
Usage: meld debug-transform [options] <input-file>

Debug node transformations through the pipeline.

Options:
  --directive <type>           Focus on a specific directive type
  --output-format <format>     Output format (text, json, mermaid) [default: text]
  --output <path>              Output file path
  --include-content            Include node content in output
  -v, --verbose                Enable verbose output
  -h, --help                   Display this help message
    `);
    return;
  }

  console.log(`
Usage: meld [command] [options] <input-file>

Commands:
  init                    Create a new Meld project
  debug-resolution        Debug variable resolution in a Meld file
  debug-transform         Debug node transformations through the pipeline

Options:
  -f, --format <format>   Output format: md, markdown, xml, llm [default: llm]
  -o, --output <path>     Output file path
  --stdout                Print to stdout instead of file
  --strict                Enable strict mode (fail on all errors)
  --permissive            Enable permissive mode (ignore recoverable errors) [default]
  --home-path <path>      Custom home path for ~/ substitution
  -v, --verbose           Enable verbose output (some additional info)
  -d, --debug             Enable debug output (full verbose logging)
  -w, --watch             Watch for changes and reprocess
  --use-di                Enable dependency injection (USE_DI=true)
  --no-di                 Disable dependency injection (USE_DI=false)
  -h, --help              Display this help message
  -V, --version           Display version information
  `);

  if (!command || command === 'debug-context') {
    console.log('\nContext Debugging Options:');
    console.log('  --debug-context            Debug context boundaries and variable propagation');
    console.log('  --viz-type <type>          Type of visualization (hierarchy, variable-propagation, combined, timeline)');
    console.log('  --root-state-id <id>       Root state ID to start visualization from');
    console.log('  --variable-name <n>     Variable name to track (required for variable-propagation and timeline)');
    console.log('  --output-format <format>   Output format (mermaid, dot, json)');
    console.log('  --no-vars                  Exclude variables from context visualization');
    console.log('  --no-timestamps            Exclude timestamps from visualization');
    console.log('  --no-file-paths            Exclude file paths from visualization');
  }
}

/**
 * Prompt for file overwrite confirmation
 */
async function confirmOverwrite(filePath: string): Promise<{ outputPath: string; shouldOverwrite: boolean }> {
  // In test mode, always return true to allow overwriting
  if (process.env.NODE_ENV === 'test') {
    return { outputPath: filePath, shouldOverwrite: true };
  }
  
  // Get the current CLI options from the outer scope
  const cliOptions = getCurrentCLIOptions();
  
  // For .md files, auto-redirect to .o.md unless explicitly set with -o
  if (filePath.endsWith(".md") && !cliOptions.output) {
    console.log("Auto-redirecting .md file to prevent overwrite");
    const baseName = filePath.slice(0, -3); // Remove .md extension
    const newOutputPath = `${baseName}.o.md`;
    if (!(await fs.access(newOutputPath).then(() => true).catch(() => false))) {
      return { outputPath: newOutputPath, shouldOverwrite: true };
    }
  }
  
  // Check if we can use raw mode (might not be available in all environments)
  const canUseRawMode = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
  
  // If raw mode isn't available, fall back to readline
  if (!canUseRawMode) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`File ${filePath} already exists. Overwrite? [Y/n] `, (answer) => {
        rl.close();
        
        // If user doesn't want to overwrite, find an incremental filename
        if (answer.toLowerCase() === 'n') {
          const newPath = findAvailableIncrementalFilename(filePath);
          console.log(`Using alternative filename: ${newPath}`);
          resolve({ outputPath: newPath, shouldOverwrite: true });
        } else {
          resolve({ outputPath: filePath, shouldOverwrite: true });
        }
      });
    });
  }
  
  // Use raw mode to detect a single keypress
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  
  process.stdout.write(`File ${filePath} already exists. Overwrite? [Y/n] `);
  
  return new Promise((resolve) => {
    const onKeypress = (key: string) => {
      // Ctrl-C
      if (key === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      }
      
      // Convert to lowercase for comparison
      const keyLower = key.toLowerCase();
      
      // Only process y, n, or enter (which is '\r' in raw mode)
      if (keyLower === 'y' || keyLower === 'n' || key === '\r') {
        // Echo the key (since raw mode doesn't show keystrokes)
        process.stdout.write(key === '\r' ? 'y\n' : `${key}\n`);
        
        // Restore the terminal to cooked mode
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKeypress);
        
        // If user doesn't want to overwrite or pressed Enter (default to Y), find an incremental filename
        if (keyLower === 'n') {
          const newPath = findAvailableIncrementalFilename(filePath);
          console.log(`Using alternative filename: ${newPath}`);
          resolve({ outputPath: newPath, shouldOverwrite: true });
        } else {
          resolve({ outputPath: filePath, shouldOverwrite: true });
        }
      }
    };
    
    // Listen for keypresses
    process.stdin.on('data', onKeypress);
  });
}

// Store the current CLI options for access by other functions
let currentCLIOptions: CLIOptions | null = null;

function getCurrentCLIOptions(): CLIOptions {
  if (!currentCLIOptions) {
    throw new Error('CLI options not initialized');
  }
  return currentCLIOptions;
}

function setCurrentCLIOptions(options: CLIOptions): void {
  currentCLIOptions = options;
}

/**
 * Finds an available filename by appending an incremental number
 * If file.md exists, tries file-1.md, file-2.md, etc.
 */
function findAvailableIncrementalFilename(filePath: string): string {
  // Extract the base name and extension
  const lastDotIndex = filePath.lastIndexOf('.');
  const baseName = lastDotIndex !== -1 ? filePath.slice(0, lastDotIndex) : filePath;
  const extension = lastDotIndex !== -1 ? filePath.slice(lastDotIndex) : '';
  
  // Try incremental filenames until we find one that doesn't exist
  let counter = 1;
  let newPath = `${baseName}-${counter}${extension}`;
  
  while (existsSync(newPath)) {
    counter++;
    newPath = `${baseName}-${counter}${extension}`;
  }
  
  return newPath;
}

/**
 * Convert CLI options to API options
 */
function cliToApiOptions(cliOptions: CLIOptions): ProcessOptions {
  // Always use transformation mode
  const options: ProcessOptions = {
    format: normalizeFormat(cliOptions.format),
    debug: cliOptions.debug,
    // Always transform by default
    transformation: true,
    fs: cliOptions.custom ? undefined : new NodeFileSystem() // Allow custom filesystem in test mode
  };
  
  // Add strict property to options for backward compatibility with tests
  if (cliOptions.strict !== undefined) {
    (options as any).strict = cliOptions.strict;
  }
  
  return options;
}

/**
 * Watch for file changes and reprocess
 */
async function watchFiles(options: CLIOptions): Promise<void> {
  logger.info('Starting watch mode', { input: options.input });

  const inputPath = options.input;
  const watchDir = path.dirname(inputPath);

  try {
    console.log(`Watching for changes in ${watchDir}...`);
    const watcher = watch(watchDir, { recursive: true });

    for await (const event of watcher) {
      // Only process .meld files or the specific input file
      if (event.filename?.endsWith('.meld') || event.filename === path.basename(inputPath)) {
        console.log(`Change detected in ${event.filename}, reprocessing...`);
        await processFile(options);
      }
    }
  } catch (error) {
    logger.error('Watch mode failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Process a file with specific API options
 */
async function processFileWithOptions(cliOptions: CLIOptions, apiOptions: ProcessOptions): Promise<void> {
  try {
    // Show source map debug info before processing if requested
    if (cliOptions.debugSourceMaps || cliOptions.detailedSourceMaps) {
      console.log(chalk.cyan('Source map debugging enabled for file:', cliOptions.input));
    }
    
    // Process the file through the API with provided options
    const result = await apiMain(cliOptions.input, apiOptions);
    
    // Show source map debug info after processing if requested
    if (cliOptions.debugSourceMaps) {
      try {
        const { getSourceMapDebugInfo } = require('@core/utils/sourceMapUtils.js');
        console.log(chalk.cyan('\nSource map debug information:'));
        console.log(getSourceMapDebugInfo());
      } catch (e) {
        console.error('Failed to get source map debug info:', e);
      }
    }
    
    // Show detailed source map debug info if requested
    if (cliOptions.detailedSourceMaps) {
      try {
        const { getDetailedSourceMapDebugInfo } = require('@core/utils/sourceMapUtils.js');
        console.log(chalk.cyan('\nDetailed source map debug information:'));
        console.log(getDetailedSourceMapDebugInfo());
      } catch (e) {
        console.error('Failed to get detailed source map debug info:', e);
      }
    }
    
    // Handle output based on CLI options
    if (cliOptions.stdout) {
      console.log(result);
      if (!cliOptions.debug) {
        console.log('✅ Successfully processed Meld file');
      } else {
        logger.info('Successfully wrote output to stdout');
      }
    } else {
      // Handle output path
      let outputPath = cliOptions.output;
      
      if (!outputPath) {
        // If no output path specified, use input path with .o.{format} extension pattern
        const inputPath = cliOptions.input;
        const inputExt = path.extname(inputPath);
        const outputExt = getOutputExtension(normalizeFormat(cliOptions.format));
        
        // Extract the base filename without extension
        const basePath = inputPath.substring(0, inputPath.length - inputExt.length);
        
        // Always append .o.{format} for default behavior
        outputPath = `${basePath}.o${outputExt}`;
      } else if (!outputPath.includes('.')) {
        // If output path has no extension, add default extension
        outputPath += getOutputExtension(normalizeFormat(cliOptions.format));
      }
      
      // In test mode with custom filesystem, we might need special handling
      if (cliOptions.custom && apiOptions.fs) {
        // Use the filesystem from API options if available
        const fs = apiOptions.fs;
        if (typeof fs.writeFile === 'function') {
          // Check if file exists first
          const fileExists = await fs.exists(outputPath);
          if (fileExists) {
            const { outputPath: confirmedPath, shouldOverwrite } = await confirmOverwrite(outputPath);
            if (!shouldOverwrite) {
              logger.info('Operation cancelled by user');
              return;
            }
            // Update the output path with the confirmed path
            outputPath = confirmedPath;
          }
          await fs.writeFile(outputPath, result);
          logger.info('Successfully wrote output file using custom filesystem', { path: outputPath });
          return;
        }
      }
      
      // Standard file system operations
      const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
      if (fileExists) {
        const { outputPath: confirmedPath, shouldOverwrite } = await confirmOverwrite(outputPath);
        if (!shouldOverwrite) {
          logger.info('Operation cancelled by user');
          return;
        }
        // Update the output path with the confirmed path
        outputPath = confirmedPath;
      }
      
      await fs.writeFile(outputPath, result);
      
      // Show a clean success message in normal mode
      if (!cliOptions.debug) {
        console.log(`✅ Successfully processed Meld file and wrote output to ${outputPath}`);
      } else {
        logger.info('Successfully wrote output file', { path: outputPath });
      }
    }
  } catch (error) {
    // Show source map debug info on error if requested
    if (cliOptions.debugSourceMaps) {
      try {
        const { getSourceMapDebugInfo } = require('@core/utils/sourceMapUtils.js');
        console.log(chalk.cyan('\nSource map debug information (on error):'));
        console.log(getSourceMapDebugInfo());
      } catch (e) {
        console.error('Failed to get source map debug info:', e);
      }
    }
    
    // Show detailed source map debug info on error if requested
    if (cliOptions.detailedSourceMaps) {
      try {
        const { getDetailedSourceMapDebugInfo } = require('@core/utils/sourceMapUtils.js');
        console.log(chalk.cyan('\nDetailed source map debug information (on error):'));
        console.log(getDetailedSourceMapDebugInfo());
      } catch (e) {
        console.error('Failed to get detailed source map debug info:', e);
      }
    }
    
    // Convert to MeldError if needed
    const meldError = error instanceof MeldError 
      ? error 
      : new MeldError(error instanceof Error ? error.message : String(error), {
          severity: ErrorSeverity.Fatal,
          code: 'PROCESSING_ERROR'
        });
    
    // Log the error for detailed debugging
    logger.error('Error processing file', {
      error: meldError.message,
      code: meldError.code,
      severity: meldError.severity
    });
    
    // Format error message appropriately for tests vs. normal mode
    if (process.env.NODE_ENV === 'test') {
      console.error(`Error: ${meldError.message}`);
    } else if (!cliOptions.debug) {
      // For regular users, we want to show the source location if available
      if (meldError.filePath && meldError.context?.sourceLocation) {
        const sourceLocation = meldError.context.sourceLocation;
        console.error(`Error in ${sourceLocation.filePath}:${sourceLocation.line}: ${meldError.message}`);
      } else if (meldError.filePath) {
        console.error(`Error in ${meldError.filePath}: ${meldError.message}`);
      } else {
        console.error(`Error: ${meldError.message}`);
      }
    }
    
    // Rethrow for the main function to handle
    throw meldError;
  }
}

/**
 * Process a single file
 */
async function processFile(options: CLIOptions): Promise<void> {
  // Convert CLI options to API options
  const apiOptions = cliToApiOptions(options);
  
  if (options.debugContext) {
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
  }

  // Use the common processing function
  await processFileWithOptions(options, apiOptions);
}

// Track if an error has been logged to prevent duplicate messages
let errorLogged = false;

// Keep track of error messages we've seen
const seenErrors = new Set<string>();

// Flag to bypass the error deduplication for formatted errors
let bypassDeduplication = false;

// Check if error deduplication should be completely disabled
const disableDeduplication = !!(global as any).MELD_DISABLE_ERROR_DEDUPLICATION;

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

/**
 * Main CLI entry point
 */
export async function main(fsAdapter?: any): Promise<void> {
  process.title = 'meld';

  // Reset errorLogged flag for each invocation of main
  errorLogged = false;
  
  // Clear the set of seen errors
  seenErrors.clear();

  // Explicitly disable debug mode by default
  process.env.DEBUG = '';
  
  // Parse command-line arguments
  const args = process.argv.slice(2);
  
  // Define options outside try block so it's accessible in catch block
  let options: CLIOptions = {
    input: '',
  };
  
  try {
    // Parse command-line arguments
    options = parseArgs(args);
    
    // Store the current CLI options for access by other functions
    setCurrentCLIOptions(options);
    
    // Apply DI setting to environment if specified
    if (options.useDI !== undefined) {
      process.env.USE_DI = options.useDI ? 'true' : 'false';
      if (options.verbose) {
        console.log(`Dependency Injection ${options.useDI ? 'enabled' : 'disabled'}`);
      }
    }
    
    // Handle version flag
    if (options.version) {
      console.log(`meld version ${version}`);
      return;
    }

    // Handle help flag
    if (options.help) {
      displayHelp(args[0]);
      return;
    }
    
    // Handle init command
    if (options.input === 'init') {
      await initCommand();
      return;
    }
    
    // Handle debug-resolution command
    if (options.debugResolution) {
      try {
        await debugResolutionCommand({
          filePath: options.input,
          variableName: options.variableName,
          outputFormat: options.outputFormat as 'json' | 'text',
          watchMode: options.watch
        });
      } catch (error) {
        logger.error('Error running debug-resolution command', { error });
        throw error;
      }
      return;
    }

    // Handle debug-context command
    if (options.debugContext) {
      await debugContextCommand({
        filePath: options.input,
        variableName: options.variableName,
        visualizationType: options.visualizationType || 'hierarchy',
        rootStateId: options.rootStateId,
        outputFormat: options.outputFormat as 'mermaid' | 'dot' | 'json',
        outputFile: options.output,
        includeVars: options.includeVars !== false,
        includeTimestamps: options.includeTimestamps !== false,
        includeFilePaths: options.includeFilePaths !== false
      });
      return;
    }

    // Handle debug-transform command
    if (options.debugTransform) {
      await debugTransformCommand({
        filePath: options.input,
        directiveType: options.directiveType,
        outputFormat: options.outputFormat as 'text' | 'json' | 'mermaid',
        outputFile: options.output,
        includeContent: options.includeContent
      });
      return;
    }

    // Configure logging based on options
    if (options.debug) {
      // Set environment variable for child processes and imported modules
      process.env.DEBUG = 'true';
      logger.level = 'trace';
      // Set log level for all service loggers
      Object.values(loggingConfig.services).forEach(serviceConfig => {
        (serviceConfig as any).level = 'debug';
      });
    } else if (options.verbose) {
      // Show info level messages for verbose, but no debug logs
      logger.level = 'info';
      process.env.DEBUG = ''; // Explicitly disable DEBUG
    } else {
      // Only show errors by default (no debug logs)
      logger.level = 'error';
      process.env.DEBUG = ''; // Explicitly disable DEBUG
      
      // Set all service loggers to only show errors
      Object.values(loggingConfig.services).forEach(serviceConfig => {
        (serviceConfig as any).level = 'error';
      });
    }

    // Handle testing with custom filesystem
    let customApiOptions: ProcessOptions | undefined;
    if (fsAdapter) {
      // Mark for special handling in cliToApiOptions
      options.custom = true; 
      
      // Create custom API options with the test filesystem
      customApiOptions = cliToApiOptions(options);
      customApiOptions.fs = fsAdapter;
    }

    // Watch mode handling
    if (options.watch) {
      await watchFiles(options);
      return;
    }

    // Process the file with custom filesystem if provided
    if (customApiOptions) {
      await processFileWithOptions(options, customApiOptions);
    } else {
      await processFile(options);
    }
  } catch (error) {
    // Only log if not already logged
    if (!errorLogged) {
      logger.error('CLI execution failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Create a simple error display function instead of using the service
      const displayErrorWithSourceContext = async (error: MeldError) => {
        if (!error.filePath) {
          return chalk.red.bold(`Error: ${error.message}`);
        }
        
        // Debug the actual file path being searched
        if (options.debug) {
          console.error(`DEBUG: Searching for source file: ${error.filePath}`);
        }
        
        try {
          // Get file path and location
          let filePath = error.filePath;
          let line = 1;
          let column = 1;
          
          // Extract location from error
          if ((error as any).location?.start) {
            line = (error as any).location.start.line;
            column = (error as any).location.start.column;
          } else if (error.context?.sourceLocation) {
            line = error.context.sourceLocation.line;
            column = error.context.sourceLocation.column;
          }
          
          // Fix for hard-coded 'examples/error-test.meld' paths in error objects
          if (filePath === 'examples/error-test.meld' && options.input) {
            if (options.debug) {
              console.error(`DEBUG: Replacing hardcoded path with input file: ${options.input}`);
            }
            filePath = options.input;
          }
          
          // Verify file exists
          let fileExists = false;
          try {
            await fs.access(filePath);
            fileExists = true;
          } catch (err) {
            if (options.debug) {
              console.error(`DEBUG: Could not access file: ${filePath}`);
            }
          }
          
          if (!fileExists) {
            return chalk.red.bold(`Error in ${filePath}: ${error.message}`);
          }
          
          // Read the source file
          const sourceCode = await fs.readFile(filePath, 'utf8');
          const lines = sourceCode.split('\n');
          
          // Get the error line
          const errorLine = lines[line - 1] || '';
          
          // Highlight the error character
          const beforeError = errorLine.substring(0, column - 1);
          const errorChar = errorLine.substring(column - 1, column) || ' ';
          const afterError = errorLine.substring(column);
          
          const highlightedLine = chalk.white(beforeError) + 
                                chalk.bgRed.white(errorChar) + 
                                chalk.white(afterError);
          
          // Create pointer line
          const pointerLine = ' '.repeat(column - 1 + 6) + chalk.red('^');
          
          // Get context lines (up to 2 lines before and after)
          const contextLines = [];
          
          for (let i = Math.max(1, line - 2); i < line; i++) {
            contextLines.push(
              chalk.dim(`${i.toString().padStart(4)} | `) + 
              chalk.dim(lines[i - 1] || '')
            );
          }
          
          // Add error line
          contextLines.push(
            chalk.bold(`${line.toString().padStart(4)} | `) + 
            highlightedLine
          );
          contextLines.push(pointerLine);
          
          // Add lines after
          for (let i = line + 1; i <= Math.min(lines.length, line + 2); i++) {
            contextLines.push(
              chalk.dim(`${i.toString().padStart(4)} | `) + 
              chalk.dim(lines[i - 1] || '')
            );
          }
          
          // Compose the final message
          const errorType = error.constructor.name.replace('Meld', '').replace('Error', ' Error');
          
          return [
            chalk.red.bold(`${errorType}: `) + error.message,
            chalk.dim(`    at ${chalk.cyan(filePath)}:${chalk.yellow(line.toString())}:${chalk.yellow(column.toString())}`),
            '',
            ...contextLines
          ].join('\n');
        } catch (err) {
          console.log("Failed to format error with source context:", err);
          return chalk.red(`Error in ${error.filePath}: ${error.message}`);
        }
      };
      
      // Display error to user in a clean format
      if (process.env.NODE_ENV === 'test') {
        // Show errors with the "Error:" prefix for test expectations
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      } else {
        try {
          // Add debug logging to see what kind of error we're dealing with
          if (options.debug) {
            // Log the error type for debugging
            const errorType = error instanceof MeldError 
              ? `MeldError (${error.constructor.name})` 
              : (error instanceof Error ? error.constructor.name : typeof error);
            
            console.error('DEBUG: Error type:', errorType);
            
            // For MeldError types, log additional properties
            if (error instanceof MeldError) {
              console.error('DEBUG: Error properties:');
              console.error('  - message:', error.message);
              console.error('  - code:', error.code);
              console.error('  - severity:', error.severity);
              console.error('  - filePath:', error.filePath);
              
              // Log specialized properties based on error type
              if ('directiveKind' in error) {
                console.error('  - directiveKind:', (error as any).directiveKind);
              }
              if ('location' in error) {
                console.error('  - location:', JSON.stringify((error as any).location, null, 2));
              }
              if ('details' in error) {
                console.error('  - details:', JSON.stringify((error as any).details, null, 2));
              }
              
              // Log context for debugging
              console.error('  - context:', JSON.stringify(error.context, null, 2));
              
              if (error.stack) {
                console.error('  - stack trace available');
              }
            } else if (error instanceof Error) {
              console.error('DEBUG: Standard Error properties:');
              console.error('  - message:', error.message);
              console.error('  - name:', error.name);
              if (error.stack) {
                console.error('  - stack trace available');
              }

              // Add debugging for direct meld-ast errors
              if ('line' in error && 'column' in error) {
                console.error('DEBUG: Raw meld-ast error properties:');
                console.error('  - line:', (error as any).line);
                console.error('  - column:', (error as any).column);
                if ('sourceFile' in error) {
                  console.error('  - sourceFile:', (error as any).sourceFile);
                }
              }
            }
          }
          
          // Handle both MeldError and raw errors that might come from meld-ast
          try {
            // Always use input file path if available to handle hardcoded paths
            if (error instanceof MeldError && options.input && error.filePath === 'examples/error-test.meld') {
              // Create a clone of the error with the correct file path
              const fixedPathError = new MeldError(error.message, {
                code: error.code,
                severity: error.severity,
                filePath: options.input,
                context: error.context ? { ...error.context } : {},
                cause: error.cause as Error | undefined
              });
              
              // Copy special properties if they exist (like location)
              for (const prop of ['location', 'details', 'directiveKind', 'originalError']) {
                if (prop in error) {
                  (fixedPathError as any)[prop] = (error as any)[prop];
                }
              }
              
              // Use this error instead
              error = fixedPathError;
            }
            
            // Bypass deduplication for our enhanced display
            bypassDeduplication = true;
            
            // Clear previous errors from the seen set that might conflict
            seenErrors.clear(); // Clear all seen errors to be safe
            
            // Convert to a consistent format for deduplication
            const errorKey = error instanceof Error ? `Error: ${error.message}` : `Error: ${String(error)}`;
            
            // In a real implementation, we would import and use the ErrorDisplayService directly
            // Here we need to dynamically load it to avoid circular dependencies
            try {
              // Dynamic import of the ErrorDisplayService and file system
              const { ErrorDisplayService } = await import('@services/display/ErrorDisplayService/ErrorDisplayService.js');
              const { FileSystemService } = await import('@services/fs/FileSystemService/FileSystemService.js');
              const { NodeFileSystem } = await import('@services/fs/FileSystemService/NodeFileSystem.js');
              const { PathOperationsService } = await import('@services/fs/FileSystemService/PathOperationsService.js');
              
              // Create the required services
              const nodeFs = fsAdapter || new NodeFileSystem();
              const pathOps = new PathOperationsService();
              const fsService = new FileSystemService(pathOps, nodeFs);
              
              // Create a new instance of the ErrorDisplayService with the file system
              const errorDisplayService = new ErrorDisplayService(fsService);
              
              // Debug logging for file path issues
              if (options.debug) {
                console.error("DEBUG: Input file path:", options.input);
                
                // Cast error to MeldError for type safety
                const meldError = error as MeldError;
                
                console.error("DEBUG: Error filePath property:", meldError.filePath);
                if (meldError.context?.sourceLocation) {
                  console.error("DEBUG: Error sourceLocation.filePath:", meldError.context.sourceLocation.filePath);
                }
                if (meldError.context?.errorFilePath) {
                  console.error("DEBUG: Error context.errorFilePath:", meldError.context.errorFilePath);
                }
                if ((meldError as any).location?.filePath) {
                  console.error("DEBUG: Error location.filePath:", (meldError as any).location.filePath);
                }

                // Check if file exists at the input path
                try {
                  fsService.exists(options.input).then(exists => {
                    console.error("DEBUG: Input file exists:", exists);
                  });
                } catch (err) {
                  console.error("DEBUG: Error checking if file exists:", err);
                }
              }
              
              // Fix file path issues - if filePath is missing, create a new error with the correct path
              // Cast error to MeldError for type safety
              let meldError = error as MeldError;
              
              if (!meldError.filePath && options.input) {
                // Start with a clean context object
                const newContext: Record<string, any> = {};
                
                // Copy the original context if available
                if (meldError.context) {
                  Object.assign(newContext, meldError.context);
                }
                
                // Set sourceLocation with the proper file path
                if (meldError.context?.sourceLocation) {
                  newContext.sourceLocation = {
                    ...meldError.context.sourceLocation,
                    filePath: options.input
                  };
                }
                
                // Create a new error with the correct file path
                const updatedError = new MeldError(meldError.message, {
                  filePath: options.input,
                  code: meldError.code,
                  severity: meldError.severity,
                  cause: meldError instanceof Error ? meldError : undefined,
                  context: newContext
                });
                
                // For any other properties, try to copy them
                for (const prop of ['location', 'details', 'directiveKind', 'originalError']) {
                  if (prop in meldError) {
                    (updatedError as any)[prop] = (meldError as any)[prop];
                  }
                }
                
                // Use this updated error instead
                meldError = updatedError;
                error = updatedError;
              }
              
              // Use the enhanced error display service which now handles nested errors correctly
              const enhancedErrorDisplay = await errorDisplayService.enhanceErrorDisplay(error);
              
              // Check if we've seen this error before
              if (!seenErrors.has(errorKey)) {
                // This is a new error, add it to our set
                seenErrors.add(errorKey);
                
                // The service will now display just the filepath and source context
                console.error(enhancedErrorDisplay);
              }
            } catch (importError) {
              // If dynamic import fails, fall back to our simple display function
              if (options.debug) {
                console.error('DEBUG: Failed to load ErrorDisplayService:', importError);
              }
              
              // Use our custom error display function as fallback
              const enhancedErrorDisplay = await displayErrorWithSourceContext(error instanceof MeldError ? error : new MeldError(
                error instanceof Error ? error.message : String(error),
                {
                  filePath: options.input,
                  cause: error instanceof Error ? error : undefined,
                  context: {
                    // Copy line/column from meld-ast errors if available
                    sourceLocation: (typeof error === 'object' && error !== null && 'line' in error && 'column' in error) ? {
                      filePath: (typeof error === 'object' && error !== null && 'sourceFile' in error && typeof (error as any).sourceFile === 'string') 
                        ? (error as any).sourceFile 
                        : options.input,
                      line: (error as any).line,
                      column: (error as any).column
                    } : undefined
                  }
                }
              ));
              
              // Check if we've seen this error before
              if (!seenErrors.has(errorKey)) {
                // This is a new error, add it to our set
                seenErrors.add(errorKey);
                
                // Display the enhanced error with a blank line for separation
                console.log('\n'); 
                console.error(enhancedErrorDisplay);
              }
            }
            
            // Reset the bypass flag
            bypassDeduplication = false;
          } catch (displayError) {
            // If the enhanced display fails, fall back to basic formatting
            if (error instanceof MeldError) {
              const errorMsg = `\nError in ${error.filePath || 'unknown'}: ${error.message}`;
              
              // Check if we've seen this error before
              if (!seenErrors.has(errorMsg.trim())) {
                seenErrors.add(errorMsg.trim());
                console.error(errorMsg);
              }
            } else if (error instanceof Error) {
              // Check for meld-ast error properties
              if ('line' in error && 'column' in error) {
                const filePath = ('sourceFile' in error) ? (error as any).sourceFile : options.input;
                const errorMsg = `\nError in ${filePath}:${(error as any).line}:${(error as any).column}: ${error.message}`;
                
                // Check if we've seen this error before
                if (!seenErrors.has(errorMsg.trim())) {
                  seenErrors.add(errorMsg.trim());
                  console.error(errorMsg);
                }
              } else {
                const errorMsg = `\nError: ${error.message}`;
                
                // Check if we've seen this error before
                if (!seenErrors.has(errorMsg.trim())) {
                  seenErrors.add(errorMsg.trim());
                  console.error(errorMsg);
                }
              }
            } else {
              const errorMsg = `\nError: ${String(error)}`;
              
              // Check if we've seen this error before
              if (!seenErrors.has(errorMsg.trim())) {
                seenErrors.add(errorMsg.trim());
                console.error(errorMsg);
              }
            }
            
            if (options.debug) {
              console.error(`\nDebug: Display error: ${displayError instanceof Error ? displayError.message : String(displayError)}`);
            }
          }
        } catch (displayError) {
          // Fallback if enhanced display fails
          logger.error('Error display failed', { 
            error: displayError instanceof Error ? displayError.message : String(displayError) 
          });
          
          // Add more debugging for display errors
          if (options.debug) {
            console.error('DEBUG: Error display failure:', displayError);
          }
          
          // Display a basic error message as fallback
          if (error instanceof MeldError) {
            if (error.filePath) {
              console.error(`Error in ${error.filePath}: ${error.message}`);
            } else {
              console.error(`Error: ${error.message}`);
            }
          } else if (error instanceof Error && 'line' in error && 'column' in error) {
            // Handle raw meld-ast errors
            const filePath = ('sourceFile' in error) ? (error as any).sourceFile : options.input;
            console.error(`Error in ${filePath}:${(error as any).line}:${(error as any).column}: ${error.message}`);
          } else {
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // Mark as logged to prevent duplicate logging
      errorLogged = true;
      
      // Add a property to the error object to indicate it's been logged
      // This helps bin/meld.ts avoid duplicate logging
      if (error && typeof error === 'object') {
        (error as any).__logged = true;
      }
    }
    
    // Exit with error code for non-test environments
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    } else {
      // For tests, rethrow to be caught by the test runner
      throw error;
    }
  }
}

// Only call main if this file is being run directly (not imported)
if (require.main === module) {
  main().catch(err => {
    // Don't log the error again since it's already logged in the main function
    process.exit(1);
  });
}