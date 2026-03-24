import { describe, expect, it } from 'vitest';
import { coerceMcpArgs, buildMcpArgs, deriveMcpParamInfo } from './McpImportResolver';
import type { MCPToolSchema } from '@interpreter/mcp/McpImportManager';

describe('coerceMcpArgs', () => {
  it('passes string values through when schema type is string', () => {
    const result = coerceMcpArgs({ name: 'alice' }, { name: 'string' });
    expect(result).toEqual({ name: 'alice' });
  });

  it('passes values through when no schema type is known', () => {
    const result = coerceMcpArgs({ name: 'alice' }, {});
    expect(result).toEqual({ name: 'alice' });
  });

  it('wraps string to array when schema says array', () => {
    const result = coerceMcpArgs(
      { participants: 'sarah@example.com' },
      { participants: 'array' }
    );
    expect(result).toEqual({ participants: ['sarah@example.com'] });
  });

  it('leaves arrays untouched when schema says array', () => {
    const result = coerceMcpArgs(
      { participants: ['a@b.com', 'c@d.com'] },
      { participants: 'array' }
    );
    expect(result).toEqual({ participants: ['a@b.com', 'c@d.com'] });
  });

  it('parses JSON array string when schema says array', () => {
    const result = coerceMcpArgs(
      { ids: '["a", "b"]' },
      { ids: 'array' }
    );
    expect(result).toEqual({ ids: ['a', 'b'] });
  });

  it('coerces string to integer', () => {
    const result = coerceMcpArgs({ count: '42' }, { count: 'integer' });
    expect(result).toEqual({ count: 42 });
  });

  it('coerces string to number (float)', () => {
    const result = coerceMcpArgs({ rate: '3.14' }, { rate: 'number' });
    expect(result).toEqual({ rate: 3.14 });
  });

  it('leaves actual numbers untouched', () => {
    const result = coerceMcpArgs({ count: 5 }, { count: 'integer' });
    expect(result).toEqual({ count: 5 });
  });

  it('coerces string "true" to boolean', () => {
    const result = coerceMcpArgs({ active: 'true' }, { active: 'boolean' });
    expect(result).toEqual({ active: true });
  });

  it('coerces string "false" to boolean', () => {
    const result = coerceMcpArgs({ active: 'false' }, { active: 'boolean' });
    expect(result).toEqual({ active: false });
  });

  it('leaves actual booleans untouched', () => {
    const result = coerceMcpArgs({ active: true }, { active: 'boolean' });
    expect(result).toEqual({ active: true });
  });

  it('omits string "null" for null-typed params', () => {
    const result = coerceMcpArgs({ value: 'null' }, { value: 'null' });
    expect(result).not.toHaveProperty('value');
  });

  it('parses JSON object string when schema says object', () => {
    const result = coerceMcpArgs(
      { config: '{"key": "val"}' },
      { config: 'object' }
    );
    expect(result).toEqual({ config: { key: 'val' } });
  });

  it('leaves actual objects untouched when schema says object', () => {
    const result = coerceMcpArgs(
      { config: { key: 'val' } },
      { config: 'object' }
    );
    expect(result).toEqual({ config: { key: 'val' } });
  });

  it('does not coerce invalid number strings', () => {
    const result = coerceMcpArgs({ count: 'abc' }, { count: 'integer' });
    expect(result).toEqual({ count: 'abc' });
  });

  it('handles multiple params with mixed types', () => {
    const result = coerceMcpArgs(
      { name: 'alice', count: '3', tags: 'urgent', active: 'true' },
      { name: 'string', count: 'integer', tags: 'array', active: 'boolean' }
    );
    expect(result).toEqual({
      name: 'alice',
      count: 3,
      tags: ['urgent'],
      active: true
    });
  });

  it('omits null, undefined, and string "null" for non-string types', () => {
    const result = coerceMcpArgs(
      { a: null, b: undefined, c: 'kept', d: 'null', e: ' null ' },
      { a: 'array', b: 'integer', c: 'string', d: 'string', e: 'integer' }
    );
    expect(result).not.toHaveProperty('a');
    expect(result).not.toHaveProperty('b');
    expect(result.d).toBe('null');
    expect(result).not.toHaveProperty('e');
    expect(result.c).toBe('kept');
  });

  it('wraps non-string non-array values to array', () => {
    const result = coerceMcpArgs({ ids: 42 }, { ids: 'array' });
    expect(result).toEqual({ ids: [42] });
  });

  it('coerces empty string to empty array', () => {
    const result = coerceMcpArgs({ tags: '' }, { tags: 'array' });
    expect(result).toEqual({ tags: [] });
  });

  it('coerces whitespace-only string to empty array', () => {
    const result = coerceMcpArgs({ tags: '  ' }, { tags: 'array' });
    expect(result).toEqual({ tags: [] });
  });

  it('omits string "null" for array-typed params', () => {
    const result = coerceMcpArgs({ cc: 'null' }, { cc: 'array' });
    expect(result).not.toHaveProperty('cc');
  });
});

describe('buildMcpArgs', () => {
  it('maps positional args to param names', () => {
    const result = buildMcpArgs(['name', 'age'], ['alice', 30]);
    expect(result).toEqual({ name: 'alice', age: 30 });
  });

  it('passes through single object arg when keys match params', () => {
    const result = buildMcpArgs(['name', 'age'], [{ name: 'alice', age: 30 }]);
    expect(result).toEqual({ name: 'alice', age: 30 });
  });

  it('returns empty object for no args', () => {
    expect(buildMcpArgs(['name'], [])).toEqual({});
  });
});

describe('deriveMcpParamInfo', () => {
  it('extracts type from anyOf nullable schemas', () => {
    const tool: MCPToolSchema = {
      name: 'send_email',
      description: 'Send email',
      inputSchema: {
        type: 'object',
        properties: {
          recipients: { type: 'array', items: { type: 'string' } },
          subject: { type: 'string' },
          attachments: { anyOf: [{ type: 'array', items: { type: 'object' } }, { type: 'null' }], default: null },
          cc: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }], default: null }
        },
        required: ['recipients', 'subject']
      }
    };
    const info = deriveMcpParamInfo(tool);
    expect(info.paramTypes.recipients).toBe('array');
    expect(info.paramTypes.subject).toBe('string');
    expect(info.paramTypes.attachments).toBe('array');
    expect(info.paramTypes.cc).toBe('array');
  });

  it('extracts type from oneOf nullable schemas', () => {
    const tool: MCPToolSchema = {
      name: 'test',
      description: 'test',
      inputSchema: {
        type: 'object',
        properties: {
          count: { oneOf: [{ type: 'integer' }, { type: 'null' }] }
        },
        required: []
      }
    };
    const info = deriveMcpParamInfo(tool);
    expect(info.paramTypes.count).toBe('integer');
  });
});
