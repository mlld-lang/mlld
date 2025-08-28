import { execSync } from 'child_process';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import { CommandUtils } from '../CommandUtils';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { resolveAliasWithCache } from '@interpreter/utils/alias-resolver';

/**
 * Executes shell commands using execSync
 */
export class ShellCommandExecutor extends BaseCommandExecutor {
  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string
  ) {
    super(errorUtils, workingDirectory);
  }

  async execute(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    return this.executeWithCommonHandling(
      command,
      options,
      context,
      () => this.executeShellCommand(command, options, context)
    );
  }

  private async executeShellCommand(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();

    // Check for test mocks first
    const mockResult = this.handleTestMocks(command, options);
    if (mockResult !== null) {
      return {
        output: mockResult,
        duration: Date.now() - startTime,
        exitCode: 0
      };
    }

    // Try to resolve aliases before validation
    const aliasResolution = resolveAliasWithCache(command, {
      enabled: process.env.MLLD_RESOLVE_ALIASES !== 'false',
      timeout: 2000,
      cache: true
    });

    const commandToExecute = aliasResolution.resolvedCommand;
    
    // Debug logging for alias resolution
    if (aliasResolution.wasAlias && process.env.MLLD_DEBUG_ALIASES === 'true') {
      console.error(`[mlld] Resolved alias: ${aliasResolution.originalCommand} → ${aliasResolution.resolvedCommand}`);
    }

    /**
     * Validate and parse command for safe execution
     * WHY: Shell commands can contain dangerous operators (;, &&, ||, >, <, |)
     * that enable command chaining and redirection, potentially bypassing security.
     * SECURITY: Commands are parsed and validated to ensure only simple commands
     * without shell operators are executed. This prevents command injection even
     * if tainted data reaches this point.
     * GOTCHA: Validation happens AFTER interpolation, so variables have already
     * been expanded. This is defense-in-depth, not the primary security boundary.
     * CONTEXT: Works with taint analysis and command analyzer as layered defense.
     */
    let safeCommand: string;
    try {
      safeCommand = CommandUtils.validateAndParseCommand(commandToExecute);
    } catch (error: unknown) {
      // Pass through the validation error with its detailed message
      const message = error instanceof Error ? error.message : String(error);
      throw new MlldCommandExecutionError(
        message, // Use the full error message from CommandUtils
        context?.sourceLocation,
        {
          command: commandToExecute,
          exitCode: 1,
          duration: 0,
          stderr: message,
          workingDirectory: this.workingDirectory,
          directiveType: context?.directiveType || 'run'
        }
      );
    }

    // Execute the validated command
    // In test environments with MLLD_NO_STREAMING, suppress stderr to keep output clean
    const suppressStderr = process.env.MLLD_NO_STREAMING === 'true' || process.env.NODE_ENV === 'test';
    const result = execSync(safeCommand, {
      encoding: 'utf8',
      cwd: this.workingDirectory,
      env: { ...process.env, ...(options?.env || {}) },
      maxBuffer: 10 * 1024 * 1024, // 10MB limit
      ...(options?.input ? { input: options.input } : {}),
      ...(suppressStderr ? { stdio: ['pipe', 'pipe', 'pipe'] } : {})
    });

    const duration = Date.now() - startTime;
    
    return {
      output: result,
      duration,
      exitCode: 0
    };
  }
}