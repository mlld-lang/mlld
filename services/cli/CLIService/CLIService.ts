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
import { IParserService } from '@services/parser/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IOutputService } from '@services/output/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ProcessOptions } from '@api/types.js';
import readline from 'readline';

/**
 * Interface for a service that handles user prompts
 */
export interface IPromptService {
  /**
   * Gets text input from the user
   * @param prompt The prompt to display to the user
   * @param defaultValue Optional default value to use if the user presses Enter without input
   * @returns The user's input
   */
  getText(prompt: string, defaultValue?: string): Promise<string>;
}

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
  private parserService: IParserService;
  private interpreterService: IInterpreterService;
  private outputService: IOutputService;
  private fileSystemService: IFileSystemService;
  private pathService: IPathService;
  private stateService: IStateService;
  private promptService: IPromptService;
  private flags: Record<string, string | boolean | undefined> = {};
  private cmdOptions: ProcessOptions = {
    output: ''
  };

  constructor(
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private outputService: IOutputService,
    private fileSystemService: IFileSystemService,
    private pathService: IPathService,
    private stateService: IStateService,
    promptService?: IPromptService
  ) {
    this.parserService = parserService;
    this.interpreterService = interpreterService;
    this.outputService = outputService;
    this.fileSystemService = fileSystemService;
    this.pathService = pathService;
    this.stateService = stateService;
    
    // Use the provided prompt service or create a default one
    this.promptService = promptService || {
      getText: async (prompt: string, defaultValue?: string): Promise<string> => {
        return new Promise((resolve) => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          rl.question(prompt, (answer) => {
            rl.close();
            // If the user just pressed Enter and we have a default value, use that
            resolve(answer.trim() || defaultValue || '');
          });
        });
      }
    };
  }

  private normalizeFormat(format: string): 'markdown' | 'xml' {
    format = format.toLowerCase();
    switch (format) {
      case 'markdown':
      case 'md':
        return 'markdown';
      case 'xml':
      default:
        return 'markdown';
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

  /**
   * Confirms whether a file should be overwritten
   */
  async confirmOverwrite(outputPath: string): Promise<{ outputPath: string; shouldOverwrite: boolean }> {
    this.debug(`confirmOverwrite: ${outputPath}`);
    
    // Check if file exists
    const exists = await this.fileSystemService.exists(outputPath);
    if (!exists) {
      this.debug(`confirmOverwrite: file does not exist, no need to overwrite`);
      return { outputPath, shouldOverwrite: true };
    }

    // For .md files, auto-redirect to .o.md unless -o is specified
    if (outputPath.endsWith('.md') && !this.cmdOptions.output) {
      const newOutputPath = outputPath.replace(/\.md$/, '.o.md');
      this.debug(`confirmOverwrite: auto-redirecting to ${newOutputPath}`);
      
      // Check if the new path exists
      if (!(await this.fileSystemService.exists(newOutputPath))) {
        return { outputPath: newOutputPath, shouldOverwrite: true };
      }
    }
    
    // If not auto-redirect or output is specified, prompt for overwrite
    const response = await this.promptService.getText(
      `File ${outputPath} already exists. Overwrite? [Y/n] `, 
      'y'
    );
    
    this.debug(`confirmOverwrite: user response: ${response}`);
    
    if (response.toLowerCase() === 'n') {
      this.debug('confirmOverwrite: user declined overwrite');
      
      // Generate incremental filename (file-1.md, file-2.md, etc.)
      const ext = this.pathService.extname(outputPath);
      const basePath = outputPath.slice(0, -ext.length);
      let counter = 1;
      let newPath = `${basePath}-${counter}${ext}`;
      
      while (this.fileSystemService.existsSync(newPath)) {
        counter++;
        newPath = `${basePath}-${counter}${ext}`;
      }
      
      return { outputPath: newPath, shouldOverwrite: true };
    }
    
    return { outputPath, shouldOverwrite: true };
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
    
    // Store the options for later use
    this.cmdOptions = {
      ...this.cmdOptions,
      output: options.output
    };

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
        options.format || 'md', // Pass the format as the third parameter
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
          const { outputPath: confirmedOutputPath, shouldOverwrite } = await this.confirmOverwrite(outputPath);
          if (!shouldOverwrite) {
            // Instead of cancelling, use an incremental filename
            const alternateOutputPath = await this.findAvailableIncrementalFilename(confirmedOutputPath);
            logger.info('Using alternative filename instead of overwriting', { path: alternateOutputPath });
            
            // Write to the alternate file
            await this.fileSystemService.writeFile(alternateOutputPath, outputContent);
            console.log(`Output written to ${alternateOutputPath}`);
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
    const inputExt = '.mld';
    const outputExt = this.getOutputExtension(options.format || 'md');
    
    // Check if the input path ends with .mld extension
    if (inputPath.endsWith(inputExt)) {
      // Default behavior: replace .mld with the output extension
      const outputPath = inputPath.substring(0, inputPath.length - inputExt.length) + outputExt;
      
      // For .md output that would overwrite input, use .o.md extension by default
      // This specifically handles the case where input file might be .md and output would also be .md
      const resolvedInputPath = await this.pathService.resolvePath(inputPath);
      const resolvedOutputPath = await this.pathService.resolvePath(outputPath);
      
      if (outputExt === '.md' && 
          await this.fileSystemService.exists(resolvedOutputPath) && 
          resolvedOutputPath === resolvedInputPath) {
        // Add .o.md suffix to avoid overwriting
        const modifiedPath = resolvedOutputPath.replace(outputExt, '.o.md');
        logger.info(`Preventing overwrite of input file, using: ${modifiedPath}`);
        return modifiedPath;
      }
      
      return resolvedOutputPath;
    } else {
      // If input doesn't end with .mld, just append the output extension
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

  /**
   * Log debug messages if verbose mode is enabled
   * @param message Message to log
   */
  private debug(message: string): void {
    if (this.cmdOptions.verbose) {
      console.log(`DEBUG: ${message}`);
    }
  }
} 