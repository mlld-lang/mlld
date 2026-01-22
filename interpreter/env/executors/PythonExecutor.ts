import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { randomUUID } from 'crypto';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { generatePythonMlldHelpers, convertToPythonValue } from '../python-variable-helpers';
import { MlldCommandExecutionError } from '@core/errors';
import type { PythonShadowEnvironment } from '../PythonShadowEnvironment';

export interface ShellCommandExecutor {
  /**
   * Execute a shell command
   */
  execute(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;
}

export interface PythonShadowEnvironmentProvider {
  /**
   * Get the Python shadow environment instance
   */
  getPythonShadowEnv(): PythonShadowEnvironment | undefined;

  /**
   * Get or create Python shadow environment instance
   */
  getOrCreatePythonShadowEnv(): PythonShadowEnvironment;
}

/**
 * Executes Python code using temporary files and python3 subprocess,
 * or using the shadow environment when available.
 * Supports streaming output via StreamBus.
 */
export class PythonExecutor extends BaseCommandExecutor {
  private pythonShadowProvider?: PythonShadowEnvironmentProvider;
  private getBus: () => import('@interpreter/eval/pipeline/stream-bus').StreamBus;

  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string,
    private shellExecutor: ShellCommandExecutor,
    pythonShadowProvider?: PythonShadowEnvironmentProvider,
    getBus?: () => import('@interpreter/eval/pipeline/stream-bus').StreamBus
  ) {
    super(errorUtils, workingDirectory);
    this.pythonShadowProvider = pythonShadowProvider;
    this.getBus = getBus || (() => {
      // Lazy import to avoid circular dependencies
      const { StreamBus } = require('@interpreter/eval/pipeline/stream-bus');
      return new StreamBus();
    });
  }

  /**
   * Set the Python shadow environment provider
   */
  setPythonShadowProvider(provider: PythonShadowEnvironmentProvider): void {
    this.pythonShadowProvider = provider;
  }

  async execute(
    code: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext,
    params?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.executeWithCommonHandling(
      `python: ${code.substring(0, 50)}...`,
      options,
      context,
      () => this.executePythonCode(code, params, metadata, options, context)
    );
  }

  private async executePythonCode(
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const streamingEnabled = Boolean(context?.streamingEnabled);

    // Check if we have a shadow environment with functions defined
    const pythonShadowEnv = this.pythonShadowProvider?.getPythonShadowEnv();
    const shadowFunctionDefs = pythonShadowEnv && pythonShadowEnv.getFunctionNames().length > 0
      ? pythonShadowEnv.generateFunctionDefinitions()
      : '';

    // Use streaming path if enabled
    if (streamingEnabled) {
      return this.executePythonSubprocessStreaming(
        code,
        params,
        metadata,
        startTime,
        context,
        options?.workingDirectory,
        shadowFunctionDefs
      );
    }

    // Non-streaming path
    if (shadowFunctionDefs) {
      return this.executePythonWithShadowEnv(code, params, metadata, options, context, pythonShadowEnv!);
    }

    return this.executePythonSubprocess(code, params, metadata, options, context);
  }

