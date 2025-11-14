import type { SourceLocation } from '@core/types';
import type { DataLabel } from '@core/types/security';

export interface OperationContext {
  /** Directive or operation type (e.g., "var", "run", "output") */
  type: string;
  /** Optional subtype (e.g., "runExec") */
  subtype?: string;
  /** Operation labels declared on the directive (data labels, op labels, etc.) */
  labels?: readonly string[];
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
  previousOutputs: string[];
  format?: string;
  attemptCount?: number;
  attemptHistory?: unknown[];
  hint?: string | null;
  hintHistory?: unknown[];
}

export interface GuardContextSnapshot {
  name?: string;
  attempt: number;
  tries?: ReadonlyArray<Record<string, unknown>>;
  max?: number;
  input?: unknown;
  labels?: readonly DataLabel[];
  sources?: readonly string[];
}

export interface SecuritySnapshotLike {
  labels: readonly string[];
  sources: readonly string[];
  taintLevel: string;
  policy?: Readonly<Record<string, unknown>>;
  operation?: Readonly<Record<string, unknown>>;
}

interface BuildContextOptions {
  pipelineContext?: PipelineContextSnapshot;
  securitySnapshot?: SecuritySnapshotLike;
  testOverride?: unknown;
}

/**
 * Lightweight context manager that owns the @ctx namespace stacks.
 * Tracks operation/guard scopes and builds the ambient @ctx object on demand.
 */
export class ContextManager {
  private readonly opStack: OperationContext[] = [];
  private readonly pipelineStack: PipelineContextSnapshot[] = [];
  private readonly guardStack: GuardContextSnapshot[] = [];

  pushOperation(context: OperationContext): void {
    this.opStack.push(Object.freeze({ ...context }));
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

  buildAmbientContext(options: BuildContextOptions = {}): Record<string, unknown> {
    if (options.testOverride !== undefined) {
      return options.testOverride as Record<string, unknown>;
    }

    const pipeline = options.pipelineContext ?? this.peekPipelineContext();
    const security = options.securitySnapshot;
    const currentOperation = this.peekOperation() ?? security?.operation;
    const pipelineFields = this.buildPipelineFields(pipeline);
    const guardContext = this.peekGuardContext();

    const ctxValue: Record<string, unknown> = {
      ...pipelineFields.root,
      labels: guardContext?.labels
        ? Array.from(guardContext.labels)
        : security
          ? Array.from(security.labels)
          : [],
      sources: guardContext?.sources
        ? Array.from(guardContext.sources)
        : security
          ? Array.from(security.sources)
          : [],
      taintLevel: security?.taintLevel ?? 'unknown',
      policy: security?.policy ?? null,
      operation: currentOperation ?? null,
      op: currentOperation ?? null,
      guard: guardContext ?? null
    };

    if (guardContext?.input !== undefined) {
      ctxValue.input = guardContext.input;
    }

    if (pipelineFields.pipe) {
      ctxValue.pipe = pipelineFields.pipe;
    }

    return ctxValue;
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
      format: pipeline.format ?? null
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
