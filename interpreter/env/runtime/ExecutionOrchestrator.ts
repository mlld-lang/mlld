import type { Variable } from '@core/types/variable';
import type { StreamBus } from '@interpreter/eval/pipeline/stream-bus';
import type { PipelineContextSnapshot } from '../ContextManager';
import type { CommandExecutionContext, ErrorUtils } from '../ErrorUtils';
import {
  CommandExecutorFactory,
  type CommandExecutionOptions,
  type ExecutorDependencies
} from '../executors';
import type { VariableProvider } from '../executors/BashExecutor';
import type { SecuritySnapshotLike } from './SecurityPolicyRuntime';
import { ShadowEnvironmentRuntime } from './ShadowEnvironmentRuntime';

interface AmbientContextBuilder {
  buildAmbientContext(options: {
    pipelineContext: PipelineContextSnapshot | undefined;
    securitySnapshot: SecuritySnapshotLike | undefined;
  }): Record<string, unknown>;
}

export interface ExecutionEnvironmentRuntime {
  getExecutionDirectory(): string;
  getStreamingBus(): StreamBus;
  getContextManager(): AmbientContextBuilder;
  getPipelineContext(): PipelineContextSnapshot | undefined;
  getSecuritySnapshot(): SecuritySnapshotLike | undefined;
  getVariable(name: string): Variable | undefined;
}

export interface CommandExecutorFactoryPort {
  executeCommand(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;
  executeCode(
    code: string,
    language: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;
}

export interface CommandExecutorFactoryCreator {
  create(dependencies: ExecutorDependencies): CommandExecutorFactoryPort;
}

const defaultCommandExecutorFactoryCreator: CommandExecutorFactoryCreator = {
  create(dependencies: ExecutorDependencies): CommandExecutorFactoryPort {
    return new CommandExecutorFactory(dependencies);
  }
};

export interface ExecuteCommandInput {
  command: string;
  defaultOptions: CommandExecutionOptions;
  options?: CommandExecutionOptions;
  context?: CommandExecutionContext;
}

export interface ExecuteCodeInput {
  code: string;
  language: string;
  params?: Record<string, any>;
  metadata?: Record<string, any> | CommandExecutionContext;
  defaultOptions: CommandExecutionOptions;
  options?: CommandExecutionOptions;
  context?: CommandExecutionContext;
}

interface NormalizedCodeExecutionInput {
  metadata?: Record<string, any>;
  context?: CommandExecutionContext;
}

export class ExecutionOrchestrator {
  private commandExecutorFactory?: CommandExecutorFactoryPort;

  constructor(
    private readonly environmentRuntime: ExecutionEnvironmentRuntime,
    private readonly errorUtils: ErrorUtils,
    private readonly variableProvider: VariableProvider,
    private readonly shadowEnvironmentRuntime: ShadowEnvironmentRuntime,
    private readonly factoryCreator: CommandExecutorFactoryCreator = defaultCommandExecutorFactoryCreator
  ) {}

  initialize(): void {
    this.getCommandExecutorFactory();
  }

  getFactory(): CommandExecutorFactoryPort {
    return this.getCommandExecutorFactory();
  }

  async executeCommand(input: ExecuteCommandInput): Promise<string> {
    const finalOptions = { ...input.defaultOptions, ...input.options };
    const bus = this.environmentRuntime.getStreamingBus();
    const contextWithBus = { ...input.context, bus };
    return this.getCommandExecutorFactory().executeCommand(input.command, finalOptions, contextWithBus);
  }

  async executeCode(input: ExecuteCodeInput): Promise<string> {
    const normalized = this.normalizeCodeExecutionInput(input.metadata, input.options, input.context);
    const finalParams = this.injectAmbientMx(input.language, input.params);
    const bus = this.environmentRuntime.getStreamingBus();
    const contextWithBus = { ...normalized.context, bus };
    const mergedOptions = { ...input.defaultOptions, ...input.options };

    return this.getCommandExecutorFactory().executeCode(
      input.code,
      input.language,
      finalParams,
      normalized.metadata,
      mergedOptions,
      contextWithBus
    );
  }

  private getCommandExecutorFactory(): CommandExecutorFactoryPort {
    if (!this.commandExecutorFactory) {
      const dependencies: ExecutorDependencies = {
        errorUtils: this.errorUtils,
        workingDirectory: this.environmentRuntime.getExecutionDirectory(),
        shadowEnvironment: this.shadowEnvironmentRuntime,
        nodeShadowProvider: this.shadowEnvironmentRuntime,
        pythonShadowProvider: this.shadowEnvironmentRuntime,
        variableProvider: this.variableProvider,
        // CommandExecutorFactory accepts a lazy stream-bus accessor to keep runtime bus current.
        getStreamingBus: () => this.environmentRuntime.getStreamingBus()
      };
      this.commandExecutorFactory = this.factoryCreator.create(dependencies);
    }
    return this.commandExecutorFactory;
  }

  private injectAmbientMx(
    language: string,
    params: Record<string, any> | undefined
  ): Record<string, any> {
    let finalParams = params || {};
    const lang = (language || '').toLowerCase();
    const shouldInjectContext =
      lang === 'js' || lang === 'javascript' || lang === 'node' || lang === 'nodejs';

    if (!shouldInjectContext) {
      return finalParams;
    }

    try {
      const testCtxVar = this.environmentRuntime.getVariable('test_mx');
      const mxValue = testCtxVar
        ? (testCtxVar.value as any)
        : this.environmentRuntime.getContextManager().buildAmbientContext({
            pipelineContext: this.environmentRuntime.getPipelineContext(),
            securitySnapshot: this.environmentRuntime.getSecuritySnapshot()
          });
      if (!('mx' in finalParams)) {
        finalParams = { ...finalParams, mx: Object.freeze(mxValue) };
      }
    } catch {
      // Best-effort ambient context injection.
    }

    return finalParams;
  }

  private normalizeCodeExecutionInput(
    metadata: Record<string, any> | CommandExecutionContext | undefined,
    options: CommandExecutionOptions | undefined,
    context: CommandExecutionContext | undefined
  ): NormalizedCodeExecutionInput {
    if (metadata && !context && !options && 'sourceLocation' in metadata) {
      return {
        metadata: undefined,
        context: metadata as CommandExecutionContext
      };
    }

    if (metadata && !context && !options && 'directiveType' in metadata) {
      return {
        metadata: undefined,
        context: metadata as CommandExecutionContext
      };
    }

    return {
      metadata: metadata as Record<string, any> | undefined,
      context
    };
  }
}
