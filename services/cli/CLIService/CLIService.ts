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
import { dirname, basename, extname } from 'path';
import { join } from 'path';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ProcessOptions } from '@core/types/index.js';

export interface CLIOptions {
  input?: string;
  output?: string;
  format?: 'xml' | 'llmxml' | 'markdown' | 'md';
  strict?: boolean;
  stdout?: boolean;
  version?: boolean;
  verbose?: boolean;
  homePath?: string;
  debug?: boolean;
  help?: boolean;
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
      default:
        throw new Error(`Invalid format: ${format}. Must be 'markdown', 'md', or 'xml'`);
    }
  }

  private getOutputExtension(format: string): string {
    switch (format.toLowerCase()) {
      case 'markdown':
      case 'md':
        return '.md';
      case 'xml':
        return '.xml';
      default:
        return '.xml'; // Default to XML
    }
  }

  /**
   * Process CLI arguments
   */
  parseArguments(args: string[]): CLIOptions {
    const options: CLIOptions = {
      format: 'xml',
      strict: false
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
        case '--debug':
        case '-d':
          options.debug = true;
          break;
        case '--help':
        case '-h':
          options.help = true;
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
   * Run the CLI with the given arguments
   */
  public async run(args: string[]): Promise<void> {
    try {
      // Parse command line arguments
      const options = this.parseArguments(args);

      // Handle special commands
      if (options.version) {
        console.log(`meld version ${version}`);
        return;
      }

      if (options.help) {
        this.showHelp();
        return;
      }

      // Set up environment paths
      const state = this.stateService.createChildState();
      
      // Set up project path
      const projectPath = await this.pathService.resolveProjectPath();
      state.setPathVar('PROJECTPATH', projectPath);
      state.setPathVar('.', projectPath);
      
      // Set up home path if specified
      if (options.homePath) {
        state.setPathVar('HOMEPATH', options.homePath);
        state.setPathVar('~', options.homePath);
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

      // Remove watch check and directly process the file
      await this.processFile(options);
    } catch (error) {
      // For CLI errors, always log and exit with error code
      logger.error('Error running Meld CLI', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Process a file using the API
   */
  private async processFile(options: CLIOptions): Promise<void> {
    // Configure logging based on options
    if (options.verbose) {
      logger.level = 'debug';
    }

    logger.info('Starting Meld CLI', {
      version,
      options
    });

    try {
      // Check if input file exists
      const inputPath = await this.pathService.resolvePath(options.input);
      if (!(await this.fileSystemService.exists(inputPath))) {
        throw new MeldError(`File not found: ${options.input}`, {
          severity: ErrorSeverity.Fatal,
          code: 'FILE_NOT_FOUND'
        });
      }

      // Read input file
      const content = await this.fileSystemService.readFile(inputPath);
      
      // Parse content into AST
      const ast = await this.parserService.parse(content);
      
      // Interpret AST
      const interpretResult = await this.interpreterService.interpret(ast, { 
        strict: options.strict 
      });
      
      // Determine output path
      const outputPath = await this.determineOutputPath(options);
      
      // Convert to desired format
      const outputContent = await this.outputService.convert(
        ast, // Pass the AST as the first parameter
        this.stateService, // Pass the state service as the second parameter
        options.format || 'xml', // Pass the format as the third parameter
        { // Pass the options as the fourth parameter
          preserveMarkdown: options.format === 'markdown'
        }
      );

      // Write output or log to stdout
      if (options.stdout) {
        console.log(outputContent);
        logger.info('Successfully wrote output to stdout');
      } else {
        // Check if output file exists and prompt for overwrite if needed
        if (await this.fileSystemService.exists(outputPath) && !options.force) {
          const shouldOverwrite = await this.confirmOverwrite(outputPath);
          if (!shouldOverwrite) {
            logger.info('Operation cancelled by user');
            return;
          }
        }

        // Write output file
        await this.fileSystemService.writeFile(outputPath, outputContent);
        logger.info('Successfully wrote output file', { path: outputPath });
      }
    } catch (error) {
      // Convert errors to MeldError for consistent handling
      const meldError = error instanceof MeldError
        ? error
        : new MeldError(error instanceof Error ? error.message : String(error), {
            severity: ErrorSeverity.Fatal,
            code: 'PROCESSING_ERROR'
          });

      logger.error('Error processing file', {
        error: meldError.message,
        code: meldError.code,
        severity: meldError.severity
      });

      throw meldError;
    }
  }

  /**
   * Determine the output path based on CLI options
   */
  private async determineOutputPath(options: CLIOptions): Promise<string> {
    // If output path is explicitly specified, use it
    if (options.output) {
      return this.pathService.resolvePath(options.output);
    }
    
    // If no output path specified, use input path with new extension
    if (!options.input || typeof options.input !== 'string') {
      throw new MeldError('Input file path is required', {
        severity: ErrorSeverity.Fatal,
        code: 'INVALID_INPUT'
      });
    }
    
    const inputPath = options.input;
    const inputExt = '.meld';
    const outputExt = this.getOutputExtension(options.format || 'xml');
    
    // Check if the input path ends with .meld extension
    if (inputPath.endsWith(inputExt)) {
      const outputPath = inputPath.substring(0, inputPath.length - inputExt.length) + outputExt;
      return this.pathService.resolvePath(outputPath);
    } else {
      // If input doesn't end with .meld, just append the output extension
      const outputPath = inputPath + outputExt;
      return this.pathService.resolvePath(outputPath);
    }
  }

  private showHelp() {
    console.log(`
Usage: meld [options] <input-file>

Options:
  -f, --format <format>  Output format (md, markdown, llm) [default: llm]
  -o, --output <path>    Output file path [default: input filename with new extension]
  --stdout               Print to stdout instead of file
  --strict               Enable strict mode (fail on all errors)
  --permissive           Enable permissive mode (ignore recoverable errors) [default]
  --home-path <path>     Set custom home path for $~/ and $HOMEPATH
  -v, --verbose          Enable verbose output
  -d, --debug            Enable debug output
  -h, --help             Display this help message
  -V, --version          Display version information
    `);
  }
} 