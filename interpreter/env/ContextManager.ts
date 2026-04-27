import type { SourceLocation } from '@core/types';
import type { DataLabel, ToolProvenance } from '@core/types/security';
import type { GuardHint, GuardResult } from '@core/types/guard';
import { resolveCanonicalOperationRef } from '@core/policy/operation-labels';
import {
  createGuardArgsView,
  type GuardArgsSnapshot
} from '../utils/guard-args';

const DEFAULT_GUARD_MAX = 3;

export interface OperationContext {
  /** Directive or operation type (e.g., "var", "run", "output") */
  type: string;
  /** Canonical named operation identity for named operations (e.g., "op:named:email.send") */
  named?: string;
  /** Optional subtype (e.g., "runExec") */
  subtype?: string;
  /** Data labels declared on the directive */
  labels?: readonly string[];
  /** Operation labels used for policy/guard matching */
  opLabels?: readonly string[];
  /** Operation provenance recorded on outputs */
  sources?: readonly string[];
  /** Friendly name or identifier associated with the directive */
  name?: string;
  /** Command string (for /run) when statically known */
  command?: string;
  /** Target path (for /import, /output, etc.) when statically known */
  target?: string;
  /** Original directive location */
  location?: SourceLocation | null;
  /** Additional directive-specific metadata */
  metadata?: Readonly<Record<string, unknown>>;
}

export interface PipelineContextSnapshot {
  stage: number;
  totalStages: number;
  currentCommand: string;
  input: unknown;
  previousOutputs: unknown[];
  format?: string;
  attemptCount?: number;
  attemptHistory?: unknown[];
  hint?: string | null;
  hintHistory?: unknown[];
  sourceRetryable?: boolean;
  guards?: GuardHistoryEntry[];
}

export interface GuardContextSnapshot {
  name?: string;
  attempt: number;
  try?: number;
  tries?: ReadonlyArray<Record<string, unknown>>;
  max?: number;
  input?: unknown;
  output?: unknown;
  labels?: readonly DataLabel[];
  sources?: readonly string[];
  taint?: readonly string[];
  attestations?: readonly string[];
  toolsHistory?: readonly ToolProvenance[];
  inputPreview?: string | null;
  outputPreview?: string | null;
  timing?: 'before' | 'after';
  hintHistory?: ReadonlyArray<string | null>;
  reason?: string | null;
  guardFilter?: string | null;
  trace?: ReadonlyArray<GuardResult>;
  hints?: ReadonlyArray<GuardHint>;
  reasons?: ReadonlyArray<string>;
  decision?: 'allow' | 'deny' | 'retry' | 'resume';
  args?: GuardArgsSnapshot;
}

export interface DeniedContextSnapshot {
  denied: boolean;
  reason?: string | null;
  guardName?: string | null;
  guardFilter?: string | null;
  code?: string | null;
  phase?: string | null;
  direction?: string | null;
  tool?: string | null;
  field?: string | null;
  hint?: string | null;
}

export interface SecuritySnapshotLike {
  labels: readonly string[];
  sources: readonly string[];
  taint: readonly string[];
  attestations?: readonly string[];
  urls?: readonly string[];
  tools?: readonly ToolProvenance[];
  policy?: Readonly<Record<string, unknown>>;
  operation?: Readonly<Record<string, unknown>>;
}

export interface GuardHistoryEntry {
  stage: number;
  operation: OperationContext | null;
  decision: 'allow' | 'deny' | 'retry' | 'resume';
  trace: ReadonlyArray<GuardResult>;
  hints: ReadonlyArray<GuardHint>;
  reasons: ReadonlyArray<string>;
}

export interface ToolCallRecord {
  name: string;
  arguments?: Record<string, unknown>;
  timestamp: number;
  ok: boolean;
  error?: string | null;
  result?: unknown;
}

export interface AvailableToolContextEntry {
  name: string;
}