  /**
   * Execute Python code with streaming output
   */
  private async executePythonSubprocessStreaming(
    code: string,
    params: Record<string, any> | undefined,
    metadata: Record<string, any> | undefined,
    startTime: number,
    context?: CommandExecutionContext,
    workingDirectory?: string,
    shadowFunctionDefs?: string
  ): Promise<CommandExecutionResult> {
    const bus = context?.bus ?? this.getBus();
    const pipelineId = context?.pipelineId || 'pipeline';
    const stageIndex = context?.stageIndex ?? 0;
    const parallelIndex = context?.parallelIndex;
    const streamId = context?.streamId || randomUUID();

    const tmpFile = path.join(os.tmpdir(), `mlld_exec_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);

    // Build Python code
    let pythonCode = generatePythonMlldHelpers(metadata) + '\n';

    // Add shadow function definitions if available
    if (shadowFunctionDefs) {
      pythonCode += shadowFunctionDefs + '\n';
    }

    // Add parameters
    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        pythonCode += convertToPythonValue(value, key) + '\n';
      }
    }

    pythonCode += '\n# User code:\n' + code;

    await fs.promises.writeFile(tmpFile, pythonCode, 'utf8');

    return await new Promise<CommandExecutionResult>((resolve, reject) => {
      let settled = false;
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const emitChunk = (chunk: string, source: 'stdout' | 'stderr') => {
        if (!chunk) return;
        bus.emit({
          type: 'CHUNK',
          pipelineId,
          stageIndex,
          parallelIndex,
          chunk,
          source,
          timestamp: Date.now()
        });
      };

      const child = spawn('python3', [tmpFile], {
        cwd: workingDirectory || this.workingDirectory,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.stdout.on('data', (data: Buffer) => {
        const text = stdoutDecoder.write(data);
        stdoutBuffer += text;
        emitChunk(text, 'stdout');
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = stderrDecoder.write(data);
        stderrBuffer += text;
        emitChunk(text, 'stderr');
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        const duration = Date.now() - startTime;
        fs.promises.unlink(tmpFile).catch(() => {});
        reject(
          new MlldCommandExecutionError(
            `Python execution failed: ${err.message}`,
            context?.sourceLocation,
            {
              command: 'python3',
              exitCode: 1,
              stderr: err.message,
              duration,
              workingDirectory: workingDirectory || this.workingDirectory,
              directiveType: context?.directiveType || 'exec',
              streamId
            }
          )
        );
      });

      child.on('close', async (exitCode) => {
        const finalOut = stdoutDecoder.end();
        if (finalOut) {
          stdoutBuffer += finalOut;
          emitChunk(finalOut, 'stdout');
        }
        const finalErr = stderrDecoder.end();
        if (finalErr) {
          stderrBuffer += finalErr;
          emitChunk(finalErr, 'stderr');
        }

        const duration = Date.now() - startTime;
        try {
          await fs.promises.unlink(tmpFile);
        } catch {
          // ignore cleanup errors
        }

        if (settled) return;
        if (exitCode && exitCode !== 0) {
          settled = true;
          const errorMessage = this.formatPythonError(stderrBuffer);
          reject(
            new MlldCommandExecutionError(
              errorMessage,
              context?.sourceLocation,
              {
                command: 'python3',
                exitCode,
                stderr: stderrBuffer,
                stdout: stdoutBuffer,
                duration,
                workingDirectory: workingDirectory || this.workingDirectory,
                directiveType: context?.directiveType || 'exec',
                streamId
              }
            )
          );
          return;
        }

        settled = true;
        resolve({
          output: stdoutBuffer,
          duration,
          exitCode: exitCode ?? 0,
          stderr: stderrBuffer || undefined
        });
      });
    });
  }

  /**
   * Execute Python code using the shadow environment
   */
  private async executePythonWithShadowEnv(
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext,
    pythonShadowEnv?: PythonShadowEnvironment
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const workingDirectory = options?.workingDirectory || this.workingDirectory;

    try {
      const result = await pythonShadowEnv!.execute(code, params, metadata);

      const duration = Date.now() - startTime;

      // Format result
      let output = '';
      if (result !== undefined && result !== null) {
        if (typeof result === 'object') {
          output = JSON.stringify(result, null, 2);
        } else {
          output = String(result);
        }
      }

      return {
        output,
        duration,
        exitCode: 0
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      let stderr = '';
      if (error instanceof Error) {
        stderr = error.message;
        if ((error as any).traceback) {
          stderr += '\n' + (error as any).traceback;
        }
      } else {
        stderr = String(error);
      }

      const errorMessage = this.formatPythonError(stderr);

      throw new MlldCommandExecutionError(
        errorMessage,
        context?.sourceLocation,
        {
          command: 'python3 (shadow)',
          exitCode: 1,
          duration,
          stdout: '',
          stderr,
          workingDirectory,
          directiveType: context?.directiveType || 'exec'
        }
      );
    }
  }

  /**
   * Execute Python code using subprocess (original implementation)
   */
  private async executePythonSubprocess(
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `mlld_exec_${Date.now()}.py`);

    try {
      // Build Python code with parameters
      let pythonCode = '';

      // Add mlld helpers for Variable access
      pythonCode += generatePythonMlldHelpers(metadata) + '\n';

      if (params && typeof params === 'object') {
        for (const [key, value] of Object.entries(params)) {
          // Always use Variable-aware conversion
          pythonCode += convertToPythonValue(value, key) + '\n';
        }
      }
      pythonCode += '\n# User code:\n' + code;

      // Write to temp file
      fs.writeFileSync(tmpFile, pythonCode);

      // Execute Python using the shell executor
      const result = await this.shellExecutor.execute(`python3 ${tmpFile}`, options, context);

      const duration = Date.now() - startTime;
      return {
        output: result,
        duration,
        exitCode: 0
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const workingDirectory = options?.workingDirectory || this.workingDirectory;

      // Extract error details from the shell executor error
      let stderr = '';
      let stdout = '';
      let exitCode = 1;

      if (error && typeof error === 'object') {
        if ('stderr' in error) stderr = String(error.stderr);
        if ('stdout' in error) stdout = String(error.stdout);
        if ('details' in error && error.details && typeof error.details === 'object') {
          if ('stderr' in error.details) stderr = String(error.details.stderr);
          if ('stdout' in error.details) stdout = String(error.details.stdout);
          if ('exitCode' in error.details && typeof error.details.exitCode === 'number') {
            exitCode = error.details.exitCode;
          }
        }
        if ('status' in error && typeof error.status === 'number') {
          exitCode = error.status;
        }
      }

      // Fall back to error message if no stderr
      if (!stderr && error instanceof Error) {
        stderr = error.message;
      }

      // Extract Python error type from stderr for better error messages
      const errorMessage = this.formatPythonError(stderr);

      throw new MlldCommandExecutionError(
        errorMessage,
        context?.sourceLocation,
        {
          command: 'python3',
          exitCode,
          duration,
          stdout,
          stderr,
          workingDirectory,
          directiveType: context?.directiveType || 'exec'
        }
      );
    } finally {
      // Clean up temp file
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  /**
   * Format Python error messages for better readability.
   * Extracts the error type and message from Python traceback.
   */
  private formatPythonError(stderr: string): string {
    if (!stderr) {
      return 'Python execution failed';
    }

    // Try to extract the Python exception type and message from the traceback
    // Python tracebacks end with a line like: "ErrorType: message"
    const lines = stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1];

    // Match patterns like "SyntaxError: ...", "NameError: ...", "ZeroDivisionError: ..."
    const errorMatch = lastLine.match(/^(\w+Error):\s*(.*)$/);
    if (errorMatch) {
      const [, errorType, errorMsg] = errorMatch;
      return `Python ${errorType}: ${errorMsg}`;
    }

    // Match patterns like "SyntaxError: invalid syntax" with no colon sometimes
    const simpleErrorMatch = lastLine.match(/^(\w+Error)$/);
    if (simpleErrorMatch) {
      return `Python ${simpleErrorMatch[1]}`;
    }

    // If we can't parse it, return a generic message with the last line
    return `Python execution failed: ${lastLine}`;
  }
}
