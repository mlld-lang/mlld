import { describe, it, expect } from 'vitest';
import { GuardError } from './GuardError';

describe('GuardError', () => {
  it('formats deny messages with guard and operation context', () => {
    const error = new GuardError({
      decision: 'deny',
      guardName: '@secretProtection',
      guardFilter: 'data:secret',
      operation: {
        type: 'show'
      },
      reason: 'Secrets cannot be displayed'
    });

    expect(error.message).toContain('Guard blocked operation: Secrets cannot be displayed');
    expect(error.message).toContain('Guard: @secretProtection (for data:secret)');
    expect(error.message).toContain('Operation: /show');
    expect(error.reason).toBe('Secrets cannot be displayed');
  });

  it('formats retry failure messaging with hint details', () => {
    const error = new GuardError({
      decision: 'deny',
      guardName: '@jsonValidator',
      guardFilter: 'data:llmjson',
      operation: {
        type: 'run',
        subtype: 'js'
      },
      reason: 'Cannot retry: Invalid JSON from LLM (source not retryable)',
      retryHint: 'Invalid JSON from LLM'
    });

    expect(error.message).toContain('Guard retry failed: Cannot retry: Invalid JSON from LLM (source not retryable)');
    expect(error.message).toContain('Guard: @jsonValidator (for data:llmjson)');
    expect(error.message).toContain('Operation: /run (js)');
    expect(error.message).toContain('Hint: Invalid JSON from LLM');
  });

  it('formats retry requests when guard allows re-execution', () => {
    const error = new GuardError({
      decision: 'retry',
      guardFilter: 'data:pii',
      operation: {
        type: 'run',
        subtype: 'cmd'
      },
      retryHint: 'Mask sensitive data'
    });

    expect(error.message).toContain('Guard retry requested: Mask sensitive data');
    expect(error.message).toContain('Guard: data:pii');
    expect(error.message).toContain('Operation: /run (cmd)');
    expect(error.message).toContain('Hint: Mask sensitive data');
  });
});