export interface ToolsContextSnapshot {
  calls: ReadonlyArray<string>;
  allowed: ReadonlyArray<string>;
  denied: ReadonlyArray<string>;
  available: ReadonlyArray<AvailableToolContextEntry>;
  results: Readonly<Record<string, unknown>>;
  history: ReadonlyArray<ToolProvenance>;
}

type SigFilesResolver = (pattern: string) => Promise<unknown[]>;

interface BuildContextOptions {
  pipelineContext?: PipelineContextSnapshot;
  securitySnapshot?: SecuritySnapshotLike;
  testOverride?: unknown;
  boxContext?: { mcpConfigPath?: string; socketPath?: string } | null;
  llmToolConfig?: import('./executors/call-mcp-config').CallMcpConfig | null;
}

/**
 * Lightweight context manager that owns the @mx namespace stacks.
 * Tracks operation/guard scopes and builds the ambient @mx object on demand.
 */
export class ContextManager {
  private readonly opStack: OperationContext[] = [];
  private readonly pipelineStack: PipelineContextSnapshot[] = [];
  private readonly guardStack: GuardContextSnapshot[] = [];
  private readonly deniedStack: DeniedContextSnapshot[] = [];
  private readonly genericContexts: Map<string, unknown[]> = new Map();
  private latestErrors: unknown[] = [];
  private profile: string | null = null;
  private toolCalls: ToolCallRecord[] = [];
  private toolAllowed: string[] = [];
  private toolDenied: string[] = [];
  private toolAvailable: AvailableToolContextEntry[] = [];
  private toolResults: Record<string, unknown> = {};
  private sigStatuses: Record<string, unknown> = {};
  private toolsSnapshotVersion = 0;
  private toolsSnapshotCachedAt = -1;
  private cachedToolsSnapshot?: ToolsContextSnapshot;
  private sigFilesResolver?: SigFilesResolver;
  private readonly knownUrls = new Set<string>();

  pushOperation(context: OperationContext): void {
    this.opStack.push(Object.freeze({ ...context }));
  }

  updateOperation(update: Partial<OperationContext>): void {
    if (this.opStack.length === 0) {
      return;
    }
    const current = this.opStack[this.opStack.length - 1];
    this.opStack[this.opStack.length - 1] = Object.freeze({ ...current, ...update });
  }

  popOperation(): OperationContext | undefined {
    return this.opStack.pop();
  }

  peekOperation(): OperationContext | undefined {
    if (this.opStack.length === 0) {
      return undefined;
    }
    return this.opStack[this.opStack.length - 1];
  }

  getEnclosingExeLabels(): readonly string[] {
    for (let i = this.opStack.length - 1; i >= 0; i--) {
      const ctx = this.opStack[i];
      if (ctx.type === 'exe' && ctx.labels && ctx.labels.length > 0) {
        return ctx.labels;
      }
    }
    return [];
  }

  hasEnclosingExeLabel(label: string): boolean {
    const normalized = label.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    for (let i = this.opStack.length - 1; i >= 0; i--) {
      const ctx = this.opStack[i];
      if (ctx.type !== 'exe' || !ctx.labels || ctx.labels.length === 0) {
        continue;
      }
      if (ctx.labels.some(candidate => candidate.trim().toLowerCase() === normalized)) {
        return true;
      }
    }
    return false;
  }

  async withOperation<T>(context: OperationContext, fn: () => Promise<T> | T): Promise<T> {
    this.pushOperation(context);
    try {
      return await Promise.resolve(fn());
    } finally {
      this.popOperation();
    }
  }

  pushPipelineContext(context: PipelineContextSnapshot): void {
    this.pipelineStack.push(Object.freeze({ ...context }));
  }

  replacePipelineContext(context: PipelineContextSnapshot): void {
    if (this.pipelineStack.length === 0) {
      this.pushPipelineContext(context);
      return;
    }
    this.pipelineStack[this.pipelineStack.length - 1] = Object.freeze({ ...context });
  }

