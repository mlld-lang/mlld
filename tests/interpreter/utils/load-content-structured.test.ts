import { describe, it, expect } from 'vitest';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';

describe('wrapLoadContentValue JSON/JSONL auto-parse', () => {
  it('parses .json into structured data', () => {
    const result = wrapLoadContentValue({
      content: '{"items":[1,2,3]}',
      filename: 'data.json',
      relative: './data.json',
      absolute: '/tmp/data.json'
    });

    expect(result).toMatchObject({
      type: 'object',
      data: { items: [1, 2, 3] },
      text: '{"items":[1,2,3]}'
    });
  });

  it('parses .jsonl into array data', () => {
    const result = wrapLoadContentValue({
      content: '{"a":1}\n{"b":2}\n',
      filename: 'data.jsonl',
      relative: './data.jsonl',
      absolute: '/tmp/data.jsonl'
    });

    expect(result).toMatchObject({
      type: 'array',
      data: [{ a: 1 }, { b: 2 }],
      text: '{"a":1}\n{"b":2}\n'
    });
  });
});
