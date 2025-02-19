import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { IOutputService, type OutputFormat } from '@services/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/PathService/IPathService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { watch } from 'fs/promises';
import { dirname } from 'path';

export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'llm';
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
          options.format = args[++i] as 'markdown' | 'llm';
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
      logger.error('CLI execution failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
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
      await this.interpreterService.interpret(nodes, {
        initialState: state,
        filePath: inputPath,
        mergeState: true
      });

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
      if (options.stdout || !options.output) {
        console.log(output);
        logger.info('Successfully wrote output to stdout');
      } else {
        // If project path is set, make output path relative to it
        let outputPath = options.output;
        if (options.projectPath) {
          outputPath = `${options.projectPath}/${options.output}`;
        }
        outputPath = await this.pathService.resolvePath(outputPath);
        await this.fileSystemService.writeFile(outputPath, output);
        logger.info('Successfully wrote output to file', { outputPath });
      }
    } catch (error) {
      logger.error('Failed to process file', {
        error: error instanceof Error ? error.message : String(error),
        inputPath,
        options
      });
      throw error;
    }
  }
} 