  popPipelineContext(): PipelineContextSnapshot | undefined {
    return this.pipelineStack.pop();
  }

  peekPipelineContext(): PipelineContextSnapshot | undefined {
    if (this.pipelineStack.length === 0) {
      return undefined;
    }
    return this.pipelineStack[this.pipelineStack.length - 1];
  }

  async withPipelineContext<T>(
    context: PipelineContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    this.pushPipelineContext(context);
    try {
      return await Promise.resolve(fn());
    } finally {
      this.popPipelineContext();
    }
  }

  pushGuardContext(context: GuardContextSnapshot): void {
    this.guardStack.push(Object.freeze({ ...context }));
  }

  popGuardContext(): GuardContextSnapshot | undefined {
    return this.guardStack.pop();
  }

  peekGuardContext(): GuardContextSnapshot | undefined {
    if (this.guardStack.length === 0) {
      return undefined;
    }
    return this.guardStack[this.guardStack.length - 1];
  }

  async withGuardContext<T>(context: GuardContextSnapshot, fn: () => Promise<T> | T): Promise<T> {
    this.pushGuardContext(context);
    try {
      return await Promise.resolve(fn());
    } finally {
      this.popGuardContext();
    }
  }

  pushDeniedContext(context: DeniedContextSnapshot): void {
    this.deniedStack.push(Object.freeze({ ...context }));
  }

  popDeniedContext(): DeniedContextSnapshot | undefined {
    return this.deniedStack.pop();
  }

  peekDeniedContext(): DeniedContextSnapshot | undefined {
    if (this.deniedStack.length === 0) {
      return undefined;
    }
    return this.deniedStack[this.deniedStack.length - 1];
  }

  async withDeniedContext<T>(context: DeniedContextSnapshot, fn: () => Promise<T> | T): Promise<T> {
    this.pushDeniedContext(context);
    try {
      return await Promise.resolve(fn());
    } finally {
      this.popDeniedContext();
    }
  }

  setProfile(profile: string | null): void {
    this.profile = profile ?? null;
  }

  getProfile(): string | null {
    return this.profile;
  }

  setToolAvailability(allowed?: readonly string[] | null, denied?: readonly string[] | null): void {
    this.toolAllowed = this.normalizeToolList(allowed);
    this.toolDenied = this.normalizeToolList(denied);
    this.toolsSnapshotVersion++;
  }

  setAvailableTools(available?: readonly AvailableToolContextEntry[] | null): void {
    this.toolAvailable = this.normalizeAvailableTools(available);
    this.toolsSnapshotVersion++;
  }

  recordToolCall(call: ToolCallRecord): void {
    const frozenResult = call.result !== undefined
      ? this.deepFreezeValue(call.result)
      : undefined;
    const storedCall: ToolCallRecord = {
      name: call.name,
      timestamp: call.timestamp,
      ok: call.ok,
      ...(call.error !== undefined ? { error: call.error } : {}),
      ...(frozenResult !== undefined ? { result: frozenResult } : {})
    };
    this.toolCalls.push(Object.freeze(storedCall));
    this.toolsSnapshotVersion++;
    if (call.ok) {
      if (frozenResult !== undefined) {
        this.toolResults[call.name] = frozenResult;
      }
      return;
    }
    this.toolResults[call.name] = Object.freeze({
      ok: false,
      error: call.error ?? null
    });
  }

  resetToolCalls(): void {
    this.toolCalls = [];
    this.toolResults = {};
    this.toolsSnapshotVersion++;
    this.cachedToolsSnapshot = undefined;
  }

