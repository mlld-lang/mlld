import 'reflect-metadata';
import '@core/di-config';

// CLI initialization

import { main as apiMain } from '@api/index';
import { version } from '@core/version';
import { cliLogger as logger } from '@core/utils/logger';
import { loggingConfig } from '@core/config/logging';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import { createInterface } from 'readline';
import { initCommand } from './commands/init';
import { ProcessOptions } from '@core/types/index';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError';
import * as fs from 'fs/promises';
import * as path from 'path';
import { watch } from 'fs/promises';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { debugResolutionCommand } from './commands/debug-resolution';
import { debugContextCommand } from './commands/debug-context';
import { debugTransformCommand } from './commands/debug-transform';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { ErrorDisplayService } from '@services/display/ErrorDisplayService/ErrorDisplayService';
import { resolveService } from '@core/ServiceProvider';
import { unsafeCreateNormalizedAbsoluteDirectoryPath, PathValidationContext, NormalizedAbsoluteDirectoryPath } from '@core/types/paths';
import type { Position, Location } from '@core/types/index';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient';
import { PathValidationError, PathErrorCode } from '@services/fs/PathService/errors/PathValidationError';
import type { ValidatedResourcePath } from '@core/types/paths';
import { createRawPath } from '@core/types/paths';
import Meld from '@api/index';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { container } from 'tsyringe';

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
  pretty?: boolean; // Flag to enable Prettier formatting
  // No transform options - transformation is always enabled
}

/**
 * Normalize format string to supported output format
 */
