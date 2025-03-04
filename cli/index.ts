import '@core/di-config.js';

// CLI initialization

import { main as apiMain } from '@api/index.js';
import { version } from '@core/version.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { loggingConfig } from '@core/config/logging.js';
import { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { createInterface } from 'readline';
import { initCommand } from './commands/init.js';
import { ProcessOptions } from '@core/types/index.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import fs from 'fs/promises';
import path from 'path';
import { watch } from 'fs/promises';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { debugResolutionCommand } from './commands/debug-resolution.js';
import { debugContextCommand } from './commands/debug-context.js';
import { debugTransformCommand } from './commands/debug-transform.js';

// CLI Options interface
interface CLIOptions {
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
      return 'markdown'; // Default to markdown for XML format
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
  --var, --variable <name>     Filter to a specific variable
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
  -h, --help              Display this help message
  -V, --version           Display version information
  `);

  if (!command || command === 'debug-context') {
    console.log('\nContext Debugging Options:');
    console.log('  --debug-context            Debug context boundaries and variable propagation');
    console.log('  --viz-type <type>          Type of visualization (hierarchy, variable-propagation, combined, timeline)');
    console.log('  --root-state-id <id>       Root state ID to start visualization from');
    console.log('  --variable-name <name>     Variable name to track (required for variable-propagation and timeline)');
    console.log('  --output-format <format>   Output format (mermaid, dot, json)');
    console.log('  --no-vars                  Exclude variables from context visualization');
    console.log('  --no-timestamps            Exclude timestamps from visualization');
    console.log('  --no-file-paths            Exclude file paths from visualization');
  }
}

/**
 * Prompt for file overwrite confirmation
 */
async function confirmOverwrite(filePath: string): Promise<boolean> {
  // In test mode, always return true to allow overwriting
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`File ${filePath} already exists. Overwrite? [Y/n] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== 'n');
    });
  });
}

/**
 * Convert CLI options to API options
 */
function cliToApiOptions(cliOptions: CLIOptions): ProcessOptions {
  const options: ProcessOptions = {
    format: normalizeFormat(cliOptions.format),
    debug: cliOptions.debug,
    transformation: true, // Enable transformation by default for CLI usage
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
    // Process the file through the API with provided options
    const result = await apiMain(cliOptions.input, apiOptions);
    
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
        // If no output path specified, use input path with new extension
        const inputExt = '.meld';
        const outputExt = getOutputExtension(normalizeFormat(cliOptions.format));
        outputPath = cliOptions.input.replace(new RegExp(`${inputExt}$`), outputExt);
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
            const shouldOverwrite = await confirmOverwrite(outputPath);
            if (!shouldOverwrite) {
              logger.info('Operation cancelled by user');
              return;
            }
          }
          await fs.writeFile(outputPath, result);
          logger.info('Successfully wrote output file using custom filesystem', { path: outputPath });
          return;
        }
      }
      
      // Standard file system operations
      const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
      if (fileExists) {
        const shouldOverwrite = await confirmOverwrite(outputPath);
        if (!shouldOverwrite) {
          logger.info('Operation cancelled by user');
          return;
        }
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

/**
 * Main CLI entry point
 */
export async function main(fsAdapter?: IFileSystem): Promise<void> {
  process.title = 'meld';

  // Explicitly disable debug mode by default
  process.env.DEBUG = '';
  
  // Parse command-line arguments
  const args = process.argv.slice(2);
  
  // Define options outside try block so it's accessible in catch block
  let options: CLIOptions = {
    input: '',
    format: 'markdown',
    strict: false
  };
  
  try {
    // Check for command before parsing
    let command: string | undefined;
    if (args.length > 0 && !args[0].startsWith('-') && 
        (args[0] === 'init' || 
         args[0] === 'debug-resolution' || 
         args[0] === 'debug-context' || 
         args[0] === 'debug-transform')) {
      command = args[0];
    }
    
    options = parseArgs(args);

    // Handle version flag first, before any logging
    if (options.version) {
      console.log(`meld version ${version}`);
      return;
    }

    // Handle help flag
    if (options.help) {
      displayHelp(command);
      return;
    }
    
    // Handle init command
    if (command === 'init' || options.input === 'init') {
      await initCommand();
      return;
    }
    
    // Handle debug-resolution command
    if (command === 'debug-resolution' || options.debugResolution) {
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
    if (command === 'debug-context' || options.debugContext) {
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
    if (command === 'debug-transform' || options.debugTransform) {
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
    logger.error('CLI execution failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Display error to user in a clean format
    if (process.env.NODE_ENV === 'test') {
      // Show errors with the "Error:" prefix for test expectations
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } else if (options && options.debug) {
      // Show full error details in debug mode
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } else {
      // Show simplified error in normal mode, with source location if available
      if (error instanceof MeldError) {
        if (error.filePath && error.context?.sourceLocation) {
          const sourceLocation = error.context.sourceLocation;
          console.error(`Error in ${sourceLocation.filePath}:${sourceLocation.line}: ${error.message}`);
        } else if (error.filePath) {
          console.error(`Error in ${error.filePath}: ${error.message}`);
        } else {
          console.error(`Error: ${error.message}`);
        }
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('Error:', err.message || err);
    process.exit(1);
  });
} 