import { execSync, spawn } from 'child_process';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import { CommandUtils } from '../CommandUtils';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { getStreamBus } from '@interpreter/eval/pipeline/stream-bus';
import { StringDecoder } from 'string_decoder';

/**
 * Executes shell commands using execSync
 */
export class ShellCommandExecutor extends BaseCommandExecutor {
  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string,
    private getStreamingOptions: () => { mode: 'off'|'full'|'progress'; dest: 'stdout'|'stderr'|'auto'; noTty?: boolean }
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
      safeCommand = CommandUtils.validateAndParseCommand(command);
    } catch (error: unknown) {
      // Pass through the validation error with its detailed message
      const message = error instanceof Error ? error.message : String(error);
      throw new MlldCommandExecutionError(
        message, // Use the full error message from CommandUtils
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

    // Decide streaming
    const streaming = this.getStreamingOptions();
    if (streaming.mode === 'full' || streaming.mode === 'progress') {
      // Stream via spawn
      const sh = process.env.SHELL || 'sh';
      const child = spawn(sh, ['-lc', safeCommand], {
        cwd: this.workingDirectory,
        env: { ...process.env, ...(options?.env || {}) },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdoutBuf = '';
      let stderrBuf = '';
      const decoderOut = new StringDecoder('utf8');
      const decoderErr = new StringDecoder('utf8');

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = decoderOut.write(chunk);
        stdoutBuf += text;
        try { getStreamBus().publish({ type: 'CHUNK', stage: 0, source: 'stdout', text }); } catch {}
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = decoderErr.write(chunk);
        stderrBuf += text;
        try { getStreamBus().publish({ type: 'CHUNK', stage: 0, source: 'stderr', text }); } catch {}
      });

      // Timeout handling
      const timeoutMs = options?.timeout || 30000;
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        try { child.kill('SIGTERM'); } catch {}
      }, timeoutMs);

      const exitCode: number = await new Promise((resolve, reject) => {
        child.on('error', (err) => reject(err));
        child.on('close', (code) => resolve(code ?? 0));
      });
      clearTimeout(timer);

      const duration = Date.now() - startTime;
      if (killed || exitCode !== 0) {
        const err = new MlldCommandExecutionError(
          `Shell command failed${killed ? ' (timeout)' : ''}`,
          context?.sourceLocation,
          {
            command: safeCommand,
            exitCode: killed ? 124 : exitCode,
            duration,
            stderr: stderrBuf,
            stdout: stdoutBuf,
            workingDirectory: this.workingDirectory,
            directiveType: context?.directiveType || 'run'
          }
        );
        throw err;
      }

      return { output: stdoutBuf, duration, exitCode: 0 };
    }

    // Non-streaming default path (synchronous)
    const result = execSync(safeCommand, {
      encoding: 'utf8',
      cwd: this.workingDirectory,
      env: { ...process.env, ...(options?.env || {}) },
      maxBuffer: 10 * 1024 * 1024, // 10MB limit
      timeout: options?.timeout || 30000,
      ...(options?.input ? { input: options.input } : {})
    });

    const duration = Date.now() - startTime;
    return { output: result, duration, exitCode: 0 };
  }
}
