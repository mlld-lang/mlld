import { describe, it, expect } from 'vitest';
import { tryParseJson, processCommandOutput } from './json-auto-parser';
import { isStructuredValue } from './structured-value';

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
    expect(isStructuredValue(processed)).toBe(true);
    expect(processed.data).toBe(raw);
    expect(processed.text).toBe(raw);
    expect(processed.mx.source).toBe('cmd');
  });

  it('wraps parsed command JSON with raw text and execution metadata', () => {
    const raw = '{\"status\":\"ok\"}\n';
    const processed = processCommandOutput(raw, undefined, {
      source: 'cmd',
      command: 'echo {"status":"ok"}',
      exitCode: 0,
      duration: 12
    });

    expect(isStructuredValue(processed)).toBe(true);
    expect(processed.type).toBe('object');
    expect(processed.text).toBe(raw);
    expect(processed.data).toEqual({ status: 'ok' });
    expect(processed.mx.source).toBe('cmd');
    expect(processed.mx.command).toBe('echo {"status":"ok"}');
    expect(processed.mx.exitCode).toBe(0);
    expect(processed.mx.duration).toBe(12);
  });
});
