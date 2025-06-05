import { MlldError, ErrorSeverity } from './MlldError';
import type { SourceLocation } from '@core/types';

export interface CommandExecutionDetails {
  command: string;
  exitCode: number;
  duration: number;
  stdout?: string;
  stderr?: string;
  workingDirectory: string;
  directiveType?: string;
}

export class MlldCommandExecutionError extends MlldError {
  constructor(
    message: string,
    sourceLocation?: SourceLocation,
    details?: CommandExecutionDetails
  ) {
    super(message, {
      code: 'COMMAND_EXECUTION_FAILED',
      severity: ErrorSeverity.Recoverable,
      sourceLocation,
      details
    });
  }

  /**
   * Creates a command execution error with enhanced context
   */
  static create(
    command: string,
    exitCode: number,
    duration: number,
    sourceLocation?: SourceLocation,
    additionalContext?: {
      stdout?: string;
      stderr?: string;
      workingDirectory: string;
      directiveType?: string;
    }
  ): MlldCommandExecutionError {
    const message = `Command execution failed: ${command}`;
    
    return new MlldCommandExecutionError(message, sourceLocation, {
      command,
      exitCode,
      duration,
      stdout: additionalContext?.stdout,
      stderr: additionalContext?.stderr,
      workingDirectory: additionalContext?.workingDirectory || process.cwd(),
      directiveType: additionalContext?.directiveType || 'run'
    });
  }
}