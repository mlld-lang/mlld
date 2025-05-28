import * as path from 'path';
import * as fs from 'fs/promises';
import { watch } from 'fs/promises';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { initCommand } from './commands/init';
import chalk from 'chalk';
import { version } from '@core/version';
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { OutputPathService } from '@services/fs/OutputPathService';
import { interpret } from '@interpreter/index';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { logger, cliLogger } from '@core/utils/logger';
import { ConfigLoader } from '@core/config/loader';
import type { ResolvedURLConfig } from '@core/config/types';
import { ErrorDisplayFormatter } from '@core/utils/errorDisplayFormatter';

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
  // URL support options
  allowUrls?: boolean;
  urlTimeout?: number;
  urlMaxSize?: number;
  urlAllowedDomains?: string[];
  urlBlockedDomains?: string[];
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
  // Add defensive check
  if (!Array.isArray(args)) {
    console.error('Internal CLI Error: args is not an array in parseArgs', args);
    throw new TypeError('Internal CLI Error: Expected args to be an array.');
  }

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
      // URL support options
      case '--allow-urls':
        options.allowUrls = true;
        break;
      case '--url-timeout':
        options.urlTimeout = parseInt(args[++i]);
        if (isNaN(options.urlTimeout)) {
          throw new Error('--url-timeout must be a number');
        }
        break;
      case '--url-max-size':
        options.urlMaxSize = parseInt(args[++i]);
        if (isNaN(options.urlMaxSize)) {
          throw new Error('--url-max-size must be a number');
        }
        break;
      case '--url-allowed-domains':
        options.urlAllowedDomains = args[++i].split(',').filter(Boolean);
        break;
      case '--url-blocked-domains':
        options.urlBlockedDomains = args[++i].split(',').filter(Boolean);
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
Usage: mlld debug-resolution [options] <input-file>

Debug variable resolution in a Mlld file.

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
Usage: mlld debug-transform [options] <input-file>

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
Usage: mlld [command] [options] <input-file>

Commands:
  init                    Create a new Mlld project
  debug-resolution        Debug variable resolution in a Mlld file
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

URL Support Options:
  --allow-urls            Enable URL support in directives
  --url-timeout <ms>      URL request timeout in milliseconds [default: 30000]
  --url-max-size <bytes>  Maximum URL response size [default: 5242880]
  --url-allowed-domains   Comma-separated list of allowed domains
  --url-blocked-domains   Comma-separated list of blocked domains

Configuration:
  Mlld looks for configuration in:
  1. ~/.config/mlld.json (global/user config)
  2. mlld.config.json (project config)
  
  CLI options override configuration file settings.
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
  
  // If output path was not explicitly set, we're using the safe path from OutputPathService
  // so we can just return it
  if (!cliOptions.output) {
    return { outputPath: filePath, shouldOverwrite: true };
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
  return {
    format: normalizeFormat(cliOptions.format),
    debug: cliOptions.debug,
    pretty: cliOptions.pretty,
  };
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
      // Only process .mlld files or the specific input file
      if (event.filename?.endsWith('.mlld') || event.filename === path.basename(inputPath)) {
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
  const normalizedFormat = normalizeFormat(format); // Use normalized format


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

    // Read the input file using Node's fs directly
    const fs = await import('fs/promises');
    const content = await fs.readFile(input, 'utf8');
    
    // Load configuration
    const configLoader = new ConfigLoader(path.dirname(input));
    const config = configLoader.load();
    const urlConfig = configLoader.resolveURLConfig(config);
    
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
    
    // Use the new interpreter
    const result = await interpret(content, {
      basePath: path.resolve(path.dirname(input)),
      filePath: path.resolve(input), // Pass the current file path for error reporting
      format: normalizedFormat,
      fileSystem: fileSystem,
      pathService: pathService,
      strict: cliOptions.strict,
      urlConfig: finalUrlConfig
    });

    // Output handling (remains mostly the same)
    if (stdout) {
      console.log(result);
    } else if (outputPath) {
      const { outputPath: finalPath, shouldOverwrite } = await confirmOverwrite(outputPath);
      if (shouldOverwrite) {
        // Use Node's fs directly
        const dirPath = path.dirname(finalPath);
        
        // Ensure the output directory exists
        await fs.mkdir(dirPath, { recursive: true });
        
        // Write the file
        await fs.writeFile(finalPath, result, 'utf8');
        console.log(`Output written to ${finalPath}`);
      } else {
        console.log('Operation cancelled by user.');
      }
    }
  } catch (error: any) {
    await handleError(error, cliOptions);
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
async function handleError(error: any, options: CLIOptions): Promise<void> {
  const isMlldError = error instanceof MlldError;
  const severity = isMlldError ? error.severity : ErrorSeverity.Fatal;

  // Ensure the logger configuration matches CLI options
  logger.level = options.debug ? 'debug' : (options.verbose ? 'info' : 'warn');

  if (isMlldError) {
    // Use enhanced error display with source context
    const fileSystem = new NodeFileSystem();
    const errorFormatter = new ErrorDisplayFormatter(fileSystem);
    
    try {
      const formattedError = await errorFormatter.formatError(error, {
        showSourceContext: true,
        useColors: true,
        contextLines: 2,
        useSmartPaths: true,
        basePath: path.resolve(path.dirname(options.input)),
        workingDirectory: process.cwd()
      });
      
      console.error('\n' + formattedError + '\n');
    } catch (formatError) {
      // Fallback to basic error display if formatting fails
      console.error(chalk.red(`\n${error.name}: ${error.message}\n`));
      
      if (error.details && typeof error.details === 'object') {
        const { formatLocationForError } = require('@core/utils/locationFormatter');
        const detailsStr = Object.entries(error.details)
          .filter(([key, value]) => value !== undefined && value !== null)
          .map(([key, value]) => {
            if (value && typeof value === 'object' && 
                ('line' in value || 'filePath' in value)) {
              return `  ${key}: ${formatLocationForError(value)}`;
            }
            return `  ${key}: ${String(value)}`;
          })
          .join('\n');
        
        if (detailsStr) {
          console.error(chalk.gray('Details:'));
          console.error(chalk.gray(detailsStr));
          console.error('');
        }
      }
    }
  } else if (error instanceof Error) {
    logger.error('An unexpected error occurred:', error);
    console.error(chalk.red(`Unexpected Error: ${error.message}`));
    const cause = error.cause;
    if (cause instanceof Error) {
        console.error(chalk.red(`  Cause: ${cause.message}`));
    }
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
  process.title = 'mlld';
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
      console.log(`mlld version ${version}`);
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
      cliLogger.level = 'trace';
    } else if (cliOptions.verbose) {
      // Show info level messages for verbose, but no debug logs
      logger.level = 'info';
      cliLogger.level = 'info';
      process.env.DEBUG = ''; // Explicitly disable DEBUG
    } else {
      // Only show errors by default (no debug logs)
      logger.level = 'error';
      cliLogger.level = 'error';
      process.env.DEBUG = ''; // Explicitly disable DEBUG
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

// This file is now imported by cli-entry.ts, which handles the main execution