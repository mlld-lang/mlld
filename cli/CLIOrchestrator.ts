import { version } from '@core/version';
import type { CLIOptions } from './index';
import { ErrorHandler } from './error/ErrorHandler';
import { UserInteraction } from './interaction/UserInteraction';
import { OutputManager } from './interaction/OutputManager';
import { HelpSystem } from './interaction/HelpSystem';
import { ArgumentParser } from './parsers/ArgumentParser';
import { OptionProcessor } from './parsers/OptionProcessor';
import { FileProcessor } from './execution/FileProcessor';
import { WatchManager } from './execution/WatchManager';
import { CommandDispatcher } from './execution/CommandDispatcher';
import { logger, cliLogger } from '@core/utils/logger';

export class CLIOrchestrator {
  private readonly errorHandler: ErrorHandler;
  private readonly userInteraction: UserInteraction;
  private readonly outputManager: OutputManager;
  private readonly helpSystem: HelpSystem;
  private readonly argumentParser: ArgumentParser;
  private readonly optionProcessor: OptionProcessor;
  private readonly fileProcessor: FileProcessor;
  private readonly watchManager: WatchManager;
  private readonly commandDispatcher: CommandDispatcher;

  constructor() {
    this.errorHandler = new ErrorHandler();
    this.userInteraction = new UserInteraction();
    this.outputManager = new OutputManager(this.userInteraction);
    this.helpSystem = new HelpSystem();
    this.argumentParser = new ArgumentParser();
    this.optionProcessor = new OptionProcessor();
    this.fileProcessor = new FileProcessor(this.userInteraction, this.optionProcessor);
    this.watchManager = new WatchManager();
    this.commandDispatcher = new CommandDispatcher();
  }

  async main(customArgs?: string[]): Promise<void> {
    process.title = 'mlld';
    
    
    let cliOptions: CLIOptions = { input: '' }; // Initialize with default

    try {
      // Explicitly disable debug mode by default
      process.env.MLLD_DEBUG = '';
      
      // Parse command-line arguments
      const args = customArgs || process.argv.slice(2);
      
      cliOptions = this.argumentParser.parseArgs(args);
      this.userInteraction.setCurrentCLIOptions(cliOptions);
      
      // Handle version flag
      if (cliOptions.version) {
        console.log(`mlld version ${version}`);
        return;
      }

      // Handle help flag
      if (cliOptions.help) {
        this.helpSystem.displayHelp(args[0]);
        return;
      }
      
      // Route execution based on command vs file processing
      await this.routeExecution(cliOptions, args);

    } catch (error: unknown) {
      // Use the centralized error handler
      await this.errorHandler.handleError(error, cliOptions);
    }
  }

  private async routeExecution(cliOptions: CLIOptions, args: string[]): Promise<void> {
    const command = cliOptions.input;
    
    // Special handling for init command with help flag
    if (command === 'init' || command === 'init-module') {
      const flags = this.parseFlags(cliOptions._ || []);
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld init [options] [module-name.mld]

Create a new mlld module file.

Interactive Creation:
  mlld init                    Prompt for module name and create <name>.mld
  
Module Creation:
  mlld init my-module.mld      Create my-module.mld with interactive setup
  
Creates .mld file with YAML frontmatter (author, description, license).
These files contain mlld code and can be published to the registry.

Options:
  -n, --name <name>           Module name (skip interactive prompt)
  -a, --author <author>       Author name
  -d, --about <description>   Module description
  -o, --output <path>         Output file path
  --skip-git                  Skip git integration
  -f, --force                 Overwrite existing files

Examples:
  mlld init                   # Prompt for module name, create interactively
  mlld init utils.mld         # Create utils.mld interactively
  mlld init --name utils --about "Utility functions" utils.mld
        `);
        return;
      }
    }
    
    // Check if this is a command
    if (this.commandDispatcher.supportsCommand(command)) {
      await this.executeCommand(command, cliOptions._ || [], cliOptions);
    } else {
      // This is file processing
      await this.processFile(cliOptions);
    }
  }

  private async executeCommand(command: string, subcommands: string[], cliOptions: CLIOptions): Promise<void> {
    await this.commandDispatcher.executeCommand(command, subcommands, cliOptions);
  }

  private async processFile(cliOptions: CLIOptions): Promise<void> {
    this.configureLogging(cliOptions);

    // Watch mode or single processing
    if (cliOptions.watch) {
      await this.watchManager.watchFiles(cliOptions, (options) => this.fileProcessor.processFile(options));
      return;
    }

    await this.fileProcessor.processFile(cliOptions);
  }

  private configureLogging(cliOptions: CLIOptions): void {
    if (cliOptions.debug) {
      // Set environment variable for child processes and imported modules
      process.env.MLLD_DEBUG = 'true';
      logger.level = 'trace';
      cliLogger.level = 'trace';
    } else if (cliOptions.verbose) {
      // Show info level messages for verbose, but no debug logs
      logger.level = 'info';
      cliLogger.level = 'info';
      process.env.MLLD_DEBUG = ''; // Explicitly disable MLLD_DEBUG
    } else {
      // Only show errors by default (no debug logs)
      logger.level = 'error';
      cliLogger.level = 'error';
      process.env.MLLD_DEBUG = ''; // Explicitly disable MLLD_DEBUG
    }
  }

  private handleGlobalOptions(cliOptions: CLIOptions): boolean {
    // Returns true if global option was handled (and should exit)
    if (cliOptions.version) {
      console.log(`mlld version ${version}`);
      return true;
    }

    if (cliOptions.help) {
      this.helpSystem.displayHelp();
      return true;
    }

    return false;
  }

  private initializeServices(): void {
    // Future enhancement: service initialization
  }

  private parseFlags(args: string[]): any {
    const flags: any = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        const key = arg.slice(1);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
      }
    }
    
    return flags;
  }
}