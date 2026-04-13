import type { CommandExecutionOptions, ICommandExecutor } from './BaseCommandExecutor';
import { ShellCommandExecutor } from './ShellCommandExecutor';
import { JavaScriptExecutor, type ShadowEnvironment } from './JavaScriptExecutor';
import { NodeExecutor, type NodeShadowEnvironmentProvider } from './NodeExecutor';
import { PythonExecutor, type ShellCommandExecutor as IShellCommandExecutor, type PythonShadowEnvironmentProvider } from './PythonExecutor';
import { BashExecutor, type VariableProvider } from './BashExecutor';
import { CommandUtils } from '../CommandUtils';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { ErrorUtils as ErrorUtilsClass } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { appendAuditEvent } from '@core/security/AuditLogger';
import { makeSecurityDescriptor } from '@core/types/security';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import { requiresHostShellExecution } from '@interpreter/utils/alias-resolver';
import type { ShellSession } from '@services/fs/ShellSession';
import type { WorkspaceValue } from '@core/types/workspace';
import type { IFileSystemService } from '@services/fs/IFileSystemService';

export interface WorkspaceProvider {
  getActiveWorkspace(): WorkspaceValue | undefined;
  isToolAllowed?(toolName: string, rawToolName?: string): boolean;
  getExeLabels?(): readonly string[] | undefined;
  getEnclosingExeLabels?(): readonly string[];
  hasExeLabel?(label: string): boolean;
}

interface SecuritySnapshotLike {
  labels?: readonly string[];
  taint?: readonly string[];
  sources?: readonly string[];
}

interface AuditCapableWorkspaceProvider extends WorkspaceProvider {
  getFileSystemService?: () => IFileSystemService;
  getProjectRoot?: () => string;
  getSecuritySnapshot?: () => SecuritySnapshotLike | undefined;
}

type WorkspaceChangeType = 'created' | 'modified' | 'deleted';

interface WorkspaceSnapshotEntry {
  type: WorkspaceChangeType;
  entity: 'file' | 'directory';
  content?: string;
}

type WorkspaceSnapshot = Map<string, WorkspaceSnapshotEntry>;

export interface ExecutorDependencies {
  errorUtils: ErrorUtils;
  workingDirectory: string;
  shadowEnvironment: ShadowEnvironment;
  nodeShadowProvider: NodeShadowEnvironmentProvider;
  pythonShadowProvider?: PythonShadowEnvironmentProvider;
  variableProvider: VariableProvider;
  getStreamingBus: () => import('@interpreter/eval/pipeline/stream-bus').StreamBus;
  workspaceProvider: WorkspaceProvider;
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
  private hostBashExecutor: BashExecutor;
  private readonly workspaceProvider: WorkspaceProvider;
  private readonly errorUtils: ErrorUtils;
  private readonly defaultWorkingDirectory: string;

  constructor(dependencies: ExecutorDependencies) {
    const {
      errorUtils,
      workingDirectory,
      shadowEnvironment,
      nodeShadowProvider,
      pythonShadowProvider,
      variableProvider,
      getStreamingBus,
      workspaceProvider
    } = dependencies;

    this.workspaceProvider = workspaceProvider;
    this.errorUtils = errorUtils;
    this.defaultWorkingDirectory = workingDirectory;

    // Create all executor instances
    this.shellExecutor = new ShellCommandExecutor(errorUtils, workingDirectory, getStreamingBus);
    this.jsExecutor = new JavaScriptExecutor(errorUtils, workingDirectory, shadowEnvironment);
    this.nodeExecutor = new NodeExecutor(errorUtils, workingDirectory, nodeShadowProvider, getStreamingBus);
    this.pythonExecutor = new PythonExecutor(errorUtils, workingDirectory, this.shellExecutor, pythonShadowProvider, getStreamingBus);
    this.bashExecutor = new BashExecutor(
      errorUtils,
      workingDirectory,
      variableProvider,
      getStreamingBus,
      workspaceProvider
    );
    this.hostBashExecutor = new BashExecutor(
      errorUtils,
      workingDirectory,
      variableProvider,
      getStreamingBus
    );
  }

