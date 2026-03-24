import { describe, expect, it } from 'vitest';
import { coerceMcpArgs, deriveMcpParamInfo, type McpParamInfo } from './coerce';

function info(opts: {
  types: Record<string, string>;
  nullable?: Record<string, boolean>;
  required?: string[];
}): McpParamInfo {
  return {
    paramNames: Object.keys(opts.types),
    paramTypes: opts.types,
    paramNullable: opts.nullable ?? {},
    requiredParams: opts.required ?? Object.keys(opts.types)
  };
}

describe('coerceMcpArgs', () => {
  it('passes string values through when schema type is string', () => {
    const result = coerceMcpArgs({ name: 'alice' }, info({ types: { name: 'string' } }));
    expect(result).toEqual({ name: 'alice' });
  });

  it('omits null, undefined, and string "null" for non-string types', () => {
    const result = coerceMcpArgs(
      { a: null, b: undefined, c: 'kept', d: 'null', e: ' null ' },
      info({ types: { a: 'array', b: 'integer', c: 'string', d: 'string', e: 'integer' } })
    );
    expect(result).not.toHaveProperty('a');
    expect(result).not.toHaveProperty('b');
    expect(result.d).toBe('null');
    expect(result).not.toHaveProperty('e');
    expect(result.c).toBe('kept');
  });

  describe('string → array coercion', () => {
    it('wraps single string to array', () => {
      const result = coerceMcpArgs(
        { recipients: 'alice@x.com' },
        info({ types: { recipients: 'array' } })
      );
      expect(result).toEqual({ recipients: ['alice@x.com'] });
    });

    it('splits comma-separated string into array', () => {
      const result = coerceMcpArgs(
        { recipients: 'alice@x.com, bob@x.com' },
        info({ types: { recipients: 'array' } })
      );
      expect(result).toEqual({ recipients: ['alice@x.com', 'bob@x.com'] });
    });

    it('trims whitespace around comma-separated items', () => {
      const result = coerceMcpArgs(
        { tags: ' foo , bar , baz ' },
        info({ types: { tags: 'array' } })
      );
      expect(result).toEqual({ tags: ['foo', 'bar', 'baz'] });
    });

    it('prefers JSON parse over comma split', () => {
      const result = coerceMcpArgs(
        { ids: '["a", "b"]' },
        info({ types: { ids: 'array' } })
      );
      expect(result).toEqual({ ids: ['a', 'b'] });
    });

    it('coerces empty string to empty array', () => {
      const result = coerceMcpArgs(
        { tags: '' },
        info({ types: { tags: 'array' } })
      );
      expect(result).toEqual({ tags: [] });
    });

    it('leaves arrays untouched', () => {
      const result = coerceMcpArgs(
        { items: ['a', 'b'] },
        info({ types: { items: 'array' } })
      );
      expect(result).toEqual({ items: ['a', 'b'] });
    });

    it('wraps non-string non-array to single-element array', () => {
      const result = coerceMcpArgs(
        { ids: 42 },
        info({ types: { ids: 'array' } })
      );
      expect(result).toEqual({ ids: [42] });
    });
  });

  describe('empty string → omit for nullable/optional params', () => {
    it('omits empty string for nullable param', () => {
      const result = coerceMcpArgs(
        { sender: '' },
        info({
          types: { sender: 'string' },
          nullable: { sender: true },
          required: ['sender']
        })
      );
      expect(result).not.toHaveProperty('sender');
    });

    it('omits empty string for optional (non-required) param', () => {
      const result = coerceMcpArgs(
        { sender: '' },
        info({
          types: { sender: 'string' },
          required: []
        })
      );
      expect(result).not.toHaveProperty('sender');
    });

    it('keeps empty string for required non-nullable param', () => {
      const result = coerceMcpArgs(
        { name: '' },
        info({
          types: { name: 'string' },
          required: ['name']
        })
      );
      expect(result).toEqual({ name: '' });
    });

    it('omits whitespace-only string for nullable param', () => {
      const result = coerceMcpArgs(
        { sender: '   ' },
        info({
          types: { sender: 'string' },
          nullable: { sender: true },
          required: ['sender']
        })
      );
      expect(result).not.toHaveProperty('sender');
    });
  });

  it('coerces string to integer', () => {
    const result = coerceMcpArgs({ count: '42' }, info({ types: { count: 'integer' } }));
    expect(result).toEqual({ count: 42 });
  });

  it('coerces string to number (float)', () => {
    const result = coerceMcpArgs({ rate: '3.14' }, info({ types: { rate: 'number' } }));
    expect(result).toEqual({ rate: 3.14 });
  });

  it('coerces string to boolean', () => {
    const t = coerceMcpArgs({ active: 'true' }, info({ types: { active: 'boolean' } }));
    const f = coerceMcpArgs({ active: 'false' }, info({ types: { active: 'boolean' } }));
    expect(t).toEqual({ active: true });
    expect(f).toEqual({ active: false });
  });

  it('parses JSON object string', () => {
    const result = coerceMcpArgs(
      { config: '{"key": "val"}' },
      info({ types: { config: 'object' } })
    );
    expect(result).toEqual({ config: { key: 'val' } });
  });
});

describe('deriveMcpParamInfo', () => {
  it('extracts types and param ordering from schema', () => {
    const result = deriveMcpParamInfo({
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
        tags: { type: 'array' }
      },
      required: ['name']
    });
    expect(result.paramNames).toEqual(['name', 'count', 'tags']);
    expect(result.paramTypes).toEqual({ name: 'string', count: 'integer', tags: 'array' });
    expect(result.requiredParams).toEqual(['name']);
  });

  it('detects nullable from anyOf schemas', () => {
    const result = deriveMcpParamInfo({
      properties: {
        sender: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        subject: { type: 'string' }
      },
      required: ['subject']
    });
    expect(result.paramTypes.sender).toBe('string');
    expect(result.paramNullable.sender).toBe(true);
    expect(result.paramNullable.subject).toBe(false);
    expect(result.requiredParams).toEqual(['subject']);
  });

  it('detects nullable from oneOf schemas', () => {
    const result = deriveMcpParamInfo({
      properties: {
        cc: { oneOf: [{ type: 'array' }, { type: 'null' }] }
      },
      required: []
    });
    expect(result.paramTypes.cc).toBe('array');
    expect(result.paramNullable.cc).toBe(true);
  });

  it('handles undefined inputSchema', () => {
    const result = deriveMcpParamInfo(undefined);
    expect(result.paramNames).toEqual([]);
    expect(result.paramTypes).toEqual({});
    expect(result.paramNullable).toEqual({});
    expect(result.requiredParams).toEqual([]);
  });
});
