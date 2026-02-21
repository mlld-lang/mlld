import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { ErrorFormatSelector } from '@core/utils/errorFormatSelector';
import { logger } from '@core/utils/logger';
import type { CLIOptions } from '../index';
import { PathContextBuilder } from '@core/services/PathContextService';

export class ErrorHandler {
  private readonly fileSystem: NodeFileSystem;
  private readonly errorFormatter: ErrorFormatSelector;
  private isEphemeralMode: boolean = false;

  constructor() {
    this.fileSystem = new NodeFileSystem();
    this.errorFormatter = new ErrorFormatSelector(this.fileSystem);
    // Check if running in ephemeral mode
    this.isEphemeralMode = process.env.MLLD_EPHEMERAL === 'true' || process.env.MLLD_BINARY_NAME === 'mlldx';
  }

  async handleError(error: any, options: CLIOptions): Promise<void> {
    const isMlldError = error instanceof MlldError;
    const isCommandError = error.constructor.name === 'MlldCommandExecutionError';
    const severity = isMlldError ? error.severity : ErrorSeverity.Fatal;


    // Ensure the logger configuration matches CLI options
    logger.level = options.debug ? 'debug' : (options.verbose ? 'info' : 'warn');

    if (isMlldError) {
      await this.handleMlldError(error, options, isCommandError);
    } else if (error instanceof Error) {
      await this.handleGenericError(error, options);
    } else {
      this.handleUnknownError(error);
    }

    // Exit with error code for fatal errors or command execution errors in CLI context
    if (severity === ErrorSeverity.Fatal || isCommandError) {
      process.exit(1);
    }
  }

  private async handleMlldError(error: MlldError, options: CLIOptions, isCommandError: boolean): Promise<void> {
    // For command execution errors, also output stderr content to process stderr
    if (isCommandError && error.details && typeof error.details === 'object' && 'stderr' in error.details) {
      const stderrContent = error.details.stderr;
      if (stderrContent && typeof stderrContent === 'string' && stderrContent.trim()) {
        // Write the original stderr content to process stderr before the formatted error
        console.error(stderrContent.trim());
      }
    }

    try {
      let result: string;

      // Build path context for error display
      const pathContext = await PathContextBuilder.fromFile(
        options.input,
        this.fileSystem
      );
      
      if (isCommandError && options.showCommandContext) {
        // Enhanced formatting for command errors with full context
        result = await this.errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: pathContext.projectRoot,
          workingDirectory: pathContext.invocationDirectory,
          contextLines: 3 // More context for command errors
        });
      } else {
        // Standard formatting
        result = await this.errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: pathContext.projectRoot,
          workingDirectory: pathContext.invocationDirectory,
          contextLines: 2
        });
      }

      console.error('\n' + result + '\n');
      
      // Add ephemeral mode context if relevant
      if (this.isEphemeralMode && this.isEphemeralRelevantError(error)) {
        console.error(chalk.yellow('Note: Running in ephemeral mode (mlldx) - no filesystem caching available\n'));
      }
    } catch {
      // Fallback to basic API format if enhanced formatting fails
      const fallbackFormatter = new ErrorFormatSelector();
      const result = fallbackFormatter.formatForAPI(error);
      console.error('\n' + result.formatted + '\n');
    }
  }

  private async handleGenericError(error: Error, options: CLIOptions): Promise<void> {
    logger.debug('Generic error caught:', error);

    const { DirectiveTraceFormatter } = await import('@core/utils/DirectiveTraceFormatter');
    const formatter = new DirectiveTraceFormatter();

    const trace = (error as any).mlldTrace ?? [];
    const richContent = chalk.red.bold(error.message);

    const output = formatter.format(trace, true, undefined, richContent);
    console.error('\n' + output + '\n');

    if (this.isEphemeralMode && this.isEphemeralRelevantError(error)) {
      console.error(chalk.yellow('Note: Running in ephemeral mode (mlldx) - no filesystem caching available'));
    }

    const cause = error.cause;
    if (cause instanceof Error) {
      console.error(chalk.red(`  Cause: ${cause.message}`));
    }
  }

  private handleUnknownError(error: any): void {
    logger.error('An unknown error occurred:', { error });
    console.error(chalk.red(`Unknown Error: ${String(error)}`));
  }
  
  /**
   * Check if error is relevant to ephemeral mode
   */
  private isEphemeralRelevantError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    
    // Check for cache, persistence, or filesystem related errors
    return message.includes('cache') ||
           message.includes('lock') ||
           message.includes('permission') ||
           message.includes('eacces') ||
           message.includes('enoent') ||
           message.includes('readonly') ||
           code === 'eacces' ||
           code === 'enoent' ||
           code === 'erofs';
  }
}