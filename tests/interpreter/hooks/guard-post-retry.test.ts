import { describe, expect, it } from 'vitest';
import type { OperationContext, PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import {
  evaluateRetryEnforcement,
  getGuardRetryContext
} from '@interpreter/hooks/guard-post-retry';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('guard post retry utilities', () => {
  it('falls back to default retry context when guardRetry context is missing', () => {
    const env = createEnv();
    const snapshot = getGuardRetryContext(env);

    expect(snapshot).toEqual({
      attempt: 1,
      tries: [],
      hintHistory: [],
      max: 3
    });
  });

  it('normalizes retry context entries and hint history values', () => {
    const env = createEnv();
    env.getContextManager().pushGenericContext('guardRetry', {
      attempt: 2,
      tries: [{ decision: 'retry', hint: 'h1' }, { attempt: 4 }],
      hintHistory: ['h1', null, 42],
      max: 7
    });

    const snapshot = getGuardRetryContext(env);
    env.getContextManager().popGenericContext('guardRetry');

    expect(snapshot.attempt).toBe(2);
    expect(snapshot.max).toBe(7);
    expect(snapshot.tries).toEqual([
      { attempt: 2, decision: 'retry', hint: 'h1' },
      { attempt: 4, decision: 'retry', hint: null }
    ]);
    expect(snapshot.hintHistory).toEqual(['h1', null, '42']);
  });

  it('evaluates retry enforcement with pipeline source gating and metadata fallback', () => {
    const operationWithRetryableSource: OperationContext = {
      type: 'exe',
      metadata: { sourceRetryable: true }
    };
    const operationWithoutRetryableSource: OperationContext = {
      type: 'exe',
      metadata: { sourceRetryable: false }
    };
    const nonRetryablePipeline: PipelineContextSnapshot = {
      stage: 1,
      totalStages: 1,
      currentCommand: 'emit',
      input: 'input',
      previousOutputs: [],
      attemptCount: 1,
      attemptHistory: [],
      hint: null,
      hintHistory: [],
      sourceRetryable: false,
      guards: []
    };

    const metadataOnly = evaluateRetryEnforcement(operationWithRetryableSource, null);
    expect(metadataOnly).toEqual({ sourceRetryable: true, denyRetry: false });

    const pipelineDenied = evaluateRetryEnforcement(operationWithRetryableSource, nonRetryablePipeline);
    expect(pipelineDenied).toEqual({ sourceRetryable: false, denyRetry: true });

    const pipelineAllowed = evaluateRetryEnforcement(operationWithoutRetryableSource, {
      ...nonRetryablePipeline,
      sourceRetryable: true
    });
    expect(pipelineAllowed).toEqual({ sourceRetryable: true, denyRetry: false });
  });
});
