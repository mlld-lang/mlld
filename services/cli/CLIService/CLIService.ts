/**
 * CLIService - A thin wrapper around the API
 * 
 * This service provides backward compatibility with code that depends on CLIService
 * but delegates the actual processing to the API.
 */

import { main as apiMain } from '@api/index.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { version } from '@core/version.js';
import { createInterface } from 'readline';
import { dirname } from 'path';
import { watch } from 'fs/promises';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ProcessOptions } from '@core/types/index.js';

export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'md' | 'xml' | 'llm';
  stdout?: boolean;
  verbose?: boolean;
  strict?: boolean;
  homePath?: string;
  watch?: boolean;
  version?: boolean;
  debug?: boolean;
}

export interface ICLIService {
  run(args: string[]): Promise<void>;
}

export class CLIService implements ICLIService {
  constructor(
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private outputService: IOutputService,
    private fileSystemService: IFileSystemService,
    private pathService: IPathService,
    private stateService: IStateService
  ) {}

  private normalizeFormat(format: string): 'markdown' | 'xml' {
    format = format.toLowerCase();
    switch (format) {
      case 'markdown':
      case 'md':
        return 'markdown';
      case 'xml':
      case 'llm': // For backward compatibility
        return 'xml';
      default:
        throw new Error(`Invalid format: ${format}. Must be 'markdown', 'md', 'xml', or 'llm'`);
    }
  }

  private getOutputExtension(format: 'markdown' | 'xml'): string {
    return format === 'markdown' ? '.md' : '.xml';
  }

  private parseArgs(args: string[]): CLIOptions {
    const options: CLIOptions = {
      input: '',
      format: 'xml',
      strict: false // Default to permissive mode for CLI
    };

    // Skip 'node' and 'meld' executable names if present at the beginning
    let startIndex = 0;
    if (args.length > 0 && (args[0] === 'node' || args[0] === 'meld')) {
      startIndex = 1;
      // If second arg is 'meld', skip that too (handles both 'node meld' and just 'meld')
      if (args.length > 1 && args[1] === 'meld') {
        startIndex = 2;
      }
    }

    // Process all arguments starting from the appropriate index
    for (let i = startIndex; i < args.length; i++) {
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
          options.format = this.normalizeFormat(args[++i]);
          break;
        case '--stdout':
          options.stdout = true;
          break;
        case '--verbose':
        case '-v':
          options.verbose = true;
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
        case '--debug':
        case '-d':
          options.debug = true;
          break;
        case '--help':
        case '-h':
          options.version = true; // Show version along with help
          console.log(`
Usage: meld [options] <input-file>

Options:
  -f, --format <format>  Output format (md, markdown, llm) [default: llm]
  -o, --output <path>    Output file path [default: input filename with new extension]
  --stdout               Print to stdout instead of file
  --strict               Enable strict mode (fail on all errors)
  --permissive           Enable permissive mode (ignore recoverable errors) [default]
  --home-path <path>     Set custom home path for $~/ and $HOMEPATH
  -w, --watch            Watch for file changes
  -v, --verbose          Enable verbose output
  -d, --debug            Enable debug output
  -h, --help             Display this help message
  -V, --version          Display version information
          `);
          break;
        default:
          if (!arg.startsWith('-') && !options.input) {
            options.input = arg;
          } else {
            throw new Error(`Unknown option: ${arg}`);
          }
      }
    }

    if (!options.input && !options.version) {
      throw new Error('No input file specified');
    }

    return options;
  }

  /**
   * Convert CLI options to API options
   */
  private cliToApiOptions(cliOptions: CLIOptions): ProcessOptions {
    return {
      format: cliOptions.format,
      debug: cliOptions.debug,
      strict: cliOptions.strict,
      transformation: true, // Enable transformation by default for CLI usage
      fs: this.fileSystemService.getFileSystem()
    };
  }

  private async confirmOverwrite(path: string): Promise<boolean> {
    if (!await this.fileSystemService.exists(path)) {
      return true;
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`File ${path} already exists. Overwrite? [Y/n] `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() !== 'n');
      });
    });
  }

  /**
   * Run the CLIService with the provided arguments
   */
  async run(args: string[]): Promise<void> {
    try {
      // Parse CLI arguments
      const options = this.parseArgs(args);

      // Handle version flag first
      if (options.version) {
        console.log(`meld version ${version}`);
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

      logger.info('Starting Meld CLI', {
        version,
        options
      });

      if (options.watch) {
        await this.watchFile(options);
      } else {
        await this.processFile(options);
      }
    } catch (error) {
      // For CLI errors, always log and exit with error code
      logger.error('Error running Meld CLI', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Print user-friendly error message to console
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Rethrow the error
      throw error;
    }
  }

  /**
   * Watch for file changes and reprocess
   */
  private async watchFile(options: CLIOptions): Promise<void> {
    logger.info('Starting watch mode', { input: options.input });

    try {
      // Resolve input path
      const inputPath = await this.pathService.resolvePath(options.input);
      const watchDir = dirname(inputPath);
      
      console.log(`Watching for changes in ${watchDir}...`);
      const watcher = watch(watchDir, { recursive: true });

      for await (const event of watcher) {
        // Only process .meld files or the specific input file
        if (event.filename?.endsWith('.meld')) {
          console.log(`Change detected in ${event.filename}, reprocessing...`);
          await this.processFile(options);
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
   * Process a file using the API
   */
  private async processFile(options: CLIOptions): Promise<void> {
    try {
      // Convert CLI options to API options
      const apiOptions = this.cliToApiOptions(options);
      
      // Process the file through the API
      const result = await apiMain(options.input, apiOptions);
      
      // Handle output based on CLI options
      if (options.stdout) {
        console.log(result);
        logger.info('Successfully wrote output to stdout');
      } else {
        // Determine output path
        let outputPath = options.output;
        
        if (!outputPath) {
          // If no output path specified, use input path with new extension
          const inputExt = '.meld';
          const outputExt = this.getOutputExtension(options.format || 'xml');
          outputPath = options.input.replace(new RegExp(`${inputExt}$`), outputExt);
        } else if (!outputPath.includes('.')) {
          // If output path has no extension, add default extension
          outputPath += this.getOutputExtension(options.format || 'xml');
        }
        
        // Resolve output path
        outputPath = await this.pathService.resolvePath(outputPath);

        // Check for file overwrite
        if (await this.fileSystemService.exists(outputPath)) {
          const shouldOverwrite = await this.confirmOverwrite(outputPath);
          if (!shouldOverwrite) {
            logger.info('Operation cancelled by user');
            return;
          }
        }

        await this.fileSystemService.writeFile(outputPath, result);
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
      
      // Rethrow to be caught by the main run method
      throw meldError;
    }
  }
} 