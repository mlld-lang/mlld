import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { HookableNode } from '@core/types/hooks';
import { GuardError } from '@core/errors/GuardError';
import { GuardRetrySignal } from '@core/errors/GuardRetrySignal';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { Environment } from '@interpreter/env/Environment';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { HookDecision } from '@interpreter/hooks/HookManager';
import {
  getNormalizedHookDecisionAction,
  handleGuardDecision,
  normalizeHookDecision
} from '@interpreter/hooks/hook-decision-handler';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function parseHookNode(): HookableNode {
  return parseSync('/show "ok"')[0] as HookableNode;
}

function createOperationContext(): OperationContext {
  return {
    type: 'show',
    name: 'show',
    labels: ['public'],
    opLabels: ['op:show']
  };
}

describe('checkpoint decision adapter', () => {
  it('maps legacy checkpoint-hit metadata into fulfill action', () => {
    const decision: HookDecision = {
      action: 'continue',
      metadata: {
        checkpointHit: true,
        cachedResult: { value: 'cached' }
      }
    };

    const normalized = normalizeHookDecision(decision);
    expect(normalized.action).toBe('fulfill');
    expect(getNormalizedHookDecisionAction(decision)).toBe('fulfill');
    expect(normalized.metadata?.cachedResult).toEqual({ value: 'cached' });
  });

  it('preserves non-checkpoint decisions', () => {
    const continueDecision: HookDecision = { action: 'continue', metadata: { reason: 'none' } };
    const retryDecision: HookDecision = { action: 'retry', metadata: { hint: 'again' } };
    const fulfillDecision: HookDecision = { action: 'fulfill', metadata: { cachedResult: 1 } };

    expect(normalizeHookDecision(continueDecision).action).toBe('continue');
    expect(normalizeHookDecision(retryDecision).action).toBe('retry');
    expect(normalizeHookDecision(fulfillDecision).action).toBe('fulfill');
  });
});

describe('guard decision compatibility', () => {
  it('keeps continue/fulfill as no-op actions', async () => {
    const env = createEnv();
    const node = parseHookNode();
    const operation = createOperationContext();

    await expect(handleGuardDecision({ action: 'continue' }, node, env, operation)).resolves.toBeUndefined();
    await expect(
      handleGuardDecision(
        { action: 'continue', metadata: { checkpointHit: true, cachedResult: 'hit' } },
        node,
        env,
        operation
      )
    ).resolves.toBeUndefined();
    await expect(
      handleGuardDecision({ action: 'fulfill', metadata: { cachedResult: 'hit' } }, node, env, operation)
    ).resolves.toBeUndefined();
  });

  it('keeps abort/deny mapped to GuardError deny semantics', async () => {
    const env = createEnv();
    const node = parseHookNode();
    const operation = createOperationContext();

    await expect(
      handleGuardDecision(
        { action: 'abort', metadata: { reason: 'blocked-by-abort' } },
        node,
        env,
        operation
      )
    ).rejects.toMatchObject({ decision: 'deny' } satisfies Partial<GuardError>);

    await expect(
      handleGuardDecision(
        { action: 'deny', metadata: { reason: 'blocked-by-deny' } },
        node,
        env,
        operation
      )
    ).rejects.toMatchObject({ decision: 'deny' } satisfies Partial<GuardError>);
  });

  it('keeps retry mapped to GuardRetrySignal for retryable pipeline contexts', async () => {
    const env = createEnv();
    const node = parseHookNode();
    const operation = createOperationContext();

    env.setPipelineContext({
      stage: 1,
      totalStages: 1,
      currentCommand: 'show',
      input: 'x',
      previousOutputs: [],
      sourceRetryable: true
    });

    await expect(
      handleGuardDecision({ action: 'retry', metadata: { hint: 'retry-now' } }, node, env, operation)
    ).rejects.toBeInstanceOf(GuardRetrySignal);
  });
});