  /**
   * Execute a shell command
   */
  async executeCommand(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    const activeWorkspace = this.workspaceProvider.getActiveWorkspace();
    if (activeWorkspace) {
      if (this.isWorkspaceLlmInvocation(context)) {
        return this.executeWorkspaceLlmCommand(activeWorkspace, command, options, context);
      }
      return this.executeWorkspaceCommand(activeWorkspace, command, options, context);
    }

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
              return CommandUtils.validateAndParseCommand(
                command,
                CommandUtils.resolveGuidanceContext(context?.directiveType)
              );
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

  private isWorkspaceLlmInvocation(context?: CommandExecutionContext): boolean {
    const contextLabels = Array.isArray(context?.exeLabels) ? context!.exeLabels : [];
    if (contextLabels.some(label => typeof label === 'string' && label.trim().toLowerCase() === 'llm')) {
      return true;
    }
    const envLabels = this.workspaceProvider.getExeLabels?.() ?? [];
    if (envLabels.some(label => typeof label === 'string' && label.trim().toLowerCase() === 'llm')) {
      return true;
    }
    if (this.workspaceProvider.hasExeLabel?.('llm')) {
      return true;
    }
    const opStackLabels = this.workspaceProvider.getEnclosingExeLabels?.() ?? [];
    return opStackLabels.some(label => typeof label === 'string' && label.trim().toLowerCase() === 'llm');
  }

  private async executeWorkspaceLlmCommand(
    workspace: WorkspaceValue,
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    let beforeSnapshot: WorkspaceSnapshot | undefined;
    let writesRecorded = false;

    try {
      beforeSnapshot = await this.captureWorkspaceSnapshot(workspace);
      const result = await this.shellExecutor.execute(command, options, context);

      if (beforeSnapshot) {
        await this.recordWorkspaceCommandWrites(workspace, beforeSnapshot, command);
        writesRecorded = true;
      }

      return result;
    } catch (error) {
      if (beforeSnapshot && !writesRecorded) {
        try {
          await this.recordWorkspaceCommandWrites(workspace, beforeSnapshot, command);
        } catch {
          // Best-effort audit logging for workspace command writes.
        }
      }
      throw error;
    }
  }

  private async executeWorkspaceCommand(
    workspace: WorkspaceValue,
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    const finalOptions = {
      showProgress: false,
      maxOutputLines: undefined,
      errorBehavior: 'halt',
      collectErrors: false,
      ...options
    };
    const startTime = Date.now();
    const workingDirectory = options?.workingDirectory || this.defaultWorkingDirectory;

    if (finalOptions.showProgress) {
      console.log(`Running: ${command}`);
    }

    let beforeSnapshot: WorkspaceSnapshot | undefined;
    let writesRecorded = false;
    try {
      beforeSnapshot = await this.captureWorkspaceSnapshot(workspace);
      const shellSession = await this.getOrCreateShellSession(workspace);
      const result = await shellSession.exec(command, {
        env: options?.env,
        cwd: options?.workingDirectory,
        stdin: options?.input
      });

      if (beforeSnapshot) {
        await this.recordWorkspaceCommandWrites(workspace, beforeSnapshot, command);
        writesRecorded = true;
      }

      const duration = Date.now() - startTime;
      if (result.exitCode !== 0) {
        throw MlldCommandExecutionError.create(
          command,
          result.exitCode,
          duration,
          context?.sourceLocation,
          {
            stdout: result.stdout,
            stderr: result.stderr,
            workingDirectory: options?.workingDirectory || shellSession.getCwd(),
            directiveType: context?.directiveType || 'run'
          }
        );
      }

      const processed = ErrorUtilsClass.processOutput(
        result.stdout,
        finalOptions.maxOutputLines
      ).output;
      return processed.trimEnd();
    } catch (error: unknown) {
      if (beforeSnapshot && !writesRecorded) {
        try {
          await this.recordWorkspaceCommandWrites(workspace, beforeSnapshot, command);
        } catch {
          // Best-effort audit logging for workspace command writes.
        }
      }

      const duration = Date.now() - startTime;
      const commandError =
        error instanceof MlldCommandExecutionError
          ? error
          : MlldCommandExecutionError.create(
              command,
              1,
              duration,
              context?.sourceLocation,
              {
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
                workingDirectory,
                directiveType: context?.directiveType || 'run'
              }
            );

      if (finalOptions.errorBehavior === 'continue' || finalOptions.collectErrors) {
        this.errorUtils.collectError(commandError, command, duration, context);
      }

      if (finalOptions.errorBehavior === 'halt') {
        throw commandError;
      }

      const fallbackOutput =
        typeof commandError.details?.stdout === 'string' && commandError.details.stdout.length > 0
          ? commandError.details.stdout
          : String(commandError.details?.stderr || '');
      const processed = ErrorUtilsClass.processOutput(
        fallbackOutput,
        finalOptions.maxOutputLines
      ).output;
      return processed.trimEnd();
    }
  }

  private async captureWorkspaceSnapshot(workspace: WorkspaceValue): Promise<WorkspaceSnapshot> {
    const [changes, patch] = await Promise.all([
      workspace.fs.changes(),
      Promise.resolve(workspace.fs.export())
    ]);

    const contentByPath = new Map<string, string>();
    for (const entry of patch.entries) {
      if (entry.op === 'write') {
        contentByPath.set(entry.path, entry.content);
      }
    }

    const snapshot: WorkspaceSnapshot = new Map();
    for (const change of changes) {
      snapshot.set(change.path, {
        type: change.type,
        entity: change.entity,
        content: contentByPath.get(change.path)
      });
    }
    return snapshot;
  }

  private detectWorkspaceWrites(
    before: WorkspaceSnapshot,
    after: WorkspaceSnapshot
  ): Array<{ path: string; changeType: WorkspaceChangeType }> {
    const writes: Array<{ path: string; changeType: WorkspaceChangeType }> = [];
    for (const [path, next] of after.entries()) {
      const previous = before.get(path);
      if (!previous) {
        writes.push({ path, changeType: next.type });
        continue;
      }

      if (next.type !== previous.type || next.entity !== previous.entity) {
        writes.push({ path, changeType: next.type });
        continue;
      }

      if (
        (next.type === 'created' || next.type === 'modified') &&
        next.content !== previous.content
      ) {
        writes.push({ path, changeType: 'modified' });
      }
    }
    return writes;
  }

  private async recordWorkspaceCommandWrites(
    workspace: WorkspaceValue,
    beforeSnapshot: WorkspaceSnapshot,
    command: string
  ): Promise<void> {
    const provider = this.workspaceProvider as AuditCapableWorkspaceProvider;
    const getFs = provider.getFileSystemService;
    const getProjectRoot = provider.getProjectRoot;
    if (typeof getFs !== 'function' || typeof getProjectRoot !== 'function') {
      return;
    }

    const afterSnapshot = await this.captureWorkspaceSnapshot(workspace);
    const writes = this.detectWorkspaceWrites(beforeSnapshot, afterSnapshot);
    if (writes.length === 0) {
      return;
    }

    const writer = this.formatCommandWriter(command);
    const snapshot = provider.getSecuritySnapshot?.();
    const inheritedSources = Array.isArray(snapshot?.sources)
      ? snapshot.sources.filter((source): source is string => typeof source === 'string' && source.length > 0)
      : [];
    const descriptor = makeSecurityDescriptor({
      labels: Array.isArray(snapshot?.labels) ? snapshot.labels : [],
      taint: Array.isArray(snapshot?.taint) ? snapshot.taint : [],
      sources: [writer, ...inheritedSources]
    });
    const taint = descriptorToInputTaint(descriptor);

    const fileSystem = getFs.call(provider);
    const projectRoot = getProjectRoot.call(provider);
    for (const write of writes) {
      await appendAuditEvent(fileSystem, projectRoot, {
        event: 'write',
        path: write.path,
        changeType: write.changeType,
        taint,
        writer
      });
    }
  }

  private formatCommandWriter(command: string): string {
    const normalized = command.trim();
    if (!normalized) {
      return 'command:<empty>';
    }
    const firstToken = normalized.split(/\s+/)[0];
    return `command:${firstToken}`;
  }

  private resolveWorkspaceShellCwd(): string {
    const provider = this.workspaceProvider as Partial<AuditCapableWorkspaceProvider>;
    if (typeof provider.getProjectRoot === 'function') {
      const root = provider.getProjectRoot.call(provider);
      if (typeof root === 'string' && root.length > 0) {
        return root;
      }
    }
    return this.defaultWorkingDirectory;
  }

  private async getOrCreateShellSession(workspace: WorkspaceValue): Promise<ShellSession> {
    if (!workspace.shellSession) {
      const { ShellSession } = await import('@services/fs/ShellSession');
      workspace.shellSession = await ShellSession.create(workspace.fs, {
        cwd: this.resolveWorkspaceShellCwd()
      });
    }
    return workspace.shellSession;
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
    const activeWorkspace = this.workspaceProvider.getActiveWorkspace();
    if (activeWorkspace && this.isWorkspaceLlmInvocation(context)) {
      const normalizedLanguage = language.toLowerCase();
      if (
        (normalizedLanguage === 'bash' || normalizedLanguage === 'sh' || normalizedLanguage === 'shell') &&
        requiresHostShellExecution(code)
      ) {
        return this.executeWorkspaceLlmBashCode(
          activeWorkspace,
          code,
          params,
          metadata,
          options,
          context
        );
      }
    }

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

  private async executeWorkspaceLlmBashCode(
    workspace: WorkspaceValue,
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    let beforeSnapshot: WorkspaceSnapshot | undefined;
    let writesRecorded = false;

    try {
      beforeSnapshot = await this.captureWorkspaceSnapshot(workspace);
      const result = await this.hostBashExecutor.execute(code, options, context, params, metadata);

      if (beforeSnapshot) {
        await this.recordWorkspaceCommandWrites(workspace, beforeSnapshot, code);
        writesRecorded = true;
      }

      return result;
    } catch (error) {
      if (beforeSnapshot && !writesRecorded) {
        try {
          await this.recordWorkspaceCommandWrites(workspace, beforeSnapshot, code);
        } catch {
          // Best-effort audit logging for workspace command writes.
        }
      }
      throw error;
    }
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
      case 'mlld-loop':
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
