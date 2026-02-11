import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import type { PipelineCommand, PipelineStageEntry, WhilePipelineStage } from '@core/types';
import type { StageContext } from './state-machine';
import { PipelineExecutor } from './executor';
import { isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as whileEvaluator from '@interpreter/eval/while';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

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

function createPipelineCommand(identifier: string, options: { stream?: boolean } = {}): PipelineCommand & { stream?: boolean } {
  return {
    identifier: [
      {
        type: 'VariableReference',
        nodeId: `var-ref-${identifier}`,
        identifier,
        fields: []
      } as any
    ],
    args: [],
    fields: [],
    rawIdentifier: identifier,
    rawArgs: [],
    ...(options.stream ? { stream: true } : {})
  };
}

function createSyntheticStage(identifier: '__identity__' | '__source__', options: { stream?: boolean } = {}): PipelineCommand & { stream?: boolean } {
  return {
    identifier: [],
    args: [],
    fields: [],
    rawIdentifier: identifier,
    rawArgs: [],
    ...(options.stream ? { stream: true } : {})
  };
}

async function runProgram(source: string): Promise<unknown> {
  return await interpret(source, {
    fileSystem: new MemoryFileSystem(),
    pathService: new PathService()
  });
}

describe('pipeline executor phase-0 characterization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses initial input on first synthetic __source__ execution and source function on retry', async () => {
    const env = createEnv();
    const sourceFunction = vi.fn(async () => 'fresh-value');
    const executor = new PipelineExecutor([], env, undefined, true, sourceFunction, true);
    const sourceStage = createSyntheticStage('__source__');
    const initial = wrapStructured('initial-value', 'text', 'initial-value');

    (executor as any).initialOutput = initial;
    (executor as any).initialInputText = 'initial-value';

    const first = await (executor as any).executeCommand(
      sourceStage,
      'ignored',
      wrapStructured('ignored', 'text', 'ignored'),
      env
    );
    const second = await (executor as any).executeCommand(
      sourceStage,
      'ignored',
      wrapStructured('ignored', 'text', 'ignored'),
      env
    );

    expect(isStructuredValue(first.result)).toBe(true);
    expect(first.result.text).toBe('initial-value');
    expect(sourceFunction).toHaveBeenCalledTimes(1);
    expect(isStructuredValue(second.result)).toBe(true);
    expect(second.result.text).toBe('fresh-value');
  });

  it('rejects synthetic __source__ retry when source function is unavailable', async () => {
    const env = createEnv();
    const executor = new PipelineExecutor([], env, undefined, false, undefined, true);
    const sourceStage = createSyntheticStage('__source__');

    (executor as any).sourceExecutedOnce = true;

    await expect(
      (executor as any).executeCommand(
        sourceStage,
        'ignored',
        wrapStructured('ignored', 'text', 'ignored'),
        env
      )
    ).rejects.toThrow('Cannot retry stage 0');
  });

  it('parses retry signal forms and preserves retry hint/scope metadata', async () => {
    const env = createEnv();
    const stage = createPipelineCommand('retryProbe');
    const executor = new PipelineExecutor([stage], env);

    vi.spyOn(executor as any, 'executeCommand')
      .mockResolvedValueOnce({ result: 'retry' })
      .mockResolvedValueOnce({ result: { value: 'retry' } })
      .mockResolvedValueOnce({ result: { value: 'retry', hint: { reason: 'again' }, from: 0 } });

    const first = await (executor as any).executeSingleStage(0, stage, 'seed', createStageContext());
    const second = await (executor as any).executeSingleStage(0, stage, 'seed', createStageContext());
    const third = await (executor as any).executeSingleStage(0, stage, 'seed', createStageContext());

    expect(first).toMatchObject({ type: 'retry', hint: undefined, from: undefined });
    expect(second).toMatchObject({ type: 'retry', hint: undefined, from: undefined });
    expect(third).toMatchObject({
      type: 'retry',
      hint: { reason: 'again' },
      from: 0
    });
  });

  it('enforces policy capability checks for inline command stages', async () => {
    const source = `
/var @policyConfig = {
  capabilities: {
    allow: ["cmd:echo:*"],
    deny: ["cmd:echo:blocked"]
  }
}
/policy @p = union(@policyConfig)
/var @out = "seed" | cmd { echo blocked }
/show @out
`;

    await expect(runProgram(source)).rejects.toThrow("Command 'echo' denied by policy");
  });

  it('enforces label-flow checks for inline command stage stdin', async () => {
    const source = `
/var @policyConfig = { labels: { secret: { deny: ["op:cmd"] } } }
/policy @p = union(@policyConfig)
/var secret @token = "classified"
/var @out = @token | cmd { cat }
/show @out
`;

    await expect(runProgram(source)).rejects.toThrow(/Label 'secret' cannot flow to 'op:cmd'/);
  });

  it('routes while-stage processor execution through command-stage adapter', async () => {
    const env = createEnv();
    const whileStage: WhilePipelineStage = {
      type: 'whileStage',
      cap: 3,
      rateMs: null,
      processor: {
        type: 'VariableReference',
        nodeId: 'while-processor',
        identifier: 'processor',
        fields: []
      } as any,
      rawIdentifier: 'while'
    };
    const executor = new PipelineExecutor([whileStage], env);

    const whileSpy = vi.spyOn(whileEvaluator, 'evaluateWhileStage').mockImplementation(
      async (_stage, _input, iterEnv, runProcessor) => {
        const next = await runProcessor(
          {
            type: 'VariableReference',
            nodeId: 'processor-ref',
            identifier: 'processor',
            fields: []
          } as any,
          wrapStructured('loop-state', 'text', 'loop-state'),
          iterEnv
        );
        return next.value;
      }
    );

    const executeCommandSpy = vi.spyOn(executor as any, 'executeCommand').mockResolvedValue({
      result: 'loop-output'
    });

    const result = await (executor as any).executeSingleStage(
      0,
      whileStage as PipelineStageEntry,
      'seed',
      createStageContext()
    );

    expect(result.type).toBe('success');
    expect(result.output).toBe('loop-output');
    expect(whileSpy).toHaveBeenCalledTimes(1);
    const processorCommand = executeCommandSpy.mock.calls[0][0] as PipelineCommand;
    expect(processorCommand.rawIdentifier).toBe('processor');
  });

  it('keeps parallel branch output order and inserts error markers on failures', async () => {
    const env = createEnv();
    const slow = createPipelineCommand('slow');
    const failing = createPipelineCommand('failing');
    const fast = createPipelineCommand('fast');
    const commands: PipelineStageEntry[] = [slow, failing, fast];
    const executor = new PipelineExecutor([commands], env, undefined, false, undefined, false, 3);

    vi.spyOn(executor as any, 'executeCommand').mockImplementation(async (command: PipelineCommand) => {
      if (command.rawIdentifier === 'slow') {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { result: 'slow-result' };
      }
      if (command.rawIdentifier === 'fast') {
        await new Promise(resolve => setTimeout(resolve, 1));
        return { result: 'fast-result' };
      }
      throw new Error('branch exploded');
    });

    const result = await (executor as any).executeParallelStage(
      0,
      commands,
      'seed',
      createStageContext()
    );

    expect(result.type).toBe('success');
    const success = result as any;
    expect(isStructuredValue(success.structuredOutput)).toBe(true);
    const payload = success.structuredOutput.data as any[];
    expect(payload[0]).toBe('slow-result');
    expect(payload[2]).toBe('fast-result');
    expect(payload[1]).toMatchObject({
      index: 1,
      key: 1,
      value: 'seed'
    });
    expect(String(payload[1].message)).toContain('branch exploded');
    expect(String(payload[1].error)).toContain('branch exploded');
  });

  it('emits streaming lifecycle events for successful pipeline execution', async () => {
    const env = createEnv();
    const stage = createSyntheticStage('__identity__', { stream: true });
    const executor = new PipelineExecutor([stage], env);
    const events: Array<{ type: string }> = [];
    const unsubscribe = env.getStreamingBus().subscribe(event => events.push(event as { type: string }));

    try {
      const output = await executor.execute('seed');
      expect(output).toBe('seed');
    } finally {
      unsubscribe();
    }

    expect(events.map(event => event.type)).toEqual([
      'PIPELINE_START',
      'STAGE_START',
      'STAGE_SUCCESS',
      'PIPELINE_COMPLETE'
    ]);
  });

  it('emits streaming failure and abort events when a stage errors', async () => {
    const env = createEnv();
    const stage = createSyntheticStage('__identity__', { stream: true });
    const executor = new PipelineExecutor([stage], env);
    const events: Array<{ type: string }> = [];
    const unsubscribe = env.getStreamingBus().subscribe(event => events.push(event as { type: string }));

    vi.spyOn(executor as any, 'executeSingleStage').mockResolvedValue({
      type: 'error',
      error: new Error('boom')
    });

    try {
      await expect(executor.execute('seed')).rejects.toThrow('Pipeline failed at stage 1: boom');
    } finally {
      unsubscribe();
    }

    expect(events.map(event => event.type)).toEqual([
      'PIPELINE_START',
      'STAGE_START',
      'STAGE_FAILURE',
      'PIPELINE_ABORT'
    ]);
  });

  it('emits pipeline abort event ordering when state machine aborts after a retry signal', async () => {
    const env = createEnv();
    const stage = createSyntheticStage('__identity__', { stream: true });
    const executor = new PipelineExecutor([stage], env);
    const events: Array<{ type: string }> = [];
    const unsubscribe = env.getStreamingBus().subscribe(event => events.push(event as { type: string }));

    const stateMachine = (executor as any).stateMachine;
    vi.spyOn(stateMachine, 'transition')
      .mockReturnValueOnce({
        type: 'EXECUTE_STAGE',
        stage: 0,
        input: 'seed',
        context: createStageContext({ contextId: 'abort-ctx' })
      })
      .mockReturnValueOnce({
        type: 'ABORT',
        reason: 'aborted-by-test'
      });
    vi.spyOn(executor as any, 'executeSingleStage').mockResolvedValue({
      type: 'retry',
      reason: 'retry requested'
    });

    try {
      await expect(executor.execute('seed')).rejects.toThrow('Pipeline aborted: aborted-by-test');
    } finally {
      unsubscribe();
    }

    expect(events.map(event => event.type)).toEqual([
      'PIPELINE_START',
      'STAGE_START',
      'PIPELINE_ABORT'
    ]);
  });

  it('tears down streaming manager in finally even when execution fails', async () => {
    const env = createEnv();
    const stage = createSyntheticStage('__identity__', { stream: true });
    const teardown = vi.fn(() => {
      throw new Error('teardown failure should be swallowed');
    });
    const streamingManager = {
      getBus: () => env.getStreamingBus(),
      configure: vi.fn(),
      teardown
    } as any;
    const executor = new PipelineExecutor([stage], env, undefined, false, undefined, false, undefined, undefined, streamingManager);

    vi.spyOn(executor as any, 'executeSingleStage').mockResolvedValue({
      type: 'error',
      error: new Error('boom')
    });

    await expect(executor.execute('seed')).rejects.toThrow('Pipeline failed at stage 1: boom');
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
