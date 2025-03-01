import '@core/di-config.js';

import { main as apiMain } from '@api/index.js';
import { version } from '@core/version.js';
import { cliLogger as logger } from '@core/utils/logger.js';
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
  outputFormat?: 'json' | 'text';
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
        options.variableName = args[++i];
        break;
      case '--output-format':
        options.outputFormat = args[++i] as 'json' | 'text';
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

  console.log(`
Usage: meld [command] [options] <input-file>

Commands:
  init                    Create a new Meld project
  debug-resolution        Debug variable resolution in a Meld file

Options:
  -f, --format <format>   Output format: md, markdown, xml, llm [default: llm]
  -o, --output <path>     Output file path
  --stdout                Print to stdout instead of file
  --strict                Enable strict mode (fail on all errors)
  --permissive            Enable permissive mode (ignore recoverable errors) [default]
  --home-path <path>      Custom home path for ~/ substitution
  -v, --verbose           Enable verbose output
  -d, --debug             Enable debug output
  -w, --watch             Watch for changes and reprocess
  -h, --help              Display this help message
  -V, --version           Display version information
  `);
}

/**
 * Prompt for file overwrite confirmation
 */
async function confirmOverwrite(filePath: string): Promise<boolean> {
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
      logger.info('Successfully wrote output to stdout');
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
      logger.info('Successfully wrote output file', { path: outputPath });
    }
  } catch (error) {
    // Convert to MeldError if needed
    const meldError = error instanceof MeldError 
      ? error 
      : new MeldError(error instanceof Error ? error.message : String(error), {
          severity: ErrorSeverity.Fatal,
          code: 'PROCESSING_ERROR'
        });
    
    // Log the error
    logger.error('Error processing file', {
      error: meldError.message,
      code: meldError.code,
      severity: meldError.severity
    });
    
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
  
  // Use the common processing function
  await processFileWithOptions(options, apiOptions);
}

/**
 * Main CLI entry point
 */
export async function main(fsAdapter?: IFileSystem): Promise<void> {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    // Check for command before parsing
    let command: string | undefined;
    if (args.length > 0 && !args[0].startsWith('-') && 
        (args[0] === 'init' || args[0] === 'debug-resolution')) {
      command = args[0];
    }
    
    const options = parseArgs(args);

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
      await debugResolutionCommand({
        filePath: options.input,
        variableName: options.variableName,
        watchMode: options.watch,
        outputFormat: options.outputFormat
      });
      return;
    }

    // Configure logging based on options
    if (options.verbose) {
      logger.level = 'debug';
    } else if (options.debug) {
      logger.level = 'trace';
    } else {
      logger.level = 'info';
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
    
    // Display error to user
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    
    // Exit with error code for non-test environments
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    } else {
      // For tests, rethrow to be caught by the test runner
      throw error;
    }
  }
} 