  getToolsSnapshot(): ToolsContextSnapshot {
    if (this.cachedToolsSnapshot && this.toolsSnapshotCachedAt === this.toolsSnapshotVersion) {
      return this.cachedToolsSnapshot;
    }
    this.cachedToolsSnapshot = {
      calls: this.toolCalls.map(call => call.name),
      allowed: [...this.toolAllowed],
      denied: [...this.toolDenied],
      available: this.toolAvailable.map(entry => ({ ...entry })),
      results: { ...this.toolResults },
      history: []
    };
    this.toolsSnapshotCachedAt = this.toolsSnapshotVersion;
    return this.cachedToolsSnapshot;
  }

  recordSigStatus(keys: readonly string[], status: unknown): void {
    if (!Array.isArray(keys) || keys.length === 0) {
      return;
    }

    const frozen = this.deepFreezeValue(status);
    for (const key of keys) {
      if (typeof key !== 'string') {
        continue;
      }
      const normalized = key.trim();
      if (!normalized) {
        continue;
      }
      this.sigStatuses[normalized] = frozen;
    }
  }

  setSigFilesResolver(resolver?: SigFilesResolver): void {
    this.sigFilesResolver = resolver;
  }

  recordKnownUrls(urls: readonly string[] | undefined): void {
    if (!urls || urls.length === 0) {
      return;
    }
    for (const value of urls) {
      if (typeof value !== 'string') {
        continue;
      }
      const normalized = value.trim();
      if (!normalized) {
        continue;
      }
      this.knownUrls.add(normalized);
    }
  }

  getKnownUrls(): readonly string[] {
    return Array.from(this.knownUrls);
  }

