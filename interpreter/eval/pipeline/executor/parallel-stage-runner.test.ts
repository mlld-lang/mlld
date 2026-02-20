import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import { wrapStructured } from '@interpreter/utils/structured-value';
import type { StageContext } from '@interpreter/eval/pipeline/state-machine';
import * as contextBuilder from '@interpreter/eval/pipeline/context-builder';
import { PipelineParallelStageRunner, type PipelineParallelStageRuntime } from './parallel-stage-runner';

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

function createCommand(rawIdentifier: string): any {
  return {
    rawIdentifier,
    args: [],
    fields: [],
    identifier: [],
    rawArgs: []
  };
}

function createRuntime(overrides: Partial<PipelineParallelStageRuntime> = {}): {
  runtime: PipelineParallelStageRuntime;
  controls: {
    executeCommand: ReturnType<typeof vi.fn>;
    runInlineEffects: ReturnType<typeof vi.fn>;
    finalizeStageOutput: ReturnType<typeof vi.fn>;
    setStageOutput: ReturnType<typeof vi.fn>;
    setLatestErrors: ReturnType<typeof vi.fn>;
  };
} {
  const input = wrapStructured('seed', 'text', 'seed');
  const executeCommand = vi.fn(async (command: { rawIdentifier: string }) => ({
    result: `${command.rawIdentifier}-result`
  }));
  const runInlineEffects = vi.fn(async () => {});
  const finalizeStageOutput = vi.fn((value: any) => value);
  const setStageOutput = vi.fn();
  const setLatestErrors = vi.fn();
  const contextManager = {
    popGenericContext: vi.fn(() => false),
    pushGenericContext: vi.fn(),
    setLatestErrors
  };

  const runtime: PipelineParallelStageRuntime = {
    env: {
      withPipeContext: async (_snapshot: any, fn: () => Promise<any>) => await fn(),
      getContextManager: () => contextManager
    } as any,
    format: undefined,
    hasSyntheticSource: false,
    isRetryable: true,
    parallelCap: 4,
    delayMs: undefined,
    allRetryHistory: new Map(),
    stageOutputs: {
      get: () => input,
      set: setStageOutput
    },
    stateMachine: {
      getEvents: () => []
    },
    outputProcessor: {
      normalizeOutput: (output: unknown) => {
        if (typeof output === 'string') {
          return wrapStructured(output, 'text', output);
        }
        return output as any;
      },
      finalizeStageOutput
    },
    inlineStageExecutor: {
      executeInlineCommandStage: vi.fn(),
      executeInlineValueStage: vi.fn()
    },
    createPipelineOperationContext: vi.fn(() => ({ type: 'pipeline-stage', name: 'stage' })),
    createStageHookNode: vi.fn(() => ({ type: 'ExecInvocation', commandRef: { type: 'CommandReference' } })),
    buildStageDescriptor: vi.fn(() => undefined),
    executeCommand,
    runInlineEffects,
    isRetrySignal: (output: unknown) => output === 'retry' || (output && typeof output === 'object' && (output as any).value === 'retry'),
    logStructuredStage: vi.fn(),
    ...overrides
  };

  return {
    runtime,
    controls: {
      executeCommand,
      runInlineEffects,
      finalizeStageOutput,
      setStageOutput,
      setLatestErrors
    }
  };
}

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

describe('pipeline parallel stage runner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves ordered branch outputs when branches complete out of order', async () => {
    const { runtime, controls } = createRuntime();
    controls.executeCommand.mockImplementation(async (command: { rawIdentifier: string }) => {
      if (command.rawIdentifier === 'slow') {
        await new Promise(resolve => setTimeout(resolve, 15));
        return { result: 'slow-result' };
      }
      await new Promise(resolve => setTimeout(resolve, 1));
      return { result: 'fast-result' };
    });

    mockStageEnvironment();

    const runner = new PipelineParallelStageRunner(runtime);
    const result = await runner.execute(
      0,
      [createCommand('slow'), createCommand('fast')],
      'seed',
      createStageContext()
    );

    expect(result.type).toBe('success');
    expect((result as any).structuredOutput.data).toEqual(['slow-result', 'fast-result']);
    expect(controls.runInlineEffects).toHaveBeenCalledTimes(2);
  });

  it('accumulates branch errors into marker payloads and updates parallel error context', async () => {
    const { runtime, controls } = createRuntime();
    controls.executeCommand.mockImplementation(async (command: { rawIdentifier: string }) => {
      if (command.rawIdentifier === 'fail') {
        throw new Error('branch exploded');
      }
      return { result: `${command.rawIdentifier}-ok` };
    });

    mockStageEnvironment();

    const runner = new PipelineParallelStageRunner(runtime);
    const result = await runner.execute(
      0,
      [createCommand('one'), createCommand('fail'), createCommand('three')],
      'seed',
      createStageContext()
    );

    expect(result.type).toBe('success');
    const payload = (result as any).structuredOutput.data as Array<Record<string, unknown>>;
    expect(payload[0]).toBe('one-ok');
    expect(payload[2]).toBe('three-ok');
    expect(payload[1]).toMatchObject({
      index: 1,
      key: 1,
      value: 'seed'
    });
    expect(String(payload[1].message)).toContain('branch exploded');
    const finalErrorContext = controls.setLatestErrors.mock.calls.at(-1)?.[0] as unknown[];
    expect(finalErrorContext).toHaveLength(1);
  });

  it('rejects retry signals emitted by any parallel branch', async () => {
    const { runtime, controls } = createRuntime();
    controls.executeCommand.mockImplementation(async (command: { rawIdentifier: string }) => {
      if (command.rawIdentifier === 'retrying') {
        return { result: 'retry' };
      }
      return { result: 'ok' };
    });

    mockStageEnvironment();

    const runner = new PipelineParallelStageRunner(runtime);
    const result = await runner.execute(
      0,
      [createCommand('retrying'), createCommand('stable')],
      'seed',
      createStageContext()
    );

    expect(result).toMatchObject({
      type: 'error',
      error: new Error('retry not supported in parallel stage')
    });
  });

  it('merges branch label descriptors into the aggregated stage descriptor', async () => {
    const { runtime, controls } = createRuntime();
    const left = makeSecurityDescriptor({ labels: ['alpha'] });
    const right = makeSecurityDescriptor({ labels: ['beta'] });
    controls.executeCommand.mockImplementation(async (command: { rawIdentifier: string }) => {
      if (command.rawIdentifier === 'left') {
        return { result: 'left-result', labelDescriptor: left };
      }
      return { result: 'right-result', labelDescriptor: right };
    });

    mockStageEnvironment();

    const runner = new PipelineParallelStageRunner(runtime);
    const result = await runner.execute(
      0,
      [createCommand('left'), createCommand('right')],
      'seed',
      createStageContext()
    );

    expect(result.type).toBe('success');
    const aggregatedCall = controls.finalizeStageOutput.mock.calls.find(call => Array.isArray(call[2]));
    const aggregatedDescriptor = aggregatedCall?.[3] as { labels: readonly string[] } | undefined;
    expect(aggregatedDescriptor?.labels).toEqual(expect.arrayContaining(['alpha', 'beta']));
    expect(controls.setStageOutput).toHaveBeenCalledTimes(1);
  });
});
