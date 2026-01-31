import type { CLIOptions } from '../index';
import * as path from 'path';

export interface ParsedCLIArguments {
  command?: string;
  subcommands: string[];
  options: CLIOptions;
  remainingArgs: string[];
}

export class ArgumentParser {
  private readonly commandsWithSubcommands = [
    'auth', 'registry', 'install', 'i', 'ls', 'list', 'info', 'show', 'docs',
    'publish', 'init', 'module', 'mod', 'add-needs', 'needs', 'deps',
    'setup', 'alias', 'keychain', 'vars', 'env', 'dev', 'test', 'run', 'error-test', 'clean',
    'mcp', 'serve', 'language-server', 'lsp', 'nvim-setup', 'nvim', 'nvim-doctor', 'verify',
    'howto', 'ht', 'qs', 'quickstart', 'validate', 'analyze',
    'update', 'outdated'
  ];

  parseArgs(args: string[]): CLIOptions {
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

    // Store remaining args after command
    options._ = [];
    const payloadFlags: Record<string, unknown> = {};
    
    // Flag to stop parsing when we hit a command with subcommands
    let stopParsing = false;

    // Handle special debug commands
    args = this.handleSpecialCommands(args, options);

    // Handle context debug options
    args = this.handleContextDebugOptions(args, options);

    for (let i = 0; i < args.length; i++) {
      if (stopParsing) break;
      
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
        case '--mode':
          options.mode = this.normalizeMode(args[++i]);
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
        case '--loose':
        case '--markdown':
        case '--md':
        case '--prose': // hidden alias, will conflict with OpenProse in future
          options.mode = 'markdown';
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
        // Output management options
        case '--max-output-lines':
          options.maxOutputLines = parseInt(args[++i]);
          if (isNaN(options.maxOutputLines) || options.maxOutputLines < 0) {
            throw new Error('--max-output-lines must be a positive number');
          }
          break;
        case '--show-progress':
          options.showProgress = true;
          break;
        case '--no-progress':
          options.showProgress = false;
          break;
        case '--error-behavior':
          const behavior = args[++i];
          if (behavior !== 'halt' && behavior !== 'continue') {
            throw new Error('--error-behavior must be "halt" or "continue"');
          }
          options.errorBehavior = behavior;
          break;
        case '--collect-errors':
          options.collectErrors = true;
          break;
        case '--show-command-context':
          options.showCommandContext = true;
          break;
        case '--command-timeout':
          options.commandTimeout = parseInt(args[++i]);
          if (isNaN(options.commandTimeout) || options.commandTimeout < 0) {
            throw new Error('--command-timeout must be a positive number (milliseconds)');
          }
          break;
        // Import approval bypass options
        case '--risky-approve-all':
          options.riskyApproveAll = true;
          break;
        case '--yolo':
          options.yolo = true;
          break;
        case '-y':
          options.y = true;
          break;
        // Blank line normalization
        case '--no-normalize-blank-lines':
          options.noNormalizeBlankLines = true;
          break;
        // Disable prettier formatting
        case '--no-format':
          options.noFormat = true;
          break;
        // Error capture for pattern development
        case '--capture-errors':
          options.captureErrors = true;
          break;
        // Ephemeral mode for CI/serverless
        case '--ephemeral':
          options.ephemeral = true;
          break;
        // Streaming options
        case '--no-stream':
          options.noStream = true;
          break;
        case '--json':
        case '--show-json':
          options.json = true;
          options.showJson = true;
          break;
        case '--structured':
          options.structured = true;
          break;
        // Streaming visibility options
        case '--show-thinking':
          options.showThinking = true;
          break;
        case '--show-tools':
          options.showTools = true;
          break;
        case '--show-metadata':
          options.showMetadata = true;
          break;
        case '--show-all-streaming':
          options.showAllStreaming = true;
          break;
        case '--stream-format': {
          const format = args[++i];
          if (format !== 'text' && format !== 'ansi' && format !== 'json') {
            throw new Error('--stream-format must be "text", "ansi", or "json"');
          }
          options.streamOutputFormat = format;
          break;
        }
        case '--inject':
        case '--payload': {
          // Multiple flags allowed: --inject @config={"key":"val"} --payload @data=@file.json
          const injectValue = args[++i];
          if (!options.inject) options.inject = [];
          options.inject.push(injectValue);
          break;
        }
        case '--append-json': {
          const candidate = args[i + 1];
          if (candidate && !candidate.startsWith('-')) {
            options.appendJson = candidate;
            i++;
          } else {
            options.appendJson = ''; // signal default naming
          }
          break;
        }
        // Environment file path
        case '--env':
          options.env = args[++i];
          break;
        // Allow absolute paths outside project root
        case '--allow-absolute':
          options.allowAbsolute = true;
          break;
        // Transformation is always enabled by default
        // No transform flags needed
        default:
          if (!arg.startsWith('-') && !options.input) {
            options.input = arg;
            // If this is a command that can have subcommands, stop parsing here
            if (this.commandsWithSubcommands.includes(arg)) {
              // Store remaining args
              options._ = args.slice(i + 1);
              stopParsing = true;
              break;
            }
          } else if (!arg.startsWith('-') && options.input && this.commandsWithSubcommands.includes(options.input)) {
            // This is a subcommand for a command that supports them, stop parsing
            // Store this arg and remaining args
            options._ = args.slice(i);
            stopParsing = true;
            break;
          } else if (arg.startsWith('-') && options.input && !this.commandsWithSubcommands.includes(options.input)) {
            const parsed = this.parseCustomFlag(arg, args[i + 1]);
            if (!parsed) {
              throw new Error(`Unknown option: ${arg}`);
            }
            payloadFlags[parsed.key] = parsed.value;
            if (parsed.consumed) {
              i++;
            }
          } else {
            throw new Error(`Unknown option: ${arg}`);
          }
      }
    }

