import type { CommandExecutionOptions, ICommandExecutor } from './BaseCommandExecutor';
import { ShellCommandExecutor } from './ShellCommandExecutor';
import { JavaScriptExecutor, type ShadowEnvironment } from './JavaScriptExecutor';
import { NodeExecutor, type NodeShadowEnvironmentProvider } from './NodeExecutor';
import { PythonExecutor, type ShellCommandExecutor as IShellCommandExecutor } from './PythonExecutor';
import { BashExecutor, type VariableProvider } from './BashExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';

export interface ExecutorDependencies {
  errorUtils: ErrorUtils;
  workingDirectory: string;
  getStreamingOptions: () => { mode: 'off'|'full'|'progress'; dest: 'stdout'|'stderr'|'auto'; noTty?: boolean };
  shadowEnvironment: ShadowEnvironment;
  nodeShadowProvider: NodeShadowEnvironmentProvider;
  variableProvider: VariableProvider;
}

/**
 * Factory for creating and managing command executors based on language/context
 */
export class CommandExecutorFactory {
  private shellExecutor: ShellCommandExecutor;
  private jsExecutor: JavaScriptExecutor;
  private nodeExecutor: NodeExecutor;
  private pythonExecutor: PythonExecutor;
  private bashExecutor: BashExecutor;

  constructor(dependencies: ExecutorDependencies) {
    const { errorUtils, workingDirectory, shadowEnvironment, nodeShadowProvider, variableProvider } = dependencies;

    // Create all executor instances
    this.shellExecutor = new ShellCommandExecutor(errorUtils, workingDirectory, dependencies.getStreamingOptions);
    this.jsExecutor = new JavaScriptExecutor(errorUtils, workingDirectory, shadowEnvironment);
    this.nodeExecutor = new NodeExecutor(errorUtils, workingDirectory, nodeShadowProvider);
    this.pythonExecutor = new PythonExecutor(errorUtils, workingDirectory, this.shellExecutor);
    this.bashExecutor = new BashExecutor(errorUtils, workingDirectory, variableProvider);
  }

  /**
   * Execute a shell command
   */
  async executeCommand(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    // If shell mode is explicitly disabled, use strict simple executor
    const disableSh = (() => {
      const v = (process.env.MLLD_DISABLE_SH || '').toLowerCase();
      return v === '1' || v === 'true' || v === 'on' || v === 'yes';
    })();

    // Proactively detect oversized payloads and fall back to BashExecutor
    // Rationale: Node's exec/spawn environment+argv limits (~200KB) can be hit
    // for large interpolated values in simple /run commands or env overrides.
    // BashExecutor streams code via stdin and supports heredoc injection for
    // large variables, avoiding E2BIG.
    if (!disableSh) {
      try {
        const envOverrides = (options?.env || {}) as Record<string, unknown>;

        // Thresholds match ShellCommandExecutor defaults so behavior is consistent
        const MAX_ENV_VAR = (() => {
          const v = process.env.MLLD_MAX_SHELL_ENV_VAR_SIZE;
          if (!v) return 128 * 1024; // 128KB default
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : 128 * 1024;
        })();
        const MAX_ENV_TOTAL = (() => {
          const v = process.env.MLLD_MAX_SHELL_ENV_TOTAL_SIZE;
          if (!v) return 200 * 1024; // ~200KB default
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200 * 1024;
        })();
        const MAX_CMD = (() => {
          const v = process.env.MLLD_MAX_SHELL_COMMAND_SIZE;
          if (!v) return 128 * 1024; // 128KB default
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : 128 * 1024;
        })();
        const MAX_ARGS_ENV = (() => {
          const v = process.env.MLLD_MAX_SHELL_ARGS_ENV_TOTAL;
          if (!v) return 256 * 1024; // ~256KB default
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : 256 * 1024;
        })();

        // Compute sizes
        let envTotalBytes = 0;
        let hasLargeEnvVar = false;
        for (const [, v] of Object.entries(envOverrides)) {
          const s = typeof v === 'string' ? v : JSON.stringify(v);
          const size = Buffer.byteLength(s || '', 'utf8');
          envTotalBytes += size;
          if (size > MAX_ENV_VAR) hasLargeEnvVar = true;
        }

        const cmdBytes = Buffer.byteLength(command || '', 'utf8');
        const combined = cmdBytes + envTotalBytes;

        const shouldFallback = (
          hasLargeEnvVar ||
          envTotalBytes > MAX_ENV_TOTAL ||
          cmdBytes > MAX_CMD ||
          combined > MAX_ARGS_ENV
        );

        if (shouldFallback) {
          // Validate the simple command (ensure no dangerous shell operators)
          const safe = (() => {
            try {
              return require('../CommandUtils').CommandUtils.validateAndParseCommand(command);
            } catch (e) {
              // If validation fails, rethrow to be handled by ShellCommandExecutor as before
              throw e;
            }
          })();

          // Route via BashExecutor with minimal params so we don't inject
          // all ambient variables. If caller provided env overrides, pass
          // those as params to leverage heredoc injection when needed.
          const params = options?.env && Object.keys(options.env).length > 0
            ? (options.env as Record<string, any>)
            : {};

          if (process.env.MLLD_DEBUG === 'true') {
            try {
              console.error('[CommandExecutorFactory] Falling back to BashExecutor due to size limits:', {
                cmdBytes,
                envTotalBytes,
                MAX_ENV_VAR,
                MAX_ENV_TOTAL,
                MAX_CMD,
                MAX_ARGS_ENV,
              });
            } catch {}
          }

          return this.bashExecutor.execute(safe, options, context, params);
        }
      } catch (precheckError) {
        // If any error occurs during pre-check, proceed with normal execution
      }
    }

    // Normal path: strict simple executor
    return this.shellExecutor.execute(command, options, context);
  }

