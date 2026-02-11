import { describe, expect, it } from 'vitest';
import { wrapStructured } from '@interpreter/utils/structured-value';
import {
  cloneStructuredValue,
  extractStageValue,
  formatParallelStageError,
  getStructuredSecurityDescriptor,
  previewValue,
  safeJSONStringify,
  snippet
} from './helpers';

describe('pipeline executor helper primitives', () => {
  it('normalizes parallel branch error messages', () => {
    const error = new Error('Directive error (run): denied by policy at line 4, column 10');
    expect(formatParallelStageError(error)).toBe('denied by policy');
    expect(formatParallelStageError('plain')).toBe('plain');
    expect(formatParallelStageError({ code: 403 })).toBe('{"code":403}');
  });

  it('falls back safely when structured serialization throws', () => {
    const circular: any = {};
    circular.self = circular;
    expect(safeJSONStringify(circular)).toBe('[object Object]');
  });

  it('extracts values from structured wrappers and pipeline-input variables', () => {
    const structured = wrapStructured({ value: 42 }, 'object', '{"value":42}');
    expect(extractStageValue(structured)).toEqual({ value: 42 });

    const pipelineInput = {
      type: 'pipeline-input',
      data: { source: 'upstream' }
    } as any;
    expect(extractStageValue(pipelineInput)).toEqual({ source: 'upstream' });
  });

  it('builds compact previews for debug logging', () => {
    expect(snippet('abcdef', 3)).toBe('abc…');
    expect(previewValue({ a: 1, b: 2 })).toEqual({ keys: ['a', 'b'], size: 2 });

    const preview = previewValue([wrapStructured('x', 'text', 'x'), 2]) as any;
    expect(preview.length).toBe(2);
    expect(preview.sample[0]).toEqual({ type: 'text', text: 'x' });
  });

  it('converts structured mx metadata into security descriptors', () => {
    const structured = wrapStructured('secret', 'text', 'secret');
    structured.mx = {
      labels: ['secret'],
      taint: ['secret'],
      sources: ['src:test'],
      policy: null
    } as any;

    const descriptor = getStructuredSecurityDescriptor(structured);
    expect(descriptor?.labels).toEqual(['secret']);
    expect(descriptor?.taint).toEqual(['secret']);
  });

  it('keeps structured value payload stable through clone helper', () => {
    const source = wrapStructured({ id: 1 }, 'object', '{"id":1}');
    const cloned = cloneStructuredValue(source);

    expect(cloned.text).toBe(source.text);
    expect(cloned.data).toEqual(source.data);
  });
});
