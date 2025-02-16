import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { IOutputService } from '@services/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/PathService/IPathService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { cliLogger as logger } from '@core/utils/logger.js';

export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'md' | 'llm';
  stdout?: boolean;
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
    // Skip first two args (node and script path)
    args = args.slice(2);

    const options: CLIOptions = {
      input: '',
      stdout: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--input':
        case '-i':
          options.input = args[++i];
          break;
        case '--output':
        case '-o':
          options.output = args[++i];
          break;
        case '--format':
        case '-f':
          options.format = args[++i] as 'md' | 'llm';
          if (options.format !== 'md' && options.format !== 'llm') {
            throw new Error('Format must be either "md" or "llm"');
          }
          break;
        case '--stdout':
          options.stdout = true;
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

      // Resolve input path
      const inputPath = await this.pathService.resolvePath(options.input);
      
      // Verify input file exists
      if (!await this.fileSystemService.exists(inputPath)) {
        throw new Error(`File not found: ${inputPath}`);
      }

      // Read input file
      const content = await this.fileSystemService.readFile(inputPath);

      // Parse content
      const nodes = await this.parserService.parse(content);

      // Create initial state
      const state = this.stateService.createState();

      // Interpret nodes
      await this.interpreterService.interpret(nodes, {
        initialState: state,
        filePath: inputPath
      });

      // Convert to output format
      const output = await this.outputService.convert(state, {
        format: options.format || 'llm'
      });

      // Write output
      if (options.stdout || !options.output) {
        console.log(output);
        logger.info('Successfully wrote output to stdout');
      } else {
        const outputPath = await this.pathService.resolvePath(options.output);
        await this.fileSystemService.writeFile(outputPath, output);
        logger.info('Successfully wrote output to file', { outputPath });
      }
    } catch (error) {
      logger.error('CLI execution failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
} 