  /**
   * Execute code in a specific language
   */
  async executeCode(
    code: string,
    language: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    const executor = this.getCodeExecutor(language);
    
    if (!executor) {
      throw new Error(`Unsupported code language: ${language}`);
    }

    // Different executors have different signatures, so we need to handle this
    if (executor === this.jsExecutor) {
      return this.jsExecutor.execute(code, options, context, params, metadata);
    } else if (executor === this.nodeExecutor) {
      return this.nodeExecutor.execute(code, options, context, params, metadata);
    } else if (executor === this.pythonExecutor) {
      return this.pythonExecutor.execute(code, options, context, params, metadata);
    } else if (executor === this.bashExecutor) {
      return this.bashExecutor.execute(code, options, context, params, metadata);
    }

    // Fallback (shouldn't reach here)
    return executor.execute(code, options, context);
  }

  /**
   * Get the appropriate executor for a given language
   */
  private getCodeExecutor(language: string): ICommandExecutor | null {
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
        return this.jsExecutor;
      
      case 'node':
      case 'nodejs':
        return this.nodeExecutor;
      
      case 'python':
      case 'py':
        return this.pythonExecutor;
      
      case 'bash':
      case 'sh':
      case 'shell':
        return this.bashExecutor;
      
      case 'mlld-when':
      case 'mlld-foreach':
      case 'mlld-for':
        // Special case: mlld-native executables are handled elsewhere, not by a code executor
        // This shouldn't reach here, but return null to trigger special handling
        return null;
      
      default:
        return null;
    }
  }

  /**
   * Get the shell executor for direct access
   */
  getShellExecutor(): ShellCommandExecutor {
    return this.shellExecutor;
  }

  /**
   * Get the JavaScript executor for direct access
   */
  getJavaScriptExecutor(): JavaScriptExecutor {
    return this.jsExecutor;
  }

  /**
   * Get the Node executor for direct access
   */
  getNodeExecutor(): NodeExecutor {
    return this.nodeExecutor;
  }

  /**
   * Get the Python executor for direct access
   */
  getPythonExecutor(): PythonExecutor {
    return this.pythonExecutor;
  }

  /**
   * Get the Bash executor for direct access
   */
  getBashExecutor(): BashExecutor {
    return this.bashExecutor;
  }
}
