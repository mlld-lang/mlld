import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuardError } from '@core/errors/GuardError';
import { MlldDenialError } from '@core/errors/denial';
import { handleExecGuardDenial } from './guard-denial-handler';

const { evaluateWhenExpressionMock } = vi.hoisted(() => ({
  evaluateWhenExpressionMock: vi.fn()
}));

vi.mock('./when-expression', () => ({
  evaluateWhenExpression: evaluateWhenExpressionMock
}));

function createMockExecEnv() {
  return {
    withDeniedContext: vi.fn(async (_context, run: () => Promise<any>) => run()),
    withGuardContext: vi.fn(async (_context, run: () => Promise<any>) => run()),
    getVariable: vi.fn(() => undefined),
    setParameterVariable: vi.fn()
  } as any;
}

describe('handleExecGuardDenial', () => {
  beforeEach(() => {
    evaluateWhenExpressionMock.mockReset();
  });

  it('does not emit guard warnings when no denied handler executes', async () => {
    const execEnv = createMockExecEnv();
    const env = {
      emitEffect: vi.fn(),
      recordSecurityDescriptor: vi.fn(),
      recordGuardDenialFromError: vi.fn()
    } as any;

    evaluateWhenExpressionMock.mockResolvedValue({
      value: 'fallback',
      env: execEnv,
      internal: {}
    });

    const error = new GuardError({
      decision: 'deny',
      reason: 'blocked',
      guardName: 'blocker',
      guardFilter: 'op:exe',
      guardContext: { name: '@blocker' } as any,
      guardInput: { secret: 'value' }
    });

    const result = await handleExecGuardDenial(error, {
      execEnv,
      env,
      whenExprNode: {} as any
    });

    expect(result).toBeNull();
    expect(env.emitEffect).not.toHaveBeenCalled();
  });

  it('emits one guard warning when denied handler runs', async () => {
    const execEnv = createMockExecEnv();
    const env = {
      emitEffect: vi.fn(),
      recordSecurityDescriptor: vi.fn(),
      recordGuardDenialFromError: vi.fn()
    } as any;

    evaluateWhenExpressionMock.mockResolvedValue({
      value: 'fallback',
      env: execEnv,
      internal: { deniedHandlerRan: true }
    });

    const error = new GuardError({
      decision: 'deny',
      reason: 'blocked',
      guardName: 'blocker',
      guardFilter: 'op:exe',
      guardContext: { name: '@blocker' } as any,
      guardInput: { secret: 'value' }
    });

    const result = await handleExecGuardDenial(error, {
      execEnv,
      env,
      whenExprNode: {} as any
    });

    expect(result).not.toBeNull();
    expect(env.emitEffect).toHaveBeenCalledTimes(1);
    expect(env.emitEffect).toHaveBeenCalledWith(
      'stderr',
      expect.stringContaining('[Guard Warning] blocked')
    );
  });

  it('does not handle hard policy denials', async () => {
    const execEnv = createMockExecEnv();
    const env = {
      emitEffect: vi.fn(),
      recordSecurityDescriptor: vi.fn(),
      recordGuardDenialFromError: vi.fn()
    } as any;

    const error = new MlldDenialError({
      code: 'POLICY_LABEL_FLOW_DENIED',
      operation: { type: 'exe', description: 'write' },
      blocker: { type: 'policy', name: '@policy', rule: 'no-untrusted-destructive' },
      reason: 'hard deny'
    });

    const result = await handleExecGuardDenial(error, {
      execEnv,
      env,
      whenExprNode: {} as any
    });

    expect(result).toBeNull();
    expect(evaluateWhenExpressionMock).not.toHaveBeenCalled();
    expect(env.emitEffect).not.toHaveBeenCalled();
  });
});
