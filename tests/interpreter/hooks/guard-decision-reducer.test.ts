import { describe, expect, it } from 'vitest';
import type { GuardResult } from '@core/types/guard';
import {
  applyGuardDecisionResult,
  createGuardDecisionState,
  shouldClearAttemptState,
  toHookAction
} from '@interpreter/hooks/guard-decision-reducer';

function guardResult(overrides: Partial<GuardResult>): GuardResult {
  return {
    guardName: 'guard',
    decision: 'allow',
    ...overrides
  };
}

describe('guard decision reducer', () => {
  it('accumulates mixed traces for per-input semantics without retry overriding deny', () => {
    const state = createGuardDecisionState();

    applyGuardDecisionResult(
      state,
      guardResult({
        decision: 'env',
        guardName: 'env-first',
        envConfig: { mode: 'safe' }
      }),
      { retryOverridesDeny: false }
    );
    applyGuardDecisionResult(
      state,
      guardResult({
        decision: 'env',
        guardName: 'env-second',
        envConfig: { mode: 'unsafe' }
      }),
      { retryOverridesDeny: false }
    );
    applyGuardDecisionResult(
      state,
      guardResult({
        decision: 'retry',
        reason: 'try-again',
        metadata: { source: 'retry' }
      }),
      { retryOverridesDeny: false }
    );
    applyGuardDecisionResult(
      state,
      guardResult({
        decision: 'deny',
        reason: 'hard-stop',
        metadata: { source: 'deny' }
      }),
      { retryOverridesDeny: false }
    );
    applyGuardDecisionResult(
      state,
      guardResult({
        decision: 'retry',
        reason: 'ignored-after-deny',
        metadata: { source: 'late-retry' }
      }),
      { retryOverridesDeny: false }
    );

    expect(state.decision).toBe('deny');
    expect(state.reasons).toEqual(['try-again', 'hard-stop']);
    expect(state.primaryMetadata).toEqual({ source: 'retry' });
    expect(state.selectedEnvConfig).toEqual({ mode: 'safe' });
    expect(state.selectedEnvGuard).toBe('env-first');
  });

  it('allows retry to override deny when configured for per-operation semantics', () => {
    const state = createGuardDecisionState();

    applyGuardDecisionResult(
      state,
      guardResult({
        decision: 'deny',
        reason: 'operation-denied',
        metadata: { source: 'deny' }
      }),
      { retryOverridesDeny: true }
    );
    applyGuardDecisionResult(
      state,
      guardResult({
        decision: 'retry',
        reason: 'operation-retry'
      }),
      { retryOverridesDeny: true }
    );

    expect(state.decision).toBe('retry');
    expect(state.reasons).toEqual(['operation-denied', 'operation-retry']);
    expect(state.primaryMetadata).toEqual({ source: 'deny' });
  });

  it('maps cleanup and hook actions from aggregate decisions', () => {
    expect(shouldClearAttemptState('allow')).toBe(true);
    expect(shouldClearAttemptState('deny')).toBe(true);
    expect(shouldClearAttemptState('retry')).toBe(false);

    expect(toHookAction('allow')).toBe('continue');
    expect(toHookAction('retry')).toBe('retry');
    expect(toHookAction('deny')).toBe('abort');
  });
});
