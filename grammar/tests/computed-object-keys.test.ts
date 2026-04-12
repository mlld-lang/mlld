import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

describe('computed object key grammar', () => {
  it('parses bracket computed object keys in var assignments', async () => {
    const result = await parse('/var @obj = { [@key]: @value }', { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = result.ast[0] as any;
    const objectValue = node.values.value?.[0];
    expect(node.kind).toBe('var');
    expect(objectValue?.type).toBe('object');
    expect(objectValue?.entries).toHaveLength(1);
    expect(objectValue.entries[0]).toMatchObject({
      type: 'pair',
      key: {
        type: 'VariableReference',
        identifier: 'key'
      },
      value: {
        type: 'VariableReference',
        identifier: 'value'
      }
    });
  });
});
