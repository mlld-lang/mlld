import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import type { NodeShadowEnvironment } from '../NodeShadowEnvironment';
import { prepareParamsForShadow, createMlldHelpers } from '../variable-proxy';
import { enhanceJSError } from '@core/errors/patterns/init';
import { addImplicitReturn } from './implicit-return';
import { randomUUID } from 'crypto';

export interface NodeShadowEnvironmentProvider {
  /**
   * Get the Node.js shadow environment instance
   */
  getNodeShadowEnv(): NodeShadowEnvironment | undefined;
  
  /**
   * Get or create Node.js shadow environment instance
   */
  getOrCreateNodeShadowEnv(): NodeShadowEnvironment;
  
  /**
   * Get current file path for determining execution directory
   */
  getCurrentFilePath(): string | undefined;
}

/**
 * Executes Node.js code using VM-based shadow environment or subprocess fallback
 */
export class NodeExecutor extends BaseCommandExecutor {
  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string,
    private nodeShadowProvider: NodeShadowEnvironmentProvider,
    private getBus: () => import('@interpreter/eval/pipeline/stream-bus').StreamBus
  ) {
    super(errorUtils, workingDirectory);
  }

  async execute(
    code: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext,
    params?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<string> {
    
    // For Node.js execution, always halt on errors (don't use continue behavior)
    // This ensures that Node.js errors propagate properly for testing and error handling
    const nodeOptions = { ...options, errorBehavior: 'halt' as const };
    return this.executeWithCommonHandling(
      `node: ${code.substring(0, 50)}...`,
      nodeOptions,
      context,
      () => this.executeNodeCode(code, params, metadata, context, nodeOptions)
    );
  }

  private async executeNodeCode(
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    context?: CommandExecutionContext,
    options?: CommandExecutionOptions
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const workingDirectory = options?.workingDirectory || this.workingDirectory;
    const resolvedWorkingDirectory = workingDirectory && fs.existsSync(workingDirectory)
      ? workingDirectory
      : process.cwd();
    let normalizedCode = code;

    try {
      normalizedCode = addImplicitReturn(code);
      const streamingEnabled = Boolean(context?.streamingEnabled);
      if (!streamingEnabled) {
        return await this.executeNodeInProcess(
          normalizedCode,
          params,
          metadata,
          startTime,
          context,
          resolvedWorkingDirectory
        );
      }

      return await this.executeNodeSubprocessStreaming(
        normalizedCode,
        params,
        metadata,
        startTime,
        context,
        resolvedWorkingDirectory
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      let originalError = errorMessage;
      if (originalError.includes('Node shadow environment error:')) {
        originalError = originalError.replace('Node shadow environment error: ', '');
      }
      if (!originalError.trim() && typeof errorStack === 'string') {
        const stackMatch = errorStack.match(/Error:\s*([^\n]+)/);
        if (stackMatch?.[1]) {
          originalError = stackMatch[1];
        }
      }

      const enhanced = enhanceJSError(
        error as Error,
        normalizedCode,
        params,
        { language: 'node' }
      );
      const finalMessage = enhanced?.message || `Node.js error: ${originalError}`;

      const enrichedError = error instanceof Error ? error : new Error(originalError || 'Node.js execution failed');
      if (enrichedError instanceof Error) {
        enrichedError.message = finalMessage;
      }
      if (typeof enrichedError === 'object') {
        (enrichedError as any).stderr = originalError;
        (enrichedError as any).details = {
          ...(enrichedError as any).details,
          stderr: originalError,
          exitCode: 1,
          workingDirectory: resolvedWorkingDirectory,
          directiveType: context?.directiveType || 'exec'
        };
      }

      throw enrichedError;
    }
  }
  private async executeNodeInProcess(
    code: string,
    params: Record<string, any> | undefined,
    metadata: Record<string, any> | undefined,
    startTime: number,
    context?: CommandExecutionContext,
    workingDirectory?: string
  ): Promise<CommandExecutionResult> {
    const previousCwd = process.cwd();
    const targetCwd = workingDirectory || previousCwd;
    const shouldRestoreCwd = Boolean(targetCwd && previousCwd !== targetCwd);

    if (shouldRestoreCwd) {
      process.chdir(targetCwd);
    }

    try {
      // Always use shadow environment for Node.js execution
      const nodeShadowEnv = this.nodeShadowProvider.getOrCreateNodeShadowEnv();

      // Extract and handle captured shadow environments
      const capturedEnvs = params?.__capturedShadowEnvs;
      if (params && '__capturedShadowEnvs' in params) {
        delete params.__capturedShadowEnvs;
      }

      // Prepare parameters with Variable proxies
      const sanitizedParams = params ? { ...params } : undefined;
      let shadowParams = sanitizedParams;

      if (sanitizedParams) {
        shadowParams = prepareParamsForShadow(sanitizedParams);
        const primitiveMetadata = (shadowParams as any).__mlldPrimitiveMetadata;
        if (primitiveMetadata) {
          delete (shadowParams as any).__mlldPrimitiveMetadata;
        }
        // Also add mlld helpers with metadata
        if (!shadowParams.mlld) {
          const mergedMetadata = {
            ...(metadata as Record<string, any> | undefined),
            ...(primitiveMetadata || {})
          };
          const helperMetadata = Object.keys(mergedMetadata || {}).length ? mergedMetadata : undefined;
          shadowParams.mlld = createMlldHelpers(helperMetadata);
        }
      }

      // Merge captured shadow environments if they exist
      if (capturedEnvs) {
        const nodeEnv = capturedEnvs.node || capturedEnvs.nodejs;
        if (nodeEnv) {
          nodeShadowEnv.mergeCapturedFunctions(nodeEnv);
        }
      }

      // Use shadow environment with VM
      const result = await nodeShadowEnv.execute(code, shadowParams, {
        passthroughConsole: context?.directiveType !== 'run'
      });

      // Format result (same as subprocess version)
      let output = '';
      if (result !== undefined) {
        if (typeof result === 'object') {
          output = JSON.stringify(result);
        } else {
          output = String(result);
        }
      }

      const duration = Date.now() - startTime;
      return {
        output,
        duration,
        exitCode: 0
      };
    } finally {
      if (shouldRestoreCwd) {
        process.chdir(previousCwd);
      }
    }
  }

  private async executeNodeSubprocessStreaming(
    code: string,
    params: Record<string, any> | undefined,
    metadata: Record<string, any> | undefined,
    startTime: number,
    context?: CommandExecutionContext,
    workingDirectory?: string
  ): Promise<CommandExecutionResult> {
    const bus = context?.bus ?? this.getBus();
    const pipelineId = context?.pipelineId || 'pipeline';
    const stageIndex = context?.stageIndex ?? 0;
    const parallelIndex = context?.parallelIndex;
    const streamId = context?.streamId || randomUUID();

    const tmpFile = path.join(os.tmpdir(), `mlld_exec_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
    const shadowParams = params ? prepareParamsForShadow(params) : undefined;
    const paramJson = shadowParams ? JSON.stringify(shadowParams) : '{}';

    const script = `
const __mlldParams = ${paramJson};
Object.assign(global, __mlldParams);

(async () => {
  try {
    const __mlldResult = await (async () => {
${code}
    })();
    if (typeof __mlldResult !== 'undefined') {
      const out = typeof __mlldResult === 'object' ? JSON.stringify(__mlldResult) : String(__mlldResult);
      if (out) process.stdout.write(out);
    }
  } catch (err) {
    const message = err && err.stack ? err.stack : String(err);
    process.stderr.write(message);
    process.exit(1);
  }
})();
`;

    await fs.promises.writeFile(tmpFile, script, 'utf8');

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

      const child = spawn('node', [tmpFile], {
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
            `Node.js execution failed: ${err.message}`,
            context?.sourceLocation,
            {
              command: 'node',
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

      child.on('close', async (code) => {
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
          // ignore cleanup
        }

        if (settled) return;
        if (code && code !== 0) {
          settled = true;
          reject(
            new MlldCommandExecutionError(
              `Node.js execution failed with exit code ${code}`,
              context?.sourceLocation,
              {
                command: 'node',
                exitCode: code,
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
          exitCode: code ?? 0,
          stderr: stderrBuffer || undefined
        });
      });
    });
  }

  // executeNodeSubprocess removed in favor of streaming spawn path
}
