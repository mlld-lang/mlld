import { describe, expect, it } from 'vitest';
import type { GuardResult } from '@core/types/guard';
import type { GuardContextSnapshot, OperationContext } from '@interpreter/env/ContextManager';
import { GuardError } from '@core/errors/GuardError';
import { GuardRetrySignal } from '@core/errors/GuardRetrySignal';
import {
  buildPostGuardError,
  buildPostGuardRetrySignal,
  buildPostRetryDeniedError
} from '@interpreter/hooks/guard-post-signals';

function createGuardResults(): GuardResult[] {
  const guardContext = {
    timing: 'after',
    decision: 'retry',
    reasons: ['r1'],
    hints: [],
    trace: []
  } as GuardContextSnapshot;

  return [
    {
      guardName: 'retryGuard',
      decision: 'retry',
      reason: 'retry requested',
      hint: { guardName: 'retryGuard', hint: 'retry-hint', severity: 'warn' },
      metadata: {
        guardFilter: 'secret',
        scope: 'perInput',
        inputPreview: 'input-preview',
        guardContext
      }
    }
  ];
}

const OPERATION: OperationContext = {
  type: 'exe',
  name: 'emit'
};

describe('guard post signal builders', () => {
  it('builds deny guard errors with baseline payload shape', () => {
    const guardResults = createGuardResults();
    const error = buildPostGuardError({
      guardResults,
      reasons: ['denied'],
      operation: OPERATION,
      outputPreview: 'output-preview',
      timing: 'after'
    });

    expect(error).toBeInstanceOf(GuardError);
    expect(error.decision).toBe('deny');
    expect(error.details.reason).toBe('denied');
    expect(error.details.outputPreview).toBe('output-preview');
    expect(error.details.reasons).toEqual(['denied']);
    expect(Array.isArray(error.details.hints)).toBe(true);
    expect(Array.isArray(error.details.guardResults)).toBe(true);
  });

  it('builds retry denied errors with retry hints and reasons preserved', () => {
    const guardResults = createGuardResults();
    const error = buildPostRetryDeniedError({
      guardResults,
      reasons: ['retry requested'],
      hints: [{ guardName: 'retryGuard', hint: 'retry-hint', severity: 'warn' }],
      operation: OPERATION,
      outputPreview: 'output-preview',
      retryHint: 'retry-hint'
    });

    expect(error).toBeInstanceOf(GuardError);
    expect(error.decision).toBe('deny');
    expect(error.details.retryHint).toBe('retry-hint');
    expect(error.details.reason).toContain('Cannot retry');
    expect(error.details.reasons).toEqual(['retry requested']);
    expect(error.details.hints?.[0]?.hint).toBe('retry-hint');
  });

  it('builds retry signals with retry metadata payload', () => {
    const guardResults = createGuardResults();
    const signal = buildPostGuardRetrySignal({
      guardResults,
      reasons: ['retry requested'],
      hints: [{ guardName: 'retryGuard', hint: 'retry-hint', severity: 'warn' }],
      operation: OPERATION,
      outputPreview: 'output-preview',
      retryHint: 'retry-hint'
    });

    expect(signal).toBeInstanceOf(GuardRetrySignal);
    expect(signal.decision).toBe('retry');
    expect(signal.details.retryHint).toBe('retry-hint');
    expect(signal.details.outputPreview).toBe('output-preview');
    expect(signal.details.reasons).toEqual(['retry requested']);
    expect(signal.details.hints?.[0]?.hint).toBe('retry-hint');
    expect(Array.isArray(signal.details.guardResults)).toBe(true);
  });
});
