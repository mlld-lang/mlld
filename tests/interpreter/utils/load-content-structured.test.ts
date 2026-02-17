import { describe, it, expect } from 'vitest';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import { isStructuredValue } from '@interpreter/utils/structured-value';

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

describe('JSON5 fallback', () => {
  it('parses .json with trailing commas via JSON5 fallback', () => {
    const result = wrapLoadContentValue({
      content: '{"name": "Alice", "id": 1,}',
      filename: 'data.json',
      relative: './data.json',
      absolute: '/tmp/data.json'
    });

    expect(result).toMatchObject({
      type: 'object',
      data: { name: 'Alice', id: 1 }
    });
  });

  it('parses .json with single quotes via JSON5 fallback', () => {
    const result = wrapLoadContentValue({
      content: "{'name': 'Bob'}",
      filename: 'data.json',
      relative: './data.json',
      absolute: '/tmp/data.json'
    });

    expect(result).toMatchObject({
      type: 'object',
      data: { name: 'Bob' }
    });
  });

  it('parses .json with comments via JSON5 fallback', () => {
    const result = wrapLoadContentValue({
      content: '{\n  // a comment\n  "name": "Charlie"\n}',
      filename: 'data.json',
      relative: './data.json',
      absolute: '/tmp/data.json'
    });

    expect(result).toMatchObject({
      type: 'object',
      data: { name: 'Charlie' }
    });
  });

  it('parses non-.json content with trailing commas via JSON5 fallback in tryParseJson', () => {
    const result = wrapLoadContentValue({
      content: '{"name": "Dana", "id": 2,}',
      filename: 'data.txt',
      relative: './data.txt',
      absolute: '/tmp/data.txt'
    });

    expect(result).toMatchObject({
      type: 'object',
      data: { name: 'Dana', id: 2 }
    });
  });

  it('parses .jsonl with trailing commas via JSON5 fallback', () => {
    const result = wrapLoadContentValue({
      content: '{"a": 1,}\n{"b": 2,}\n',
      filename: 'data.jsonl',
      relative: './data.jsonl',
      absolute: '/tmp/data.jsonl'
    });

    expect(result).toMatchObject({
      type: 'array',
      data: [{ a: 1 }, { b: 2 }]
    });
  });

  it('still throws for truly invalid JSON in single .json file', () => {
    expect(() => wrapLoadContentValue({
      content: '{ invalid json here',
      filename: 'bad.json',
      relative: './bad.json',
      absolute: '/tmp/bad.json'
    })).toThrow('Failed to parse JSON');
  });
});

describe('per-item parse resilience in glob arrays', () => {
  it('preserves all items when one .json file is malformed', () => {
    const items = [
      { content: '{"name": "Alice"}', filename: 'a.json', relative: './a.json', absolute: '/tmp/a.json' },
      { content: '{ invalid json here', filename: 'bad.json', relative: './bad.json', absolute: '/tmp/bad.json' },
      { content: '{"name": "Charlie"}', filename: 'c.json', relative: './c.json', absolute: '/tmp/c.json' }
    ];

    const result = wrapLoadContentValue(items);

    expect(result.type).toBe('array');
    const data = result.data as any[];
    expect(data).toHaveLength(3);

    // First item parsed normally
    expect(isStructuredValue(data[0])).toBe(true);
    expect(data[0].data).toEqual({ name: 'Alice' });

    // Second item degraded to text with parseError in metadata
    expect(isStructuredValue(data[1])).toBe(true);
    expect(data[1].type).toBe('text');
    expect(data[1].text).toBe('{ invalid json here');
    expect(data[1].metadata?.parseError).toBeTruthy();

    // Third item parsed normally
    expect(isStructuredValue(data[2])).toBe(true);
    expect(data[2].data).toEqual({ name: 'Charlie' });
  });

  it('all items valid means no degradation', () => {
    const items = [
      { content: '{"name": "Alice"}', filename: 'a.json', relative: './a.json', absolute: '/tmp/a.json' },
      { content: '{"name": "Bob"}', filename: 'b.json', relative: './b.json', absolute: '/tmp/b.json' }
    ];

    const result = wrapLoadContentValue(items);
    const data = result.data as any[];
    expect(data).toHaveLength(2);
    expect(data[0].data).toEqual({ name: 'Alice' });
    expect(data[1].data).toEqual({ name: 'Bob' });
  });

  it('single malformed .json still throws (non-array context)', () => {
    expect(() => wrapLoadContentValue({
      content: '{ invalid json here',
      filename: 'bad.json',
      relative: './bad.json',
      absolute: '/tmp/bad.json'
    })).toThrow('Failed to parse JSON');
  });
});