    this.attachPayloadInject(options, payloadFlags);
    this.validateOptions(options);
    return options;
  }

  private handleSpecialCommands(args: string[], options: CLIOptions): string[] {
    let modifiedArgs = [...args];

    // Check for debug-resolution command
    if (modifiedArgs.length > 0 && modifiedArgs[0] === 'debug-resolution') {
      options.debugResolution = true;
      modifiedArgs = modifiedArgs.slice(1);
    }

    // Check for debug-transform command
    if (modifiedArgs.length > 0 && modifiedArgs[0] === 'debug-transform') {
      options.debugTransform = true;
      modifiedArgs = modifiedArgs.slice(1);
    }

    // Check for debug-context command
    if (modifiedArgs.length > 0 && modifiedArgs[0] === 'debug-context') {
      options.debugContext = true;
      modifiedArgs = modifiedArgs.slice(1);
    }

    return modifiedArgs;
  }

  private handleContextDebugOptions(args: string[], options: CLIOptions): string[] {
    let modifiedArgs = [...args];

    // Add context debug options
    if (modifiedArgs.includes('--debug-context')) {
      options.debugContext = true;
      modifiedArgs = modifiedArgs.filter(arg => arg !== '--debug-context');
    }

    // Handle visualization type
    const vizTypeIndex = modifiedArgs.findIndex(arg => arg === '--viz-type');
    if (vizTypeIndex !== -1 && vizTypeIndex < modifiedArgs.length - 1) {
      const vizType = modifiedArgs[vizTypeIndex + 1];
      if (['hierarchy', 'variable-propagation', 'combined', 'timeline'].includes(vizType)) {
        options.visualizationType = vizType as 'hierarchy' | 'variable-propagation' | 'combined' | 'timeline';
      } else {
        console.error(`Invalid visualization type: ${vizType}. Using default.`);
      }
      modifiedArgs.splice(vizTypeIndex, 2);
    }

    // Handle root state ID
    const rootStateIdIndex = modifiedArgs.findIndex(arg => arg === '--root-state-id');
    if (rootStateIdIndex !== -1 && rootStateIdIndex < modifiedArgs.length - 1) {
      options.rootStateId = modifiedArgs[rootStateIdIndex + 1];
      modifiedArgs.splice(rootStateIdIndex, 2);
    }

    // Include vars option
    if (modifiedArgs.includes('--no-vars')) {
      options.includeVars = false;
      modifiedArgs = modifiedArgs.filter(arg => arg !== '--no-vars');
    }

    // Include timestamps option
    if (modifiedArgs.includes('--no-timestamps')) {
      options.includeTimestamps = false;
      modifiedArgs = modifiedArgs.filter(arg => arg !== '--no-timestamps');
    }

    // Include file paths option
    if (modifiedArgs.includes('--no-file-paths')) {
      options.includeFilePaths = false;
      modifiedArgs = modifiedArgs.filter(arg => arg !== '--no-file-paths');
    }

    return modifiedArgs;
  }

  validateOptions(options: CLIOptions): void {
    // Version and help can be used without an input file
    if (!options.input && !options.version && !options.help) {
      throw new Error('No input file specified');
    }
  }

  normalizeFormat(format?: string): 'markdown' | 'xml' {
    if (!format) return 'markdown'; // Default to markdown, not llm
    
    switch (format.toLowerCase()) {
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'xml':
      case 'llm':
        return 'xml';
      default:
        console.warn(`Warning: Unknown format '${format}', defaulting to markdown`);
        return 'markdown';
    }
  }

  normalizeMode(mode?: string): 'strict' | 'markdown' | undefined {
    if (!mode) return undefined;
    const normalized = mode.toLowerCase();
    if (normalized === 'strict' || normalized === 'markdown') {
      return normalized as 'strict' | 'markdown';
    }
    throw new Error("Invalid mode. Use 'strict' or 'markdown'.");
  }

  detectSpecialCommands(args: string[]): string[] {
    const specialCommands = ['debug-resolution', 'debug-transform', 'debug-context'];
    return args.filter(arg => specialCommands.includes(arg));
  }

  supportsSubcommands(command: string): boolean {
    return this.commandsWithSubcommands.includes(command);
  }

  private parseCustomFlag(
    arg: string,
    nextArg?: string
  ): { key: string; value: unknown; consumed: boolean } | null {
    if (!arg.startsWith('-')) return null;
    const rawKey = arg.startsWith('--') ? arg.slice(2) : arg.slice(1);
    if (!rawKey) return null;
    // Convert kebab-case to camelCase (e.g., dry-run -> dryRun)
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (nextArg !== undefined && !nextArg.startsWith('-')) {
      return { key, value: nextArg, consumed: true };
    }
    return { key, value: true, consumed: false };
  }

  private attachPayloadInject(options: CLIOptions, payloadFlags: Record<string, unknown>): void {
    if (!options.input) return;
    if (this.commandsWithSubcommands.includes(options.input)) return;
    if (Object.keys(payloadFlags).length === 0) return;

    if (!options.inject) options.inject = [];
    options.inject.push(`@payload=${JSON.stringify(payloadFlags)}`);
  }

}
