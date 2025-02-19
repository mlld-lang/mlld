import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { IOutputService, type OutputFormat } from '@services/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/PathService/IPathService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { watch } from 'fs/promises';
import { dirname } from 'path';
import { createInterface } from 'readline';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';

export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'md' | 'llm';
  stdout?: boolean;
  verbose?: boolean;
  strict?: boolean;
  config?: string;
  projectPath?: string;
  homePath?: string;
  watch?: boolean;
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

  private normalizeFormat(format: string): 'markdown' | 'llm' {
    switch (format.toLowerCase()) {
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'llm':
        return 'llm';
      default:
        throw new Error(`Invalid format: ${format}. Must be 'markdown', 'md', or 'llm'`);
    }
  }

  private getOutputExtension(format: 'markdown' | 'llm'): string {
    return format === 'markdown' ? '.md' : '.xml';
  }

  private parseArgs(args: string[]): CLIOptions {
    const options: CLIOptions = {
      input: '',
      format: 'llm'
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
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
        case '-s':
          options.strict = true;
          break;
        case '--config':
        case '-c':
          options.config = args[++i];
          break;
        case '--project-path':
        case '-p':
          options.projectPath = args[++i];
          break;
        case '--home-path':
        case '-h':
          options.homePath = args[++i];
          break;
        case '--watch':
        case '-w':
          options.watch = true;
          break;
        default:
          // If no flag is specified, treat as input file
          if (!arg.startsWith('-')) {
            options.input = arg;
          } else {
            throw new Error(`Unknown option: ${arg}`);
          }
      }
    }

    if (!options.input) {
      throw new Error('Input file is required');
    }

    return options;
  }

  private isFatalError(error: Error): boolean {
    // Parse errors are always fatal
    if (error instanceof MeldParseError) {
      return true;
    }

    // Resolution errors for missing fields/env vars are warnings
    if (error instanceof MeldResolutionError) {
      if (error.message.includes('UNDEFINED_VARIABLE')) {
        return false;
      }
    }

    // Interpreter errors for missing fields are warnings
    if (error instanceof MeldInterpreterError) {
      if (error.message.includes('UNDEFINED_VARIABLE')) {
        return false;
      }
    }

    // All other errors are fatal
    return true;
  }

  private handleError(error: Error): void {
    if (this.isFatalError(error)) {
      throw error;
    } else {
      // Log warning and continue
      logger.warn('Non-fatal error occurred', {
        error: error.message
      });
    }
  }

  async run(args: string[]): Promise<void> {
    logger.info('Starting CLI execution', { args });

    try {
      const options = this.parseArgs(args);

      if (options.verbose) {
        logger.info('Verbose mode enabled');
      }

      // If watch mode is enabled, delegate to watch method
      if (options.watch) {
        await this.watch(options);
        return;
      }

      await this.processFile(options);
    } catch (error) {
      if (error instanceof Error) {
        this.handleError(error);
      } else {
        // Unknown errors are always fatal
        logger.error('CLI execution failed', {
          error: String(error)
        });
        throw error;
      }
    }
  }

  async watch(options: CLIOptions): Promise<void> {
    logger.info('Starting watch mode', { input: options.input });

    const inputPath = await this.pathService.resolvePath(options.input);
    const watchDir = dirname(inputPath);

    try {
      const watcher = this.fileSystemService.watch(watchDir, { recursive: true });
      logger.info('Watching for changes', { directory: watchDir });

      for await (const event of watcher) {
        if (event.filename && event.filename.endsWith('.meld')) {
          logger.info('Change detected', { file: event.filename });
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

  private async processFile(options: CLIOptions): Promise<void> {
    // If project path is set, make input path relative to it
    let inputPath = options.input;
    
    try {
      // First try to resolve as an absolute path
      inputPath = await this.pathService.resolvePath(inputPath);
      
      // If file doesn't exist at absolute path, try relative to project path
      if (!await this.fileSystemService.exists(inputPath)) {
        if (options.projectPath) {
          const projectPath = `${options.projectPath}/${options.input}`;
          if (await this.fileSystemService.exists(projectPath)) {
            inputPath = projectPath;
          }
        }
        
        // If still not found, try relative to current directory
        if (!await this.fileSystemService.exists(inputPath)) {
          const relativePath = await this.pathService.resolvePath(`./${options.input}`);
          if (!await this.fileSystemService.exists(relativePath)) {
            throw new Error(`File not found: ${options.input}`);
          }
          inputPath = relativePath;
        }
      }

      // Verify file extension
      if (!inputPath.endsWith('.meld')) {
        throw new Error('Invalid file extension: File must have .meld extension');
      }

      // Read input file
      const content = await this.fileSystemService.readFile(inputPath);

      // Parse content
      const nodes = await this.parserService.parse(content);

      // Create initial state with project and home paths if provided
      const state = this.stateService.createChildState();
      if (options.projectPath) {
        state.setPathVar('PROJECTPATH', options.projectPath);
        state.setPathVar('.', options.projectPath);
      }
      if (options.homePath) {
        state.setPathVar('HOMEPATH', options.homePath);
        state.setPathVar('~', options.homePath);
      }

      // Interpret nodes
      try {
        await this.interpreterService.interpret(nodes, {
          initialState: state,
          filePath: inputPath,
          mergeState: true
        });
      } catch (error) {
        if (error instanceof Error) {
          this.handleError(error);
        } else {
          throw error;
        }
      }

      // Convert to output format
      const output = await this.outputService.convert(
        nodes,
        state,
        options.format || 'llm',
        {
          includeState: false,
          preserveFormatting: true
        }
      );

      // Write output
      if (options.stdout) {
        console.log(output);
        logger.info('Successfully wrote output to stdout');
      } else {
        // Determine output path
        let outputPath = options.output;
        
        if (!outputPath) {
          // If no output path specified, use input path with new extension
          const inputExt = '.meld';
          const outputExt = this.getOutputExtension(options.format || 'llm');
          outputPath = options.input.replace(new RegExp(`${inputExt}$`), outputExt);
        } else if (!outputPath.includes('.')) {
          // If output path has no extension, add default extension
          outputPath += this.getOutputExtension(options.format || 'llm');
        }
        
        // If project path is set, make output path relative to it
        if (options.projectPath) {
          outputPath = `${options.projectPath}/${outputPath}`;
        }
        outputPath = await this.pathService.resolvePath(outputPath);

        // Check for file overwrite
        if (await this.fileSystemService.exists(outputPath)) {
          const shouldOverwrite = await this.confirmOverwrite(outputPath);
          if (!shouldOverwrite) {
            logger.info('Operation cancelled by user');
            return;
          }
        }

        await this.fileSystemService.writeFile(outputPath, output);
        logger.info('Successfully wrote output file', { path: outputPath });
      }
    } catch (error) {
      if (error instanceof Error) {
        this.handleError(error);
      } else {
        throw error;
      }
    }
  }
} 