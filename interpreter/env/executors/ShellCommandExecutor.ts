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

    // Friendly detection for oversized inputs in simple /run
    // 1) environment overrides (passed via options.env)
    // 2) command payload length (very large interpolated arguments)
    const envOverrides = (options?.env || {}) as Record<string, unknown>;
    const MAX_SIZE = (() => {
      const v = process.env.MLLD_MAX_SHELL_ENV_VAR_SIZE;
      if (!v) return 128 * 1024; // 128KB default
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 128 * 1024;
    })();
    try {
      const offenders: { key: string; bytes: number }[] = [];
      for (const [k, v] of Object.entries(envOverrides)) {
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        const size = Buffer.byteLength(s || '', 'utf8');
        if (size > MAX_SIZE) offenders.push({ key: k, bytes: size });
      }
      if (offenders.length > 0) {
        const details = offenders
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 5)
          .map(o => `${o.key} (${o.bytes} bytes)`).join(', ');
        const message = [
          'Environment payload too large for /run execution due to Node E2BIG safeguard.',
          `Largest variables: ${details}`,
          'Suggestions:',
          '- Use `/run sh (@varname) { echo "$varname" | tool }` for shell workflows with large data',
          '- Or define `/exe @process(data) = sh { echo "$data" | tool }` then call with @process(@varname)',
          '- Pass file paths instead of inlining huge content',
          '- Reduce variable size or split up inputs',
          '',
          'Learn more: https://mlld.ai/docs/large-variables'
        ].join('\n');
        throw new MlldCommandExecutionError(
          message,
          context?.sourceLocation,
          {
            command,
            exitCode: 1,
            duration: 0,
            stderr: message,
            workingDirectory: this.workingDirectory,
            directiveType: context?.directiveType || 'run'
          }
        );
      }

      // Check command payload size as a proxy for argument size
      const CMD_MAX = (() => {
        const v = process.env.MLLD_MAX_SHELL_COMMAND_SIZE;
        if (!v) return 128 * 1024; // 128KB default
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 128 * 1024;
      })();
      const cmdBytes = Buffer.byteLength(command || '', 'utf8');
      if (cmdBytes > CMD_MAX) {
        const message = [
          'Command payload too large for /run execution (may exceed OS args+env limits).',
          `Command size: ${cmdBytes} bytes (max ~${CMD_MAX})`,
          'Suggestions:',
          '- Use `/run sh (@varname) { echo "$varname" | tool }` for shell workflows with large data',
          '- Or define `/exe @process(data) = sh { echo "$data" | tool }` then call with @process(@varname)',
          '- Pass file paths instead of inlining huge content',
          '- Reduce variable size or split up inputs',
          '',
          'Learn more: https://mlld.ai/docs/large-variables'
        ].join('\n');
        throw new MlldCommandExecutionError(
          message,
          context?.sourceLocation,
          {
            command,
            exitCode: 1,
            duration: 0,
            stderr: message,
            workingDirectory: this.workingDirectory,
            directiveType: context?.directiveType || 'run'
          }
        );
      }
    } catch (e) {
      if (e instanceof MlldCommandExecutionError) throw e;
      // Continue if size check fails unexpectedly
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