  buildAmbientContext(options: BuildContextOptions = {}): Record<string, unknown> {
    if (options.testOverride !== undefined) {
      return options.testOverride as Record<string, unknown>;
    }

    const pipeline = options.pipelineContext ?? this.peekPipelineContext();
    const security = options.securitySnapshot;
    const currentOperation = this.peekOperation() ?? security?.operation;
    const normalizedOperation =
      currentOperation && typeof currentOperation === 'object'
        ? this.normalizeOperationContext(currentOperation as Readonly<Record<string, unknown>>)
        : null;
    const pipelineFields = this.buildPipelineFields(pipeline);
    const guardContext = this.peekGuardContext();
    const deniedContext = this.peekDeniedContext();
    const whileContext = this.peekGenericContext('while');
    const loopContext = this.peekGenericContext('loop');
    const forContext = this.peekGenericContext('for');
    const parallelContext = this.peekGenericContext('parallel');
    const errorsContext = (() => {
      const contexts = [parallelContext, forContext].filter(Boolean) as Array<{ errors?: unknown; timestamp?: number }>;
      if (contexts.length === 0) return null;
      const sorted = contexts.sort((a, b) => {
        const ta = typeof a.timestamp === 'number' ? a.timestamp! : -Infinity;
        const tb = typeof b.timestamp === 'number' ? b.timestamp! : -Infinity;
        return tb - ta;
      });
      return sorted[0];
    })();
    const resolvedErrors =
      errorsContext && typeof errorsContext === 'object' && Array.isArray((errorsContext as any).errors)
        ? (errorsContext as any).errors
        : this.latestErrors;
    const hookErrors =
      normalizedOperation &&
      typeof normalizedOperation === 'object' &&
      normalizedOperation !== null &&
      typeof (normalizedOperation as any).metadata === 'object' &&
      Array.isArray((normalizedOperation as any).metadata.userHookErrors)
        ? (((normalizedOperation as any).metadata.userHookErrors as unknown[]) ?? [])
        : [];
    const checkpointContext = this.buildCheckpointContext(normalizedOperation);
    const toolHistory = guardContext?.toolsHistory
      ? Array.from(guardContext.toolsHistory)
      : security?.tools
        ? Array.from(security.tools)
        : [];
    const registryUrls = this.getKnownUrls();

    const mxValue: Record<string, unknown> = {
      ...pipelineFields.root,
      labels: guardContext?.labels
        ? Array.from(guardContext.labels)
        : security
          ? Array.from(security.labels)
          : [],
      attestations: guardContext?.attestations
        ? Array.from(guardContext.attestations)
        : security?.attestations
          ? Array.from(security.attestations)
          : [],
      sources: guardContext?.sources
        ? Array.from(guardContext.sources)
        : security
          ? Array.from(security.sources)
          : [],
      taint: guardContext?.taint
        ? Array.from(guardContext.taint)
        : security?.taint
          ? Array.from(security.taint)
          : [],
      policy: security?.policy ?? null,
      profile: this.profile ?? null,
      operation: normalizedOperation,
      op: normalizedOperation,
      ...(whileContext ? { while: whileContext } : {}),
      ...(loopContext ? { loop: loopContext } : {}),
      ...(forContext ? { for: forContext } : {}),
      errors: Array.isArray(resolvedErrors) ? resolvedErrors : [],
      hooks: {
        errors: Array.isArray(hookErrors) ? [...hookErrors] : []
      },
      tools: {
        ...this.getToolsSnapshot(),
        history: toolHistory
      },
      urls: {
        registry: registryUrls
      },
      sig: this.buildSigContext(),
      ...(checkpointContext ? { checkpoint: checkpointContext } : {}),
      ...(options.boxContext ? { box: options.boxContext } : {}),
      ...(this.buildLlmContext(options.llmToolConfig) ?? {})
    };

    if (deniedContext) {
      mxValue.denied = true;
      mxValue.denial = {
        denied: true,
        ...(deniedContext.code ? { code: deniedContext.code } : {}),
        ...(deniedContext.reason ? { reason: deniedContext.reason } : {}),
        ...(deniedContext.phase ? { phase: deniedContext.phase } : {}),
        ...(deniedContext.direction ? { direction: deniedContext.direction } : {}),
        ...(deniedContext.tool ? { tool: deniedContext.tool } : {}),
        ...(deniedContext.field ? { field: deniedContext.field } : {}),
        ...(deniedContext.hint ? { hint: deniedContext.hint } : {})
      };
    } else {
      mxValue.denied = false;
      mxValue.denial = null;
    }

    if (guardContext?.input !== undefined) {
      mxValue.input = guardContext.input;
    }
    if (guardContext?.output !== undefined) {
      mxValue.output = guardContext.output;
    }
    if (guardContext) {
      mxValue.args = createGuardArgsView(guardContext.args);
    }

    if (guardContext || deniedContext) {
      mxValue.guard = this.normalizeGuardContext(guardContext, deniedContext);
    }

    if (pipelineFields.pipe) {
      mxValue.pipe = pipelineFields.pipe;
    }

    return mxValue;
  }

