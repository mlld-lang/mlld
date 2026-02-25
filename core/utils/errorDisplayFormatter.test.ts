import { afterEach, describe, expect, it } from 'vitest';
import { GuardError } from '@core/errors/GuardError';
import { ErrorDisplayFormatter } from './errorDisplayFormatter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

function createGuardError(): GuardError {
  return new GuardError({
    decision: 'deny',
    reason: 'Denied by guard policy',
    guardName: 'policyGuard',
    guardFilter: 'op:exe',
    guardInput: { token: 'sk-live' },
    guardContext: {
      name: '@policyGuard',
      reason: 'Denied by guard policy',
      trace: [{ decision: 'deny', reason: 'Denied by guard policy' }]
    } as any,
    guardResults: [{ decision: 'deny', reason: 'Denied by guard policy' }] as any,
    hints: [{ type: 'retry', message: 'Do not retry' }] as any
  });
}

describe('ErrorDisplayFormatter guard detail verbosity', () => {
  const originalDebug = process.env.MLLD_DEBUG;

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.MLLD_DEBUG;
    } else {
      process.env.MLLD_DEBUG = originalDebug;
    }
  });

  it('hides verbose guard details when debug mode is disabled', async () => {
    delete process.env.MLLD_DEBUG;

    const formatter = new ErrorDisplayFormatter(new MemoryFileSystem());
    const output = await formatter.formatError(createGuardError(), {
      useColors: false,
      showSourceContext: false
    });

    expect(output).toContain('Guard blocked operation: Denied by guard policy');
    expect(output).not.toContain('guardContext:');
    expect(output).not.toContain('guardInput:');
    expect(output).not.toContain('guardResults:');
  });

  it('shows verbose guard details when debug mode is enabled', async () => {
    process.env.MLLD_DEBUG = 'true';

    const formatter = new ErrorDisplayFormatter(new MemoryFileSystem());
    const output = await formatter.formatError(createGuardError(), {
      useColors: false,
      showSourceContext: false
    });

    expect(output).toContain('guardContext:');
    expect(output).toContain('guardInput:');
    expect(output).toContain('guardResults:');
  });
});
