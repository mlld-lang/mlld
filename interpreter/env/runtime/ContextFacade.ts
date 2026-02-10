import {
  ContextManager,
  type PipelineContextSnapshot,
  type GuardContextSnapshot,
  type OperationContext,
  type DeniedContextSnapshot,
  type GuardHistoryEntry,
  type ToolCallRecord
} from '../ContextManager';
import { GuardRegistry, type SerializedGuardDefinition } from '../../guards';

interface PipelineGuardHistoryStore {
  entries?: GuardHistoryEntry[];
}

export class ContextFacade {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly guardRegistry: GuardRegistry,
    private readonly pipelineGuardHistoryStore: PipelineGuardHistoryStore
  ) {}

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getGuardRegistry(): GuardRegistry {
    return this.guardRegistry;
  }

  getPipelineGuardHistory(): GuardHistoryEntry[] {
    if (!this.pipelineGuardHistoryStore.entries) {
      this.pipelineGuardHistoryStore.entries = [];
    }
    return this.pipelineGuardHistoryStore.entries;
  }

  recordPipelineGuardHistory(entry: GuardHistoryEntry): void {
    this.getPipelineGuardHistory().push(entry);
  }

  resetPipelineGuardHistory(): void {
    const history = this.getPipelineGuardHistory();
    history.splice(0, history.length);
  }

  serializeLocalGuards(): SerializedGuardDefinition[] {
    return this.guardRegistry.serializeOwn();
  }

  serializeGuardsByNames(names: readonly string[]): SerializedGuardDefinition[] {
    return this.guardRegistry.serializeByNames(names);
  }

  registerSerializedGuards(definitions: SerializedGuardDefinition[] | undefined | null): void {
    if (!definitions || definitions.length === 0) {
      return;
    }
    this.guardRegistry.importSerialized(definitions);
  }

  async withOpContext<T>(context: OperationContext, fn: () => Promise<T> | T): Promise<T> {
    return this.contextManager.withOperation(context, fn);
  }

  updateOpContext(update: Partial<OperationContext>): void {
    this.contextManager.updateOperation(update);
  }

  getEnclosingExeLabels(): readonly string[] {
    return this.contextManager.getEnclosingExeLabels();
  }

  setToolsAvailability(allowed: readonly string[], denied: readonly string[]): void {
    this.contextManager.setToolAvailability(allowed, denied);
  }

  recordToolCall(call: ToolCallRecord): void {
    this.contextManager.recordToolCall(call);
  }

  resetToolCalls(): void {
    this.contextManager.resetToolCalls();
  }

  async withPipeContext<T>(
    context: PipelineContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withPipelineContext(context, fn);
  }

  async withGuardContext<T>(
    context: GuardContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withGuardContext(context, fn);
  }

  async withDeniedContext<T>(
    context: DeniedContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withDeniedContext(context, fn);
  }

  pushExecutionContext(type: string, context: unknown): void {
    this.contextManager.pushGenericContext(type, context);
  }

  popExecutionContext<T = unknown>(type: string): T | undefined {
    return this.contextManager.popGenericContext<T>(type);
  }

  getExecutionContext<T = unknown>(type: string): T | undefined {
    return this.contextManager.peekGenericContext<T>(type);
  }

  async withExecutionContext<T>(
    type: string,
    context: unknown,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withGenericContext(type, context, fn);
  }
}
