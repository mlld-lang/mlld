import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import { CommandUtils } from '../CommandUtils';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { resolveAliasWithCache } from '@interpreter/utils/alias-resolver';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

/**
 * Executes shell commands using async exec for true parallel execution
 */
export class ShellCommandExecutor extends BaseCommandExecutor {
  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string,
    private getBus: () => import('@interpreter/eval/pipeline/stream-bus').StreamBus
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
    const workingDirectory = options?.workingDirectory || this.workingDirectory;

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
            workingDirectory: workingDirectory,
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
            workingDirectory: workingDirectory,
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
            workingDirectory: workingDirectory,
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
            workingDirectory: workingDirectory,
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
          workingDirectory: workingDirectory,
          directiveType: context?.directiveType || 'run'
        }
      );
    }

    const streamingEnabled = Boolean(context?.streamingEnabled);
    if (streamingEnabled) {
      return await this.executeStreamingCommand(safeCommand, options, context, startTime);
    }

    // Handle stdin input if provided (exec doesn't support input option like execSync)
    const { stdout, stderr, duration } = await this.executeBufferedCommand(safeCommand, options, startTime);

    return {
      output: stdout,
      duration,
      exitCode: 0,
      stderr
    };
  }

  private async executeBufferedCommand(
    safeCommand: string,
    options: CommandExecutionOptions | undefined,
    startTime: number
  ): Promise<{ stdout: string; stderr: string; duration: number }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const workingDirectory = options?.workingDirectory || this.workingDirectory;

    // In test environments with MLLD_NO_STREAMING, suppress stderr to keep output clean
    const suppressStderr = process.env.MLLD_NO_STREAMING === 'true' || process.env.NODE_ENV === 'test';

    let finalCommand = safeCommand;
    if (options?.input) {
      // Use printf piping for stdin input
      const escapedInput = options.input.replace(/'/g, "'\\''");
      finalCommand = `printf '%s' '${escapedInput}' | ${safeCommand}`;
    } else if (!CommandUtils.hasPipeOperator(safeCommand)) {
      finalCommand = `${safeCommand} < /dev/null`;
    }

    const { stdout, stderr } = await execAsync(finalCommand, {
      encoding: 'utf8',
      cwd: workingDirectory,
      env: { ...process.env, ...(options?.env || {}) },
      maxBuffer: 10 * 1024 * 1024 // 10MB limit
    });

    if (stderr && !suppressStderr) {
      process.stderr.write(stderr);
    }

    const duration = Date.now() - startTime;
    return { stdout, stderr, duration };
  }

  private async executeStreamingCommand(
    safeCommand: string,
    options: CommandExecutionOptions | undefined,
    context: CommandExecutionContext | undefined,
    startTime: number
  ): Promise<CommandExecutionResult> {
    const workingDirectory = options?.workingDirectory || this.workingDirectory;
    const showRawStream =
      (Array.isArray(process.argv) && process.argv.includes('--show-json')) ||
      process.env.MLLD_SHOW_JSON === 'true';
    const appendTarget = (() => {
      const argv = Array.isArray(process.argv) ? process.argv : [];
      const idx = argv.indexOf('--append-json');
      if (idx === -1) return undefined;
      const candidate = argv[idx + 1];
      if (candidate && !candidate.startsWith('--')) {
        return candidate;
      }
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-stream.jsonl`;
    })();
    const appendStream = appendTarget ? fs.createWriteStream(appendTarget, { flags: 'a' }) : null;
    const bus = context?.bus ?? this.getBus();
    const pipelineId = context?.pipelineId || 'pipeline';
    const stageIndex = context?.stageIndex ?? 0;
    const parallelIndex = context?.parallelIndex;
    const streamId = context?.streamId || randomUUID();
    const env = { ...process.env, ...(options?.env || {}) };

    const child = spawn(safeCommand, {
      cwd: workingDirectory,
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let streamJsonCarry = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const chunkEffect = context?.emitEffect;

    const emitChunk = (chunk: string, source: 'stdout' | 'stderr', parsed?: boolean) => {
      if (!chunk) return;
      bus.emit({
        type: 'CHUNK',
        pipelineId,
        stageIndex,
        parallelIndex,
        chunk,
        source,
        timestamp: Date.now(),
        parsed
      });
    };

    return await new Promise<CommandExecutionResult>((resolve, reject) => {
      let settled = false;
      const debugExecIo = (process.env.MLLD_DEBUG_EXEC_IO || '').toLowerCase();
      const logStdinError = (err: NodeJS.ErrnoException, phase: 'write' | 'end') => {
        if (debugExecIo !== '1' && debugExecIo !== 'true') return;
        try {
          console.error('[mlld][exec-io] command stdin', {
            phase,
            code: err.code,
            message: err.message,
            command: safeCommand
          });
        } catch {}
      };

      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err?.code === 'EPIPE') {
          logStdinError(err, 'write');
          return;
        }
        if (settled) return;
        settled = true;
        reject(err);
      });

      if (options?.input) {
        try {
          child.stdin.write(options.input);
        } catch (err) {
          const ioErr = err as NodeJS.ErrnoException;
          if (ioErr?.code !== 'EPIPE') {
            if (!settled) {
              settled = true;
              reject(ioErr);
            }
            return;
          }
          logStdinError(ioErr, 'write');
        }
      }
      // Always end stdin to avoid hangs
      try {
        child.stdin.end();
      } catch (err) {
        const ioErr = err as NodeJS.ErrnoException;
        if (ioErr?.code !== 'EPIPE') {
          if (!settled) {
            settled = true;
            reject(ioErr);
          }
          return;
        }
        logStdinError(ioErr, 'end');
      }

      child.stdout.on('data', (data: Buffer) => {
        const text = stdoutDecoder.write(data);
        stdoutBuffer += text;
        emitChunk(text, 'stdout');
        if (chunkEffect) {
          chunkEffect(text, 'stdout');
        }
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
        reject(
          new MlldCommandExecutionError(
            `Command failed: ${err.message}`,
            context?.sourceLocation,
            {
              command: safeCommand,
              exitCode: 1,
              stderr: err.message,
              duration,
              workingDirectory: workingDirectory,
              directiveType: context?.directiveType || 'run'
            }
          )
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        const finalOut = stdoutDecoder.end();
        if (finalOut) {
          stdoutBuffer += finalOut;
          emitChunk(finalOut, 'stdout');
          if (chunkEffect) {
            chunkEffect(finalOut, 'stdout');
          }
        }
        if (streamJsonCarry) {
          stdoutBuffer += streamJsonCarry;
          emitChunk(streamJsonCarry, 'stdout');
          streamJsonCarry = '';
        }
        if (appendStream) {
          appendStream.end();
        }
        const finalErr = stderrDecoder.end();
        if (finalErr) {
          stderrBuffer += finalErr;
          emitChunk(finalErr, 'stderr');
        }
        const duration = Date.now() - startTime;

        if (code && code !== 0) {
          settled = true;
          reject(
            new MlldCommandExecutionError(
              `Command failed with exit code ${code}`,
              context?.sourceLocation,
              {
                command: safeCommand,
                exitCode: code,
                stderr: stderrBuffer,
                stdout: stdoutBuffer,
                duration,
                workingDirectory: workingDirectory,
                directiveType: context?.directiveType || 'run',
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
          exitCode: code ?? 0,
          stderr: stderrBuffer || undefined
        });
      });
    });
  }
}

function extractStreamJsonText(data: any): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  if (typeof (data as any).completion === 'string') {
    return (data as any).completion;
  }
  const delta = (data as any).delta;
  if (delta && typeof delta === 'object') {
    if (typeof delta.text === 'string') {
      return delta.text;
    }
    if (typeof delta.partial_json === 'string') {
      return delta.partial_json;
    }
  }
  if (typeof (data as any).text === 'string') {
    return (data as any).text;
  }
  return null;
}

function processStreamJsonChunk(
  chunk: string,
  carry: string
): { text: string; remainder: string; parsed: boolean; hadText: boolean } {
  const combined = (carry || '') + chunk;
  const lines = combined.split(/\r?\n/);
  const remainder = lines.pop() ?? '';
  let parsedAny = false;
  let textOut = '';
  let hadText = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      parsedAny = true;
      const text = extractStreamJsonText(parsed);
      if (text) {
        textOut += text;
        hadText = true;
      }
    } catch {
      // ignore parse errors; fall through
    }
  }

  if (!parsedAny) {
    return { text: combined, remainder: '', parsed: false, hadText: false };
  }

  return { text: hadText ? textOut : combined, remainder, parsed: true, hadText };
}
