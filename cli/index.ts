import 'reflect-metadata';
import '@core/di-config.js';

// CLI initialization

import { main as apiMain } from '@api/index.js';
import { version } from '@core/version.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { loggingConfig } from '@core/config/logging.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { createInterface } from 'readline';
import { initCommand } from './commands/init.js';
import { ProcessOptions } from '@core/types/index.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { watch } from 'fs/promises';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { debugResolutionCommand } from './commands/debug-resolution.js';
import { debugContextCommand } from './commands/debug-context.js';
import { debugTransformCommand } from './commands/debug-transform.js';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { ErrorDisplayService } from '@services/display/ErrorDisplayService/ErrorDisplayService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { resolveService } from '@core/ServiceProvider.js';
import { unsafeCreateNormalizedAbsoluteDirectoryPath, PathValidationContext, NormalizedAbsoluteDirectoryPath } from '@core/types/paths.js';
import { ErrorSeverity } from '@core/errors/index.js';
import type { Position, ErrorSourceLocation } from '@core/types/location.js';
import type { IFileSystemClient } from '@services/fs/FileSystemService/interfaces/IFileSystemClient.js';
import { BaseError, BaseErrorDetails } from '@core/errors/BaseError.js';
import { PathValidationError, PathErrorCode } from '@services/fs/PathService/errors/PathValidationError.js';
import type { ValidatedResourcePath } from '@core/types/paths.js';
import { createRawPath } from '@core/types/paths.js';
import { ServiceProvider } from '@core/ServiceProvider.js';
import { Meld } from '@core/Meld.js';
import { IFileSystemService } from '@services/fs/FileSystemService/interfaces/IFileSystemService.js';

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

  if (!stdout && !outputPath) {
    outputPath = input.replace(/\.mld$/, '.' + getOutputExtension(format || 'xml'));
  }

  if (outputPath && outputPath === input) {
    console.error('Error: Input and output files cannot be the same.');
    process.exit(1);
  }

  const serviceProvider = new ServiceProvider();
  const container = serviceProvider.getContainer();

  try {
    // Register core services - consider moving to a central config
    // Assume necessary factories/services are registered elsewhere or use defaults
    const meld = container.resolve(Meld);

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
        // Assume fileSystemService is available via container or direct instantiation
        const fsService = container.resolve<IFileSystemService>('IFileSystemService'); 
        // Ensure the output directory exists
        await fsService.ensureDir(path.dirname(finalPath) as ValidatedResourcePath);
        // Write the file
        await fsService.writeFile(finalPath as ValidatedResourcePath, result);
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

/**
 * Main CLI entry point
 * 
 * @param fsAdapter Optional filesystem adapter for testing
 * @param customArgs Optional command line arguments (defaults to process.argv.slice(2))
 */
export async function main(fsAdapter?: any, customArgs?: string[]): Promise<void> {
  process.title = 'meld';

  // Reset errorLogged flag for each invocation of main
  errorLogged = false;
  
  // Clear the set of seen errors
  seenErrors.clear();

  // Explicitly disable debug mode by default
  process.env.DEBUG = '';
  
  // Parse command-line arguments
  const args = customArgs || process.argv.slice(2);
  
  // Define options outside try block so it's accessible in catch block
  let options: CLIOptions = {
    input: '',
  };
  
  try {
    // Parse command-line arguments
    options = parseArgs(args);
    
    // Store the current CLI options for access by other functions
    setCurrentCLIOptions(options);
    
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
      
      // Helper to display source context from a file
      const displayErrorWithSourceContext = async (error: MeldError) => {
        // Safely access source location and file path
        const sourceLocation = error.sourceLocation;
        const filePath = sourceLocation?.filePath;
        const line = sourceLocation?.line;

        if (!filePath || typeof line !== 'number' || line <= 0) {
          console.error(chalk.red(`${error.name}: ${error.message}`));
          return;
        }

        try {
          // Resolve services needed within the helper
          const pathService = resolveService<PathService>('IPathService');
          const filesystemService = resolveService<FileSystemService>('IFileSystemService');
        
          // Validate the path before reading
          // Use a simplified context as we only need to read
          const context: PathValidationContext = {
            workingDirectory: unsafeCreateNormalizedAbsoluteDirectoryPath(process.cwd()),
            allowExternalPaths: true, // Allow reading potentially outside project
            rules: { allowAbsolute: true, allowRelative: true, allowParentTraversal: true, mustExist: true }
          };
          const validatedPath = await pathService.validatePath(filePath, context);
          
          const fileContent = await filesystemService.readFile(validatedPath.validatedPath);
          const lines = fileContent.split('\n');
          const errorLine = line - 1; // Adjust to 0-based index

          console.error(chalk.red(`${error.name} in ${filePath}:${line}`));
          console.error(chalk.red(`> ${error.message}`));

          // Display context lines (e.g., 2 lines before and after)
          const contextLines = 2;
          const startLine = Math.max(0, errorLine - contextLines);
          const endLine = Math.min(lines.length - 1, errorLine + contextLines);

          for (let i = startLine; i <= endLine; i++) {
            const lineNumber = i + 1;
            const lineContent = lines[i];
            if (i === errorLine) {
              console.error(chalk.red.bold(`${String(lineNumber).padStart(4)} | ${lineContent}`));
            } else {
              console.error(chalk.grey(`${String(lineNumber).padStart(4)} | ${lineContent}`));
            }
          }

        } catch (contextError) {
          // If we fail to read context, just print the original error
          console.error(chalk.red(`${error.name}: ${error.message} (Could not display source context)`));
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
              console.error('DEBUG: MeldError properties:');
              console.error('  - message:', error.message);
              console.error('  - code:', error.code);
              console.error('  - severity:', error.severity);
              // Get filePath safely using type guards or sourceLocation
              let filePath = error.sourceLocation?.filePath;
              if (!filePath && error.details && 'filePath' in error.details && typeof error.details.filePath === 'string') {
                  filePath = error.details.filePath;
              }
              console.error('  - filePath:', filePath || '(not found)');

              // Log specialized properties based on error type
              if ('directiveKind' in error) {
                console.error('  - directiveKind:', (error as any).directiveKind);
              }
              if (error.sourceLocation) { // Check sourceLocation directly
                console.error('  - location:', JSON.stringify(error.sourceLocation, null, 2));
              }
              if (error.details) { // Check details directly
                console.error('  - details:', JSON.stringify(error.details, null, 2));
              }

              // Log context for debugging - Check details object
              let contextInfo = '(not found)';
              if (error.details && 'context' in error.details) {
                  try {
                      contextInfo = JSON.stringify(error.details.context, null, 2);
                  } catch (e) {
                      contextInfo = '[Circular JSON or stringify error]';
                  }
              }
              console.error('  - context:', contextInfo);

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
            let errorToDisplay: Error = error; // Use a new variable
            if (error instanceof MeldError && options.input) {
                let needsPathCorrection = false;
                let originalPath = error.sourceLocation?.filePath;
                if (!originalPath && error.details && 'filePath' in error.details && typeof error.details.filePath === 'string') {
                    originalPath = error.details.filePath;
                }
                // Check if the path needs correction (e.g., was a default or example path)
                if (originalPath === 'examples/error-test.meld' || !originalPath) { // Add more conditions if needed
                    needsPathCorrection = true;
                }

                if (needsPathCorrection) {
                    // Create a clone of the error with the correct file path
                    const newDetails: BaseErrorDetails = { ...error.details };
                    // Remove potentially incorrect filePath from details if it exists
                    if ('filePath' in newDetails) {
                        delete newDetails.filePath;
                    }

                    const newSourceLocation: ErrorSourceLocation | undefined = {
                        ...(error.sourceLocation || { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }), // Default location if none exists
                        filePath: options.input
                    };

                    const fixedError = new MeldError(error.message, {
                        code: error.code,
                        severity: error.severity,
                        sourceLocation: newSourceLocation,
                        details: newDetails,
                        cause: error.cause as Error | undefined
                    });

                    // Copy other relevant properties if necessary (less safe, use sparingly)
                    // for (const prop of ['directiveKind', 'originalError']) {
                    //   if (prop in error && !(prop in fixedError)) {
                    //     (fixedError as any)[prop] = (error as any)[prop];
                    //   }
                    // }

                    errorToDisplay = fixedError; // Use the corrected error for display
                }
            }

            // Bypass deduplication for our enhanced display
            bypassDeduplication = true;
          } catch (importError) {
            // If dynamic import fails, fall back to our simple display function
            if (options.debug) {
              console.error('DEBUG: Failed to load ErrorDisplayService:', importError);
            }

            // Use our custom error display function as fallback
            const fallbackError = errorToDisplay instanceof MeldError ? errorToDisplay : new MeldError(
              errorToDisplay instanceof Error ? errorToDisplay.message : String(errorToDisplay),
              {
                // Attempt to provide filePath in details for fallback
                details: { filePath: options.input },
                cause: errorToDisplay instanceof Error ? errorToDisplay : undefined,
                // severity: ErrorSeverity.Fatal, // Optional: Set severity if needed
                // code: 'DISPLAY_FALLBACK', // Optional: Set code if needed
                // context: { ... } // Avoid adding complex context here
              }
            );
            const enhancedErrorDisplay = await displayErrorWithSourceContext(fallbackError);

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
          if (errorToDisplay instanceof MeldError) {
            // Get filePath safely
            const errorFilePath = errorToDisplay.sourceLocation?.filePath || (errorToDisplay.details && 'filePath' in errorToDisplay.details ? errorToDisplay.details.filePath : 'unknown');
            const errorMsg = `\nError in ${errorFilePath}: ${errorToDisplay.message}`;
            
            // Check if we've seen this error before
            if (!seenErrors.has(errorMsg.trim())) {
              seenErrors.add(errorMsg.trim());
              console.error(errorMsg);
            }
          } else if (errorToDisplay instanceof Error && 'line' in errorToDisplay && 'column' in errorToDisplay) {
            // Check for meld-ast error properties
            const filePath = ('sourceFile' in errorToDisplay) ? (errorToDisplay as any).sourceFile : options.input;
            const errorMsg = `\nError in ${filePath}:${(errorToDisplay as any).line}:${(errorToDisplay as any).column}: ${errorToDisplay.message}`;
            
            // Check if we've seen this error before
            if (!seenErrors.has(errorMsg.trim())) {
              seenErrors.add(errorMsg.trim());
              console.error(errorMsg);
            }
          } else {
            const errorMsg = `\nError: ${errorToDisplay instanceof Error ? errorToDisplay.message : String(errorToDisplay)}`;
            
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