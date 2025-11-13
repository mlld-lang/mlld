import { describe, it, beforeEach, expect } from 'vitest';
import { prepareValueForShadow, prepareParamsForShadow } from './variable-proxy';
import { LoadContentResultImpl } from '../eval/load-content';
import { buildPipelineStructuredValue } from '@interpreter/utils/pipeline-input';

describe('prepareValueForShadow (structured)', () => {
  it('returns native LoadContentResult objects to shadow environments', () => {
    const result = new LoadContentResultImpl({
      content: 'File body',
      filename: 'file.md',
      relative: './file.md',
      absolute: '/repo/file.md'
    });

    const prepared = prepareValueForShadow(result);
    expect(prepared).toBeInstanceOf(LoadContentResultImpl);
    expect(prepared.filename).toBe('file.md');
    expect(prepared.content).toBe('File body');
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
});
