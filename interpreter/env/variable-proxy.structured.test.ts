import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { prepareValueForShadow } from './variable-proxy';
import { LoadContentResultImpl } from '../eval/load-content';
import { isStructuredValue, asText } from '@interpreter/utils/structured-value';

describe('prepareValueForShadow (structured flag)', () => {
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    process.env.MLLD_ENABLE_STRUCTURED_EXEC = 'true';
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    } else {
      process.env.MLLD_ENABLE_STRUCTURED_EXEC = previousFlag;
    }
  });

  it('wraps load-content results before exposing to shadow environments', () => {
    const result = new LoadContentResultImpl({
      content: 'File body',
      filename: 'file.md',
      relative: './file.md',
      absolute: '/repo/file.md'
    });

    const prepared = prepareValueForShadow(result);
    expect(isStructuredValue(prepared)).toBe(true);
    if (isStructuredValue(prepared)) {
      expect(prepared.metadata?.filename).toBe('file.md');
      expect(asText(prepared)).toBe('File body');
    }
  });
});
