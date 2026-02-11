import { afterEach, describe, expect, it, vi } from 'vitest';
import { wrapStructured } from '@interpreter/utils/structured-value';
import type { StageContext } from '@interpreter/eval/pipeline/state-machine';
import * as contextBuilder from '@interpreter/eval/pipeline/context-builder';
import { PipelineSingleStageRunner, type PipelineSingleStageRuntime } from './single-stage-runner';

function createStageContext(overrides: Partial<StageContext> = {}): StageContext {
  return {
    stage: 1,
    attempt: 1,
    contextAttempt: 1,
    history: [],
    previousOutputs: [],
    globalAttempt: 1,
    totalStages: 1,
    outputs: {},
    currentHint: null,
    hintHistory: [],
    ...overrides
  };
}

function createRuntime(overrides: Partial<PipelineSingleStageRuntime> = {}): {
  runtime: PipelineSingleStageRuntime;
  controls: {
    updatePipelineContext: ReturnType<typeof vi.fn>;
    clearPipelineContext: ReturnType<typeof vi.fn>;
    runPreEffects: ReturnType<typeof vi.fn>;
    runInlineEffects: ReturnType<typeof vi.fn>;
    executeCommand: ReturnType<typeof vi.fn>;
  };
} {
  const input = wrapStructured('seed', 'text', 'seed');
  let hasPipelineContext = true;
  const updatePipelineContext = vi.fn();
  const clearPipelineContext = vi.fn(() => {
    hasPipelineContext = false;
  });
  const runPreEffects = vi.fn(async () => {});
  const runInlineEffects = vi.fn(async () => {});
  const executeCommand = vi.fn(async () => ({ result: 'ok' }));

  const runtime: PipelineSingleStageRuntime = {
    env: {
      withPipeContext: async (_snapshot: any, fn: () => Promise<any>) => await fn(),
      getPipelineContext: () => (hasPipelineContext ? ({ hint: 'retry' } as any) : undefined),
      updatePipelineContext,
      clearPipelineContext
    } as any,
    format: undefined,
    hasSyntheticSource: false,
    isRetryable: true,
    allRetryHistory: new Map(),
    stageOutputs: {
      get: () => input,
      peek: () => undefined,
      set: vi.fn(),
      entries: () => []
    },
    stateMachine: {
      getEvents: () => []
    },
    outputProcessor: {
      normalizeOutput: () => wrapStructured('ok', 'text', 'ok'),
      finalizeStageOutput: value => value
    },
    inlineStageExecutor: {
      executeInlineCommandStage: vi.fn(),
      executeInlineValueStage: vi.fn()
    },
    whileStageAdapter: {
      adaptProcessor: vi.fn()
    },
    rateLimiter: {
      reset: vi.fn(),
      wait: vi.fn(async () => false)
    } as any,
    debugStructured: false,
    createPipelineOperationContext: vi.fn(() => ({ type: 'pipeline-stage', name: 'stage' })),
    createStageHookNode: vi.fn(() => ({ type: 'ExecInvocation', commandRef: { type: 'CommandReference' } })),
    buildStageDescriptor: vi.fn(() => undefined),
    executeCommand,
    runPreEffects,
    runInlineEffects,
    isRetrySignal: (output: unknown) => output === 'retry',
    parseRetryScope: () => undefined,
    parseRetryHint: () => undefined,
    logStructuredStage: vi.fn(),
    debugNormalize: value => value,
    ...overrides
  };

  return {
    runtime,
    controls: {
      updatePipelineContext,
      clearPipelineContext,
      runPreEffects,
      runInlineEffects,
      executeCommand
    }
  };
}

describe('pipeline single-stage runner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockStageEnvironment(): void {
    vi.spyOn(contextBuilder, 'createStageEnvironment').mockImplementation(async (...args: any[]) => {
      const runtimeOptions = args[10];
      runtimeOptions?.capturePipelineContext?.({ stage: 1, currentCommand: 'stage' });
      return {
        getContextManager: () => ({
          withOperation: async (_ctx: any, fn: () => Promise<any>) => await fn()
        })
      } as any;
    });
  }

  it('preserves pre-effect, command execution, and inline-effect ordering', async () => {
    const sequence: string[] = [];
    const { runtime, controls } = createRuntime();
    controls.runPreEffects.mockImplementation(async () => {
      sequence.push('pre');
    });
    controls.executeCommand.mockImplementation(async () => {
      sequence.push('command');
      return { result: 'ok' };
    });
    controls.runInlineEffects.mockImplementation(async () => {
      sequence.push('post');
    });

    mockStageEnvironment();

    const runner = new PipelineSingleStageRunner(runtime);
    const result = await runner.execute(
      0,
      { rawIdentifier: 'stage', args: [], fields: [], identifier: [], rawArgs: [] } as any,
      'seed',
      createStageContext()
    );

    expect(result.type).toBe('success');
    expect(sequence).toEqual(['pre', 'command', 'post']);
  });

  it('returns retry stage result when command execution emits retry signal', async () => {
    const { runtime, controls } = createRuntime();
    controls.executeCommand.mockResolvedValue({ result: 'retry' });

    mockStageEnvironment();

    const runner = new PipelineSingleStageRunner(runtime);
    const result = await runner.execute(
      0,
      { rawIdentifier: 'stage', args: [], fields: [], identifier: [], rawArgs: [] } as any,
      'seed',
      createStageContext()
    );

    expect(result).toMatchObject({
      type: 'retry',
      reason: 'Stage requested retry'
    });
    expect(controls.runInlineEffects).not.toHaveBeenCalled();
  });

  it('clears parent pipeline context after stage completion', async () => {
    const { runtime, controls } = createRuntime();

    mockStageEnvironment();

    const runner = new PipelineSingleStageRunner(runtime);
    const result = await runner.execute(
      0,
      { rawIdentifier: 'stage', args: [], fields: [], identifier: [], rawArgs: [] } as any,
      'seed',
      createStageContext()
    );

    expect(result.type).toBe('success');
    expect(controls.updatePipelineContext).toHaveBeenCalled();
    expect(controls.clearPipelineContext).toHaveBeenCalledTimes(1);
  });
});
