import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isStructuredExecEnabled, wrapExecResult } from './structured-exec';
import { isStructuredValue } from './structured-value';

describe('structured exec flag defaults', () => {
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    } else {
      process.env.MLLD_ENABLE_STRUCTURED_EXEC = previousFlag;
    }
  });

  it('enables structured execution when the flag is unset', () => {
    expect(isStructuredExecEnabled()).toBe(true);
    const result = wrapExecResult('hello');
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.text).toBe('hello');
    }
  });

  it('disables structured execution when the flag is set to a false-like value', () => {
    process.env.MLLD_ENABLE_STRUCTURED_EXEC = 'false';
    expect(isStructuredExecEnabled()).toBe(false);
    const result = wrapExecResult('hello');
    expect(result).toBe('hello');
  });
});
