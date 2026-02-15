import { describe, expect, it } from 'vitest';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import {
  parseStructuredJson,
  sanitizeJsonStringControlChars,
  shouldAutoParsePipelineInput,
  wrapJsonLikeString,
  wrapPipelineStructuredValue
} from './structured-input';

describe('command-execution structured input helpers', () => {
  it('sanitizes control characters inside JSON strings and preserves parse behavior', () => {
    const malformed = '{"line":"a\nb"}';
    expect(sanitizeJsonStringControlChars(malformed)).toBe('{"line":"a\\nb"}');
    expect(parseStructuredJson(malformed)).toEqual({ line: 'a\nb' });
    expect(parseStructuredJson('{"line":')).toBeNull();
  });

  it('parses JSON scalar inputs used by pipeline stage bindings', () => {
    expect(parseStructuredJson('10')).toBe(10);
    expect(parseStructuredJson('-2.5')).toBe(-2.5);
    expect(parseStructuredJson('true')).toBe(true);
    expect(parseStructuredJson('false')).toBe(false);
    expect(parseStructuredJson('null')).toBeNull();
    expect(parseStructuredJson('001')).toBeNull();
  });

  it('keeps JSON-like wrapping behavior for object and array payloads', () => {
    const wrappedObject = wrapJsonLikeString('{"count":2}');
    expect(isStructuredValue(wrappedObject)).toBe(true);
    expect(wrappedObject?.type).toBe('object');
    expect(wrappedObject?.data).toEqual({ count: 2 });
    expect(wrappedObject?.text).toBe('{"count":2}');

    const wrappedArray = wrapJsonLikeString('[1,2,3]');
    expect(isStructuredValue(wrappedArray)).toBe(true);
    expect(wrappedArray?.type).toBe('array');
    expect(wrappedArray?.data).toEqual([1, 2, 3]);
    expect(wrappedArray?.text).toBe('[1,2,3]');

    expect(wrapJsonLikeString('plain-text')).toBeNull();
  });

  it('preserves text fallback coercion for wrapped structured values', () => {
    const wrapped = wrapPipelineStructuredValue({ count: 2 }, '{"count":2}') as Record<string, unknown> & {
      trim?: () => string;
      includes?: (search: string) => boolean;
      length?: number;
    };

    expect(wrapped.count).toBe(2);
    expect(String(wrapped)).toBe('{"count":2}');
    expect(wrapped.trim?.()).toBe('{"count":2}');
    expect(wrapped.includes?.('"count"')).toBe(true);
    expect(wrapped.length).toBe('{"count":2}'.length);
  });

  it('keeps non-enumerable hook metadata shape on wrapped payloads', () => {
    const wrapped = wrapPipelineStructuredValue({ nested: { value: 1 } }, '{"nested":{"value":1}}');
    const wrappedRecord = wrapped as Record<string, unknown>;

    expect(Object.keys(wrappedRecord)).toEqual(['nested']);
    expect(wrappedRecord.data).toEqual({ nested: { value: 1 } });
    const textDescriptor = Object.getOwnPropertyDescriptor(wrappedRecord, 'text');
    const rawDescriptor = Object.getOwnPropertyDescriptor(wrappedRecord, 'raw');
    expect(textDescriptor?.enumerable).toBe(false);
    expect(rawDescriptor?.enumerable).toBe(false);
  });

  it('keeps the structured auto-parse language allow-list stable', () => {
    expect(shouldAutoParsePipelineInput('js')).toBe(true);
    expect(shouldAutoParsePipelineInput('node')).toBe(true);
    expect(shouldAutoParsePipelineInput('mlld-foreach')).toBe(true);
    expect(shouldAutoParsePipelineInput('sh')).toBe(false);
    expect(shouldAutoParsePipelineInput(undefined)).toBe(false);
  });
});
