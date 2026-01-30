import { describe, it, expect } from 'vitest';
import { accessField, accessFields } from './field-access';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { createObjectVariable } from '@core/types/variable/VariableFactories';

const source = {
  directive: 'var' as const,
  syntax: 'object' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createSecretObject() {
  const variable = createObjectVariable(
    'obj',
    { nested: { inner: { token: 'secret' } } },
    true,
    source
  );
  variable.mx = { labels: ['secret'] } as any;
  return variable;
}

describe('field access provenance', () => {
  it('inherits provenance when accessing single field', async () => {
    const variable = createSecretObject();
    const result = await accessField(variable, { type: 'field', value: 'nested' });
    const materialized = materializeExpressionValue(result as Record<string, unknown>, { name: 'nested' });
    expect(materialized?.mx?.labels).toContain('secret');
  });

  it('preserves provenance across multiple field accesses', async () => {
    const variable = createSecretObject();
    const fields = [
      { type: 'field', value: 'nested' } as const,
      { type: 'field', value: 'inner' } as const
    ];
    const result = await accessFields(variable, fields);
    const materialized = materializeExpressionValue((result as any).value ?? result, { name: 'inner' });
    expect(materialized?.mx?.labels).toContain('secret');
  });
});

describe('object mx utilities', () => {
  it('exposes keys, values, and entries on .mx', async () => {
    const variable = createObjectVariable(
      'obj',
      { a: 1, b: 2, c: 3 },
      false,
      source
    );

    const keys = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'keys' } as const
    ], { preserveContext: false });
    expect(keys).toEqual(['a', 'b', 'c']);

    const values = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'values' } as const
    ], { preserveContext: false });
    expect(values).toEqual([1, 2, 3]);

    const entries = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'entries' } as const
    ], { preserveContext: false });
    expect(entries).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });
});

describe('missing field access', () => {
  it('returns null for missing object fields by default', async () => {
    const result = await accessField({ a: 1 }, { type: 'field', value: 'missing' });
    expect(result).toBeNull();
  });

  it('returns undefined for missing fields when configured', async () => {
    const result = await accessField(
      { a: 1 },
      { type: 'field', value: 'missing' },
      { returnUndefinedForMissing: true }
    );
    expect(result).toBeUndefined();
  });

  it('returns null for out-of-bounds array indices', async () => {
    const result = await accessField([1, 2], { type: 'arrayIndex', value: 5 });
    expect(result).toBeNull();
  });
});