  private normalizeToolList(list?: readonly string[] | null): string[] {
    if (!list || list.length === 0) {
      return [];
    }
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const entry of list) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      normalized.push(trimmed);
    }
    return normalized;
  }

  private normalizeAvailableTools(
    available?: readonly AvailableToolContextEntry[] | null
  ): AvailableToolContextEntry[] {
    if (!available || available.length === 0) {
      return [];
    }

    const normalized: AvailableToolContextEntry[] = [];
    const seen = new Set<string>();
    for (const entry of available) {
      const rawName = typeof entry?.name === 'string' ? entry.name : '';
      const name = rawName.trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      normalized.push({ name });
    }

    return normalized;
  }

  private deepFreezeValue(value: unknown, seen?: WeakMap<object, unknown>): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value !== 'object' || typeof value === 'function') {
      return value;
    }
    const obj = value as object;
    if (Object.isFrozen(obj)) {
      return obj;
    }
    if (!seen) {
      seen = new WeakMap();
    }
    const cached = seen.get(obj);
    if (cached !== undefined) {
      return cached;
    }
    if (Array.isArray(obj)) {
      const copy: unknown[] = [];
      seen.set(obj, copy);
      for (const item of obj) {
        copy.push(this.deepFreezeValue(item, seen));
      }
      return Object.freeze(copy);
    }
    const copy: Record<string, unknown> = {};
    seen.set(obj, copy);
    for (const [key, entry] of Object.entries(obj as Record<string, unknown>)) {
      copy[key] = this.deepFreezeValue(entry, seen);
    }
    return Object.freeze(copy);
  }

  private buildSigContext(): Record<string, unknown> {
    const snapshot = { ...this.sigStatuses };
    if (this.sigFilesResolver) {
      snapshot.files = async (pattern: string) => await this.sigFilesResolver?.(pattern) ?? [];
    }
    return snapshot;
  }

  private normalizeOperationContext(
    operation: Readonly<Record<string, unknown>>
  ): Record<string, unknown> {
    const labels = this.normalizeToolList(operation.labels as readonly string[] | undefined);
    const opLabels = this.normalizeToolList(operation.opLabels as readonly string[] | undefined);
    const mergedLabels = this.normalizeToolList([...labels, ...opLabels]);
    const named =
      resolveCanonicalOperationRef({
        type: typeof operation.type === 'string' ? operation.type : undefined,
        named: typeof operation.named === 'string' ? operation.named : undefined,
        name: typeof operation.name === 'string' ? operation.name : undefined,
        opLabels
      }) ?? null;
    return {
      ...operation,
      named,
      labels: mergedLabels,
      opLabels
    };
  }

  private buildCheckpointContext(
    operation: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!operation) {
      return null;
    }

    const metadata = operation.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const metadataRecord = metadata as Record<string, unknown>;
    const explicitCheckpoint = metadataRecord.checkpoint;
    if (explicitCheckpoint && typeof explicitCheckpoint === 'object') {
      const checkpointRecord = explicitCheckpoint as Record<string, unknown>;
      const hit = checkpointRecord.hit === true;
      const key = typeof checkpointRecord.key === 'string' ? checkpointRecord.key : null;
      return { hit, key };
    }

    const hit = metadataRecord.checkpointHit === true;
    const key = typeof metadataRecord.checkpointKey === 'string' ? metadataRecord.checkpointKey : null;
    if (!hit && key === null) {
      return null;
    }

    return { hit, key };
  }

  pushGenericContext(type: string, context: unknown): void {
    if (!this.genericContexts.has(type)) {
      this.genericContexts.set(type, []);
    }
    const stack = this.genericContexts.get(type)!;
    stack.push(context);
  }

  popGenericContext<T = unknown>(type: string): T | undefined {
    const stack = this.genericContexts.get(type);
    if (!stack || stack.length === 0) {
      return undefined;
    }
    return stack.pop() as T | undefined;
  }

  peekGenericContext<T = unknown>(type: string): T | undefined {
    const stack = this.genericContexts.get(type);
    if (!stack || stack.length === 0) {
      return undefined;
    }
    return stack[stack.length - 1] as T | undefined;
  }

  async withGenericContext<T>(
    type: string,
    context: unknown,
    fn: () => Promise<T> | T
  ): Promise<T> {
    this.pushGenericContext(type, context);
    try {
      return await Promise.resolve(fn());
    } finally {
      this.popGenericContext(type);
    }
  }

  setLatestErrors(errors: unknown[]): void {
    this.latestErrors = errors;
  }

  private normalizeGuardContext(
    guardContext?: GuardContextSnapshot,
    deniedContext?: DeniedContextSnapshot
  ): Record<string, unknown> {
    const trace = Array.isArray(guardContext?.trace) ? guardContext!.trace : [];
    const hints = Array.isArray(guardContext?.hints) ? guardContext!.hints : [];
    const reasons = Array.isArray(guardContext?.reasons)
      ? guardContext!.reasons
      : deniedContext?.reason
        ? [deniedContext.reason]
        : [];
    const attempt =
      typeof guardContext?.attempt === 'number'
        ? guardContext.attempt
        : typeof guardContext?.try === 'number'
          ? guardContext.try ?? 0
          : 0;
    const resolvedReason = guardContext?.reason ?? reasons[0] ?? null;
    const resolvedName = guardContext?.name ?? deniedContext?.guardName ?? null;
    const resolvedFilter = guardContext?.guardFilter ?? deniedContext?.guardFilter ?? null;
    const max = typeof guardContext?.max === 'number' ? guardContext.max : DEFAULT_GUARD_MAX;
    const timing = guardContext?.timing ?? null;

    return {
      ...(guardContext ?? {}),
      ...(guardContext ? { args: createGuardArgsView(guardContext.args) } : {}),
      trace,
      hints,
      reasons,
      reason: resolvedReason,
      name: resolvedName,
      filter: resolvedFilter,
      code: deniedContext?.code ?? null,
      phase: deniedContext?.phase ?? null,
      direction: deniedContext?.direction ?? null,
      tool: deniedContext?.tool ?? null,
      field: deniedContext?.field ?? null,
      hint: guardContext?.hint ?? deniedContext?.hint ?? null,
      attempt,
      try: typeof guardContext?.try === 'number' ? guardContext.try : attempt,
      max,
      timing
    };
  }

  private buildPipelineFields(pipeline?: PipelineContextSnapshot): {
    root: Record<string, unknown>;
    pipe?: Record<string, unknown>;
  } {
    if (!pipeline) {
      return {
        root: {
          try: 1,
          tries: [],
          stage: 0,
          isPipeline: false,
          hint: null,
          lastOutput: null,
          input: null
        }
      };
    }

    const tries = this.buildAttemptSummaries(pipeline.attemptHistory, pipeline.hintHistory);
    const normalizedInput = this.normalizeInput(pipeline.input);
    const lastOutput =
      Array.isArray(pipeline.previousOutputs) && pipeline.previousOutputs.length > 0
        ? pipeline.previousOutputs[pipeline.previousOutputs.length - 1]
        : null;

    const pipeNamespace: Record<string, unknown> = {
      try: pipeline.attemptCount ?? 1,
      tries,
      stage: typeof pipeline.stage === 'number' ? pipeline.stage : 0,
      length: Array.isArray(pipeline.previousOutputs) ? pipeline.previousOutputs.length : 0,
      input: normalizedInput,
      format: pipeline.format ?? null,
      guards: Array.isArray(pipeline.guards) ? pipeline.guards : []
    };

    return {
      root: {
        try: pipeNamespace.try,
        tries,
        stage: pipeNamespace.stage,
        isPipeline: true,
        hint: pipeline.hint ?? null,
        lastOutput,
        input: normalizedInput
      },
      pipe: pipeNamespace
    };
  }

  private buildAttemptSummaries(
    outputs?: unknown[],
    hints?: unknown[]
  ): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    const max = Math.max(outputs?.length ?? 0, hints?.length ?? 0);
    for (let i = 0; i < max; i++) {
      result.push({
        attempt: i + 1,
        result: 'retry',
        hint: hints?.[i] ?? null,
        output: outputs?.[i] ?? null
      });
    }
    return result;
  }

  private buildLlmContext(
    config?: import('./executors/call-mcp-config').CallMcpConfig | null
  ): { llm: Record<string, unknown> } | null {
    if (config === undefined) return null;
    if (config === null) {
      return { llm: { config: '', allowed: '', native: '', inBox: false, hasTools: true } };
    }
    return {
      llm: {
        config: config.mcpConfigPath,
        allowed: config.unifiedAllowedTools,
        native: config.nativeAllowedTools,
        inBox: config.inBox,
        hasTools: true
      }
    };
  }

  private normalizeInput(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    const looksLikeJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));

    if (!looksLikeJson) {
      return value;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
}
