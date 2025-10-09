import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isStructuredExecEnabled, wrapExecResult } from './structured-exec';
import { isStructuredValue } from './structured-value';

describe('structured exec wrapping', () => {
  it('always reports structured execution enabled', () => {
    expect(isStructuredExecEnabled()).toBe(true);
  });

  it('wraps plain values into StructuredValue regardless of env overrides', () => {
    process.env.MLLD_ENABLE_STRUCTURED_EXEC = 'false';
    const result = wrapExecResult('hello');
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.text).toBe('hello');
    }
    delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
  });
});
