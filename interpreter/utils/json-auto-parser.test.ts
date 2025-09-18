import { describe, it, expect } from 'vitest';
import { tryParseJson, processCommandOutput } from './json-auto-parser';

describe('json-auto-parser', () => {
  it('parses small integers as JSON numbers', () => {
    const result = tryParseJson('42');
    expect(result.isJson).toBe(true);
    expect(result.value).toBe(42);
  });

  it('preserves integers that exceed Number safe range as strings', () => {
    const raw = '1417671839676891206';
    const parseResult = tryParseJson(raw);
    expect(parseResult.isJson).toBe(false);
    expect(parseResult.value).toBe(raw);

    const processed = processCommandOutput(raw);
    expect(processed).toBe(raw);
  });
});
