import { describe, it, beforeEach, expect } from 'vitest';
import { prepareValueForShadow, prepareParamsForShadow } from './variable-proxy';
import { LoadContentResultImpl } from '../eval/load-content';
import { buildPipelineStructuredValue } from '@interpreter/utils/pipeline-input';
import { wrapStructured } from '@interpreter/utils/structured-value';

describe('prepareValueForShadow (structured)', () => {
  it('returns plain content strings to shadow environments by default', () => {
    const result = new LoadContentResultImpl({
      content: 'File body',
      filename: 'file.md',
      relative: './file.md',
      absolute: '/repo/file.md'
    });
    expect(result.mx.path).toBe('/repo/file.md');

    const prepared = prepareValueForShadow(result);
    expect(typeof prepared).toBe('string');
    expect(prepared).toBe('File body');
  });

  it('unwraps pipeline inputs to plain data and records metadata', () => {
    const params = prepareParamsForShadow({
      payload: buildPipelineStructuredValue('[{"id":1},{"id":2}]', 'json')
    });

    expect(Array.isArray(params.payload)).toBe(true);
    expect(params.payload).toEqual([{ id: 1 }, { id: 2 }]);
    expect(params.__mlldPrimitiveMetadata).toBeDefined();
    expect(params.__mlldPrimitiveMetadata.payload).toMatchObject({
      type: 'json'
    });
  });

  it('does not materialize lazy structured object text while recording metadata', () => {
    let stringifyAttempts = 0;
    const payload = wrapStructured(
      {
        ok: true,
        toJSON() {
          stringifyAttempts += 1;
          return { ok: true };
        }
      },
      'object'
    );

    const params = prepareParamsForShadow({ payload });

    expect(params.payload).toEqual({ ok: true, toJSON: expect.any(Function) });
    expect(params.__mlldPrimitiveMetadata.payload).toMatchObject({
      type: 'object'
    });
    expect(params.__mlldPrimitiveMetadata.payload).not.toHaveProperty('text');
    expect(stringifyAttempts).toBe(0);
  });

  it('unwraps nested StructuredValue elements inside arrays for shadow params', () => {
    const nestedItem = wrapStructured(
      { findings: [{ id: 1 }] },
      'object',
      '{"findings":[{"id":1}]}'
    );
    const arrayPayload = wrapStructured([nestedItem], 'array', '[{"findings":[{"id":1}]}]');
    const params = prepareParamsForShadow({ items: arrayPayload });

    expect(Array.isArray(params.items)).toBe(true);
    expect(params.items[0]).toEqual({ findings: [{ id: 1 }] });
    expect((params.items[0] as any).type).toBeUndefined();
    expect(params.items.map((item: any) => item.findings[0].id)).toEqual([1]);
  });
});
