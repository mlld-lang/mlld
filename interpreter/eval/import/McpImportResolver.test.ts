import { describe, expect, it } from 'vitest';
import { coerceMcpArgs, buildMcpArgs } from './McpImportResolver';

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

  it('coerces string "null" to null', () => {
    const result = coerceMcpArgs({ value: 'null' }, { value: 'null' });
    expect(result).toEqual({ value: null });
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

  it('passes null and undefined through unchanged', () => {
    const result = coerceMcpArgs(
      { a: null, b: undefined },
      { a: 'array', b: 'integer' }
    );
    expect(result.a).toBeNull();
    expect(result.b).toBeUndefined();
  });

  it('wraps non-string non-array values to array', () => {
    const result = coerceMcpArgs({ ids: 42 }, { ids: 'array' });
    expect(result).toEqual({ ids: [42] });
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
