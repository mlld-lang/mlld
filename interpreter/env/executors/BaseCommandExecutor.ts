import type { SourceLocation } from '@core/types';
import { MlldCommandExecutionError } from '@core/errors';
import { ErrorUtils, type CommandExecutionContext } from '../ErrorUtils';

export interface CommandExecutionOptions {
  showProgress?: boolean;
  maxOutputLines?: number;
  errorBehavior?: 'halt' | 'continue';
  timeout?: number;
  collectErrors?: boolean;
  input?: string;
  env?: Record<string, string>;
}

export interface CommandExecutionResult {
  output: string;
  duration: number;
  exitCode?: number;
}

export interface ICommandExecutor {
  /**
   * Execute a command or code with given options
   */
  execute(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;
}

/**
 * Base class for all command executors providing common execution patterns
 */
export abstract class BaseCommandExecutor implements ICommandExecutor {
  protected outputOptions: CommandExecutionOptions = {
    showProgress: true,
    maxOutputLines: undefined,
    errorBehavior: 'halt',
    timeout: 30000,
    collectErrors: false
  };

  constructor(
    protected errorUtils: ErrorUtils,
    protected workingDirectory: string
  ) {}

  /**
   * Main execution entry point - delegates to concrete implementation
   */
  abstract execute(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;

  /**
   * Common execution wrapper that handles timing, progress, and error collection
   */
  protected async executeWithCommonHandling(
    command: string,
    options: CommandExecutionOptions | undefined,
    context: CommandExecutionContext | undefined,
    executor: () => Promise<CommandExecutionResult>
  ): Promise<string> {
    // Merge with instance defaults
    const finalOptions = { ...this.outputOptions, ...options };
    const { showProgress, maxOutputLines, errorBehavior } = finalOptions;
    
    const startTime = Date.now();
    
    // Show progress if enabled
    if (showProgress) {
      console.log(`Running: ${command}`);
    }
    
    try {
      // Execute the command using the provided executor function
      const result = await executor();
      
      // Process output through error utils
      const processedResult = ErrorUtils.processOutput(result.output, maxOutputLines);
      const processed = processedResult.output.trimEnd();
      
      return processed;
      
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      
      // Create standardized error handling
      const commandError = this.createCommandExecutionError(
        error,
        command,
        duration,
        context
      );
      
      // Collect error if in continue mode or if collectErrors is enabled
      if (errorBehavior === 'continue' || finalOptions.collectErrors) {
        this.errorUtils.collectError(commandError, command, duration, context);
      }
      
      if (errorBehavior === 'halt') {
        throw commandError;
      }
      
      // Return available output for continue mode
      const output = this.extractOutputFromError(error);
      const processedResult = ErrorUtils.processOutput(output, maxOutputLines);
      return processedResult.output.trimEnd();
    }
  }

  /**
   * Create a standardized MlldCommandExecutionError from any error
   */
  protected createCommandExecutionError(
    error: unknown,
    command: string,
    duration: number,
    context?: CommandExecutionContext
  ): MlldCommandExecutionError {
    const errorDetails = {
      stdout: '',
      stderr: '',
      status: 1,
    };

    if (error && typeof error === 'object') {
      // Check for direct properties first
      if ('stdout' in error) errorDetails.stdout = String(error.stdout);
      if ('stderr' in error) errorDetails.stderr = String(error.stderr);
      
      // Check for properties in details object (for MlldCommandExecutionError)
      if ('details' in error && error.details && typeof error.details === 'object') {
        if ('stdout' in error.details) errorDetails.stdout = String(error.details.stdout);
        if ('stderr' in error.details) errorDetails.stderr = String(error.details.stderr);
        if ('exitCode' in error.details && typeof error.details.exitCode === 'number') {
          errorDetails.status = error.details.exitCode;
        }
      }
      
      if ('status' in error && typeof error.status === 'number') {
        errorDetails.status = error.status;
      } else if ('code' in error && typeof error.code === 'number') {
        errorDetails.status = error.code;
      }
    }

    // Create rich MlldCommandExecutionError with source context
    return MlldCommandExecutionError.create(
      command,
      errorDetails.status,
      duration,
      context?.sourceLocation,
      {
        stdout: errorDetails.stdout,
        stderr: errorDetails.stderr,
        workingDirectory: this.workingDirectory,
        directiveType: context?.directiveType || 'run'
      }
    );
  }

  /**
   * Extract available output from an error for continue mode
   */
  protected extractOutputFromError(error: unknown): string {
    if (error && typeof error === 'object') {
      // Check if stdout exists and is non-empty
      if ('stdout' in error && typeof error.stdout === 'string' && error.stdout.length > 0) {
        return error.stdout;
      }
      // Return stderr if stdout is empty or doesn't exist
      if ('stderr' in error && typeof error.stderr === 'string') {
        return error.stderr;
      }
    }
    return '';
  }

  /**
   * Mock command execution for test environments
   */
  protected handleTestMocks(command: string, options?: CommandExecutionOptions): string | null {
    if (process.env.MLLD_TEST_MODE !== 'true') {
      return null;
    }

    // Common test mocks
    if (command === 'npm --version') {
      return '11.3.0';
    }
    
    if (command.startsWith('sed ')) {
      // Simple sed mock for the format command
      if (command.includes('\'s/^/> /\'')) {
        // Read from stdin and prefix each line with "> "
        const input = options?.input || '';
        // Debug logging
        if (process.env.DEBUG_PIPELINE) {
          console.log('SED MOCK: input=', JSON.stringify(input), 'options=', options);
        }
        return input.split('\n').map(line => `> ${line}`).join('\n');
      }
    }

    return null;
  }
}