function normalizeFormat(format?: string): 'markdown' | 'xml' {
  if (!format) return 'markdown'; // Default to markdown, not llm
  
  switch (format.toLowerCase()) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'xml':
      return 'xml';
    // Removed 'llm' case to match return type
    default:
      // Consider throwing an error for invalid format or defaulting
      logger.warn(`Invalid format specified: ${format}. Defaulting to markdown.`);
      return 'markdown'; // Default to markdown
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
      // Add directive type option for debug-transform
      case '--directive':
        options.directiveType = args[++i];
        break;
      // Add include-content option for debug-transform
      case '--include-content':
        options.includeContent = true;
        break;
      case '--pretty':
        options.pretty = true;
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
  --pretty                Format the output with Prettier
  --home-path <path>      Custom home path for ~/ substitution
  -v, --verbose           Enable verbose output (some additional info)
  -d, --debug             Enable debug output (full verbose logging)
  -w, --watch             Watch for changes and reprocess
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
  if (filePath.endsWith('.md') && !cliOptions.output) {
    console.log('Auto-redirecting .md file to prevent overwrite');
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
    fs: cliOptions.custom ? undefined : new NodeFileSystem(), // Allow custom filesystem in test mode
    pretty: cliOptions.pretty
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
  const { input, output, format, stdout, debug } = cliOptions;
  let outputPath = output;
  const normalizedFormat = normalizeFormat(format); // Normalize format before use

  if (!stdout && !outputPath) {
    outputPath = input.replace(/\.mld$/, '.' + getOutputExtension(normalizedFormat)); // Use normalized format
  }

  if (outputPath && outputPath === input) {
    console.error('Error: Input and output files cannot be the same.');
    process.exit(1);
  }

  try {
    // Resolve services from container using string tokens
    const meld = container.resolve<Meld>('Meld'); // Use token 'Meld' (assuming registered)
    const fsService = container.resolve<IFileSystemService>('IFileSystemService');
    const pathService = container.resolve<IPathService>('IPathService');

    if (debug) {
      console.log('CLI Options:', cliOptions);
      console.log('API Options:', apiOptions);
      console.log('Output Path:', outputPath);
    }
    
    const result = await meld.process(input, apiOptions);

    if (stdout) {
      console.log(result);
    } else if (outputPath) {
      const { outputPath: finalPath, shouldOverwrite } = await confirmOverwrite(outputPath);
      if (shouldOverwrite) {
        // Validate paths before using them with FileSystemService
        const dirPath = path.dirname(finalPath);
        const validationContext: PathValidationContext = {
          workingDirectory: unsafeCreateNormalizedAbsoluteDirectoryPath(process.cwd()),
          allowExternalPaths: true, // Allow reading potentially outside project
          rules: { allowAbsolute: true, allowRelative: true, allowParentTraversal: true, mustExist: false }
        };
        
        // Validate directory path
        const validatedDirPath = await pathService.validatePath(dirPath, validationContext);
        // Validate file path
        const validatedFilePath = await pathService.validatePath(finalPath, validationContext);

        // Ensure the output directory exists using the validated path
        await fsService.ensureDir(validatedDirPath.validatedPath as ValidatedResourcePath);
        // Write the file using the validated path
        await fsService.writeFile(validatedFilePath.validatedPath as ValidatedResourcePath, result);
        console.log(`Output written to ${finalPath}`);
      } else {
        console.log('Operation cancelled by user.');
      }
    }
  } catch (error: any) {
    // Use the centralized error handler
    await handleError(error, cliOptions);
    // Re-throw for testing or further handling if needed
    throw error;
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

// Moved handleError definition before main
async function handleError(error: any, options: CLIOptions): Promise<void> {
  const isMeldError = error instanceof MeldError;
  const severity = isMeldError ? error.severity : ErrorSeverity.Fatal;

  const displayErrorWithSourceContext = async (error: MeldError) => {
    // Dynamically load ErrorDisplayService
    try {
      const { ErrorDisplayService } = await import('@services/display/ErrorDisplayService/ErrorDisplayService');
      // Resolve FileSystemService (implementation) instead of IFileSystemService
      const fsService = resolveService<FileSystemService>('FileSystemService'); 
      const errorDisplayService = new ErrorDisplayService(fsService);

      // Get source context if available
      // Use sourceLocation property
      if (error.sourceLocation) {
        const { filePath } = error.sourceLocation;
        // Explicitly cast to Location for DTS
        const loc = error.sourceLocation as Location;
        const displayContext: { message: string; code?: string; cause?: Error | unknown; path?: string; startLine?: number; endLine?: number } = {
          message: error.message,
          code: error.code,
          cause: error.cause,
          path: filePath,
          startLine: loc.start?.line,
          endLine: loc.end?.line 
        };
        
        // Check if error.details exists and has path property (MeldError uses details)
        if (error.details && 'path' in error.details) {
          displayContext.path = error.details.path as string;
        }

        if (displayContext.path) {
          console.error(chalk.red(`${error.name} in ${displayContext.path}:${displayContext.startLine}`));
          console.error(chalk.red(`> ${error.message}`));
        } else {
          console.error(chalk.red(`Error: ${error.message}`));
          if (error.cause instanceof Error) {
            console.error(chalk.red(`  Cause: ${error.cause.message}`));
          }
        }
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
        if (error.cause instanceof Error) {
          console.error(chalk.red(`  Cause: ${error.cause.message}`));
        }
      }
    } catch (displayError) {
      console.error(chalk.red(`Original error: ${error.message}`));
      if (displayError instanceof Error) {
        console.error(chalk.yellow(`Failed to display error with source context: ${displayError.message}`));
      } else {
        console.error(chalk.yellow(`Failed to display error with source context: ${String(displayError)}`));
      }
    }
  };

  // Ensure the logger configuration matches CLI options
  logger.level = options.debug ? 'debug' : (options.verbose ? 'info' : 'warn');

  if (isMeldError) {
    await displayErrorWithSourceContext(error);
  } else if (error instanceof Error) {
    logger.error('An unexpected error occurred:', error);
    console.error(chalk.red(`Unexpected Error: ${error.message}`));
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
  } else {
    logger.error('An unknown error occurred:', { error });
    console.error(chalk.red(`Unknown Error: ${String(error)}`));
  }

  if (severity === ErrorSeverity.Fatal) {
    process.exit(1);
  }
}

/**
 * Central entry point for the CLI, parsing arguments and orchestrating file processing.
 * Allows injecting a filesystem adapter for testing.
 */
export async function main(customArgs?: string[]): Promise<void> {
  process.title = 'meld';
  let cliOptions: CLIOptions = { input: '' }; // Initialize with default

  try {
    // Reset errorLogged flag for each invocation of main
    errorLogged = false;
    
    // Clear the set of seen errors
    seenErrors.clear();

    // Explicitly disable debug mode by default
    process.env.DEBUG = '';
    
    // Parse command-line arguments
    const args = customArgs || process.argv.slice(2);
    
    cliOptions = parseArgs(args); // Assign parsed options
    setCurrentCLIOptions(cliOptions);
    
    // Handle version flag
    if (cliOptions.version) {
      console.log(`meld version ${version}`);
      return;
    }

    // Handle help flag
    if (cliOptions.help) {
      displayHelp(args[0]);
      return;
    }
    
    // Handle init command
    if (cliOptions.input === 'init') {
      await initCommand();
      return;
    }
    
    // Handle debug-resolution command
    if (cliOptions.debugResolution) {
      try {
        await debugResolutionCommand({
          filePath: cliOptions.input,
          variableName: cliOptions.variableName,
          outputFormat: cliOptions.outputFormat as 'json' | 'text',
          watchMode: cliOptions.watch
        });
      } catch (error) {
        logger.error('Error running debug-resolution command', { error });
        throw error;
      }
      return;
    }

    // Handle debug-context command
    if (cliOptions.debugContext) {
      await debugContextCommand({
        filePath: cliOptions.input,
        variableName: cliOptions.variableName,
        visualizationType: cliOptions.visualizationType || 'hierarchy',
        rootStateId: cliOptions.rootStateId,
        outputFormat: cliOptions.outputFormat as 'mermaid' | 'dot' | 'json',
        outputFile: cliOptions.output,
        includeVars: cliOptions.includeVars !== false,
        includeTimestamps: cliOptions.includeTimestamps !== false,
        includeFilePaths: cliOptions.includeFilePaths !== false
      });
      return;
    }

    // Handle debug-transform command
    if (cliOptions.debugTransform) {
      await debugTransformCommand({
        filePath: cliOptions.input,
        directiveType: cliOptions.directiveType,
        outputFormat: cliOptions.outputFormat as 'text' | 'json' | 'mermaid',
        outputFile: cliOptions.output,
        includeContent: cliOptions.includeContent
      });
      return;
    }

    // Configure logging based on options
    if (cliOptions.debug) {
      // Set environment variable for child processes and imported modules
      process.env.DEBUG = 'true';
      logger.level = 'trace';
      // Set log level for all service loggers
      Object.values(loggingConfig.services).forEach(serviceConfig => {
        (serviceConfig as any).level = 'debug';
      });
    } else if (cliOptions.verbose) {
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

    // Watch mode or single processing
    if (cliOptions.watch) {
      await watchFiles(cliOptions); // Pass cliOptions
      return;
    }

    await processFileWithOptions(cliOptions, cliToApiOptions(cliOptions));

  } catch (error: unknown) { // Catch unknown type
    // Use the centralized error handler
    await handleError(error, cliOptions); // Pass potentially unparsed cliOptions
  }
}

// Only call main if this file is being run directly (not imported)
if (require.main === module) {
  main().catch(async err => { // Make catch async to allow await handleError
    // Ensure options are parsed or provide defaults if main failed early
    let options: CLIOptions = { input: 'unknown' }; // Default options for error handling
    try {
      // Try parsing args again inside catch, only if needed for handleError
      const args = process.argv.slice(2);
      options = parseArgs(args);
    } catch (parseErr) {
      // Use default options if parsing fails
    }
    // Call the centralized error handler if error hasn't been logged
    if (!(err && typeof err === 'object' && (err as any).__logged)) {
        // Ensure err is an Error instance before passing
        const errorToHandle = err instanceof Error ? err : new Error(String(err));
        await handleError(errorToHandle, options);
    }
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  });
}