import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import { CommandUtils } from '../CommandUtils';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { resolveAliasWithCache } from '@interpreter/utils/alias-resolver';

const execAsync = promisify(exec);

/**
 * Executes shell commands using async exec for true parallel execution
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
      let envTotalBytes = 0;
      for (const [k, v] of Object.entries(envOverrides)) {
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        const size = Buffer.byteLength(s || '', 'utf8');
        envTotalBytes += size;
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

      // Check total env payload size (sum of overrides)
      const ENV_TOTAL_MAX = (() => {
        const v = process.env.MLLD_MAX_SHELL_ENV_TOTAL_SIZE;
        if (!v) return 200 * 1024; // ~200KB default
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200 * 1024;
      })();
      if (envTotalBytes > ENV_TOTAL_MAX) {
        const biggest = Object.entries(envOverrides)
          .map(([k, v]) => ({ key: k, bytes: Buffer.byteLength((typeof v === 'string' ? v : JSON.stringify(v)) || '', 'utf8') }))
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 5)
          .map(o => `${o.key} (${o.bytes} bytes)`).join(', ');
        const message = [
          'Environment too large for /run execution (Node E2BIG safeguard).',
          `Total env override size: ${envTotalBytes} bytes (max ~${ENV_TOTAL_MAX})`,
          `Largest variables: ${biggest}`,
          'Suggestions:',
          '- Use `/run sh (@var) { echo "$var" | tool }` or `/exe ... = sh { ... }` to stream via heredocs',
          '- Pass file paths or stream via stdin (printf, here-strings)',
          '- Reduce or split the data',
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
      if (process.env.MLLD_DEBUG === 'true') {
        console.error(`[ShellCommandExecutor] Command size: ${cmdBytes} bytes, limit: ${CMD_MAX} bytes`);
      }
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

      // Combined args + env guard (approximate)
      const ARGS_ENV_MAX = (() => {
        const v = process.env.MLLD_MAX_SHELL_ARGS_ENV_TOTAL;
        if (!v) return 256 * 1024; // ~256KB default
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 256 * 1024;
      })();
      const combined = cmdBytes + envTotalBytes;
      if (combined > ARGS_ENV_MAX) {
        const message = [
          'Command + environment too large for /run execution (args+env limit).',
          `Combined size: ${combined} bytes (max ~${ARGS_ENV_MAX})`,
          'Suggestions:',
          '- Use `/run sh { ... }` or `/exe ... = bash { ... }` and pass data via heredocs/stdin',
          '- Pass file paths or split the data',
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

    // Handle stdin input if provided (exec doesn't support input option like execSync)
    let finalCommand = safeCommand;
    if (options?.input) {
      // Use printf piping for stdin input
      const escapedInput = options.input.replace(/'/g, "'\\''");
      finalCommand = `printf '%s' '${escapedInput}' | ${safeCommand}`;
    } else {
      // Provide empty stdin to prevent commands from hanging waiting for input
      finalCommand = `${safeCommand} < /dev/null`;
    }

    const { stdout, stderr } = await execAsync(finalCommand, {
      encoding: 'utf8',
      cwd: this.workingDirectory,
      env: { ...process.env, ...(options?.env || {}) },
      maxBuffer: 10 * 1024 * 1024 // 10MB limit
    });

    // async exec always captures stderr; write it to process.stderr if not suppressed
    if (stderr && !suppressStderr) {
      process.stderr.write(stderr);
    }

    const duration = Date.now() - startTime;

    return {
      output: stdout,
      duration,
      exitCode: 0
    };
  }
}
