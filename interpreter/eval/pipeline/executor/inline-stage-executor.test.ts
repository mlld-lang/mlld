import { afterEach, describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import type { StageContext } from '@interpreter/eval/pipeline/state-machine';
import type { PipelineCommandExecutionContextFactory } from './types';
import { PipelineOutputProcessor } from './output-processor';
import { PipelineInlineStageExecutor } from './inline-stage-executor';
import * as dataValueEvaluator from '@interpreter/eval/data-value-evaluator';

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

const contextFactory: PipelineCommandExecutionContextFactory = {
  createCommandExecutionContext(
    stageIndex: number,
    stageContext: StageContext,
    parallelIndex?: number,
    directiveType?: string,
    workingDirectory?: string
  ) {
    return {
      directiveType: directiveType || 'run',
      streamingEnabled: false,
      pipelineId: 'test-pipeline',
      stageIndex,
      parallelIndex,
      streamId: stageContext.contextId ?? 'test-stream',
      workingDirectory
    };
  }
};

describe('pipeline inline stage executor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies inline command stages when policy blocks command capability', async () => {
    const env = createEnv();
    env.recordPolicyConfig('test-policy', {
      capabilities: {
        allow: ['cmd:echo:*'],
        deny: ['cmd:echo:blocked']
      }
    });

    const outputProcessor = new PipelineOutputProcessor(env);
    const inlineExecutor = new PipelineInlineStageExecutor(env, outputProcessor);
    const stageInput = wrapStructured('seed', 'text', 'seed');

    await expect(
      inlineExecutor.executeInlineCommandStage({
        stage: {
          type: 'inlineCommand',
          rawIdentifier: 'cmd',
          command: [{ type: 'Text', content: 'echo blocked' }]
        } as any,
        structuredInput: stageInput,
        stageEnv: env,
        stageIndex: 0,
        stageContext: createStageContext(),
        contextFactory
      })
    ).rejects.toThrow("Command 'echo' denied by policy");
  });

  it('allows inline command stages and executes shell command with stage context', async () => {
    const env = createEnv();
    env.recordPolicyConfig('test-policy', {
      capabilities: {
        allow: ['cmd:echo:*']
      }
    });

    const executeSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('ok');
    const outputProcessor = new PipelineOutputProcessor(env);
    const inlineExecutor = new PipelineInlineStageExecutor(env, outputProcessor);
    const stageInput = wrapStructured('seed', 'text', 'seed');

    const result = await inlineExecutor.executeInlineCommandStage({
      stage: {
        type: 'inlineCommand',
        rawIdentifier: 'cmd',
        command: [{ type: 'Text', content: 'echo allowed' }]
      } as any,
      structuredInput: stageInput,
      stageEnv: env,
      stageIndex: 0,
      stageContext: createStageContext(),
      contextFactory
    });

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0]).toContain('echo allowed');
    expect(isStructuredValue(result.result)).toBe(true);
    if (isStructuredValue(result.result)) {
      expect(result.result.text).toBe('ok');
      expect(result.result.data).toBe('ok');
      expect(result.result.mx.source).toBe('cmd');
      expect(result.result.mx.command).toContain('echo allowed');
    }
  });

  it('propagates descriptors through inline value stage normalization', async () => {
    const env = createEnv();
    const outputProcessor = new PipelineOutputProcessor(env);
    const inlineExecutor = new PipelineInlineStageExecutor(env, outputProcessor);
    const stageInput = wrapStructured('seed', 'text', 'seed');
    const secretValue = wrapStructured('classified', 'text', 'classified');
    secretValue.mx = {
      labels: ['secret'],
      taint: ['secret'],
      sources: ['src:test'],
      policy: null
    } as any;

    vi.spyOn(dataValueEvaluator, 'evaluateDataValue').mockResolvedValue(secretValue as any);

    const execution = await inlineExecutor.executeInlineValueStage(
      {
        type: 'inlineValue',
        rawIdentifier: 'inlineValue',
        value: { type: 'Text', content: 'ignored' }
      } as any,
      stageInput,
      env
    );

    const result = execution.result as any;
    expect(result?.mx?.labels ?? []).toEqual(expect.arrayContaining(['secret']));
    expect(execution.labelDescriptor?.labels ?? []).toEqual(expect.arrayContaining(['secret']));
  });
});
