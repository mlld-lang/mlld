import * as path from 'path';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { ErrorFormatSelector } from '@core/utils/errorFormatSelector';
import { logger } from '@core/utils/logger';
import type { CLIOptions } from '../index';

export class ErrorHandler {
  private readonly fileSystem: NodeFileSystem;
  private readonly errorFormatter: ErrorFormatSelector;

  constructor() {
    this.fileSystem = new NodeFileSystem();
    this.errorFormatter = new ErrorFormatSelector(this.fileSystem);
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

      if (isCommandError && options.showCommandContext) {
        // Enhanced formatting for command errors with full context
        result = await this.errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: path.resolve(path.dirname(options.input)),
          workingDirectory: process.cwd(),
          contextLines: 3 // More context for command errors
        });
      } else {
        // Standard formatting
        result = await this.errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: path.resolve(path.dirname(options.input)),
          workingDirectory: process.cwd(),
          contextLines: 2
        });
      }

      console.error('\n' + result + '\n');
    } catch {
      // Fallback to basic API format if enhanced formatting fails
      const fallbackFormatter = new ErrorFormatSelector();
      const result = fallbackFormatter.formatForAPI(error);
      console.error('\n' + result.formatted + '\n');
    }
  }

  private async handleGenericError(error: Error, options: CLIOptions): Promise<void> {
    logger.error('An unexpected error occurred:', error);

    // Check for mlld trace on regular errors
    if ((error as any).mlldTrace) {
      const { DirectiveTraceFormatter } = await import('@core/utils/DirectiveTraceFormatter');
      const formatter = new DirectiveTraceFormatter();

      // Check if this is an import error that's already shown in the trace
      const hasImportError = (error as any).mlldTrace.some((t: any) => t.failed);

      // Format with error message for non-import errors
      const trace = formatter.format(
        (error as any).mlldTrace,
        true,
        hasImportError ? undefined : error.message
      );

      // Show the formatted error box
      const fileName = path.basename(options.input || 'unknown');
      console.error(`\nThere was an error running ${fileName}\n`);
      console.error(trace);
      console.error('');
    } else {
      // No trace, show the error normally
      console.error('\n  ⎿  ' + chalk.red('Error: ') + error.message);
    }

    const cause = error.cause;
    if (cause instanceof Error) {
      console.error(chalk.red(`  Cause: ${cause.message}`));
    }

    // Only show stack trace in verbose mode (for now we'll skip it)
    // TODO: Add --verbose flag support
    // if (error.stack && options.verbose) {
    //   console.error(chalk.gray(error.stack));
    // }
  }

  private handleUnknownError(error: any): void {
    logger.error('An unknown error occurred:', { error });
    console.error(chalk.red(`Unknown Error: ${String(error)}`));
  }
}