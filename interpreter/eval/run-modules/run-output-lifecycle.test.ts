import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  applyRunWithClausePipeline,
  finalizeRunOutputLifecycle,
  finalizeRunStreamingLifecycle
} from './run-output-lifecycle';
import { processPipeline } from '@interpreter/eval/pipeline/unified-processor';

vi.mock('@interpreter/eval/pipeline/unified-processor', () => ({
  processPipeline: vi.fn()
}));

function createEnv(basePath: string = process.cwd()): Environment {
  const env = new Environment(new NodeFileSystem(), new PathService(), basePath);
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function createDirective(meta: Record<string, unknown> = {}): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'run',
    subtype: 'runCommand',
    nodeId: 'run-node',
    source: 'command',
    values: {},
    meta
  } as unknown as DirectiveNode;
}

describe('run output lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips pipeline processing when withClause.pipeline is absent', async () => {
    const env = createEnv();
    const mockedProcessPipeline = vi.mocked(processPipeline);
    const result = await applyRunWithClausePipeline({
      withClause: undefined,
      outputValue: 'seed',
      env,
      directive: createDirective()
    });

    expect(result).toBeUndefined();
    expect(mockedProcessPipeline).not.toHaveBeenCalled();
  });

  it('applies pipeline processing with stage-0 retryability and descriptor hints', async () => {
    const env = createEnv();
    const mockedProcessPipeline = vi.mocked(processPipeline);
    mockedProcessPipeline.mockResolvedValue('pipeline-output' as any);
    const sourceNode = { type: 'ExecInvocation', commandRef: 'seed' };
    const pendingDescriptor = makeSecurityDescriptor({
      labels: ['pending'],
      taint: ['pending'],
      sources: ['pending:test']
    });
    const lastDescriptor = makeSecurityDescriptor({
      labels: ['last'],
      taint: ['last'],
      sources: ['last:test']
    });

    const result = await applyRunWithClausePipeline({
      withClause: { pipeline: [{ type: 'VariableReference', identifier: 'id' }] as any } as any,
      outputValue: 'seed',
      pendingOutputDescriptor: pendingDescriptor,
      lastOutputDescriptor: lastDescriptor,
      sourceNodeForPipeline: sourceNode,
      env,
      directive: createDirective()
    });

    expect(result).toBe('pipeline-output');
    expect(mockedProcessPipeline).toHaveBeenCalledTimes(1);
    const call = mockedProcessPipeline.mock.calls[0][0] as any;
    expect(call.isRetryable).toBe(true);
    expect(call.value.internal.isRetryable).toBe(true);
    expect(call.value.internal.sourceFunction).toBe(sourceNode);
    expect(call.descriptorHint?.labels).toEqual(expect.arrayContaining(['pending', 'last']));
  });

  it('finalizes streaming and exposes adapter-formatted text when available', () => {
    const env = createEnv();
    const setStreamingResultSpy = vi.spyOn(env, 'setStreamingResult');
    const streamingManager = {
      finalizeResults: vi.fn(() => ({
        streaming: {
          text: '{"json":"line"}'
        }
      }))
    };

    const formattedResult = finalizeRunStreamingLifecycle({
      env,
      streamingManager,
      hasStreamFormat: true
    });
    expect(setStreamingResultSpy).toHaveBeenCalledWith({ text: '{"json":"line"}' });
    expect(formattedResult.formattedText).toBe('{"json":"line"}');

    const plainResult = finalizeRunStreamingLifecycle({
      env,
      streamingManager,
      hasStreamFormat: false
    });
    expect(plainResult.formattedText).toBeUndefined();
  });

  it('normalizes display text, inserts output nodes, and emits effects when eligible', () => {
    const env = createEnv();
    const addNodeSpy = vi.spyOn(env, 'addNode');
    const emitEffectSpy = vi.spyOn(env, 'emitEffect');
    const recordDescriptorSpy = vi.spyOn(env, 'recordSecurityDescriptor');

    const result = finalizeRunOutputLifecycle({
      directive: createDirective(),
      env,
      outputValue: 'hello',
      outputText: 'hello',
      hasStreamFormat: false,
      streamingEnabled: true
    });

    expect(result.displayText).toBe('hello\n');
    expect(addNodeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Text',
        nodeId: 'run-node-output',
        content: 'hello\n'
      })
    );
    expect(emitEffectSpy).toHaveBeenCalledWith('both', 'hello\n');
    expect(recordDescriptorSpy).not.toHaveBeenCalled();
  });

  it('preserves output emission gating for stream-format and embedded/data/RHS contexts', () => {
    const env = createEnv();
    const emitEffectSpy = vi.spyOn(env, 'emitEffect');
    const addNodeSpy = vi.spyOn(env, 'addNode');

    finalizeRunOutputLifecycle({
      directive: createDirective(),
      env,
      outputValue: 'formatted',
      outputText: 'formatted',
      hasStreamFormat: true,
      streamingEnabled: true
    });
    expect(emitEffectSpy).not.toHaveBeenCalled();
    expect(addNodeSpy).toHaveBeenCalledTimes(1);

    finalizeRunOutputLifecycle({
      directive: createDirective({ isEmbedded: true }),
      env,
      outputValue: 'embedded',
      outputText: 'embedded',
      hasStreamFormat: false,
      streamingEnabled: false
    });
    finalizeRunOutputLifecycle({
      directive: createDirective({ isDataValue: true }),
      env,
      outputValue: 'data',
      outputText: 'data',
      hasStreamFormat: false,
      streamingEnabled: false
    });
    finalizeRunOutputLifecycle({
      directive: createDirective({ isRHSRef: true }),
      env,
      outputValue: 'rhs',
      outputText: 'rhs',
      hasStreamFormat: false,
      streamingEnabled: false
    });
    finalizeRunOutputLifecycle({
      directive: createDirective(),
      env,
      outputValue: 'whitespace',
      outputText: '   ',
      hasStreamFormat: false,
      streamingEnabled: false
    });

    expect(emitEffectSpy).toHaveBeenCalledTimes(0);
    expect(addNodeSpy).toHaveBeenCalledTimes(3);
  });
});
