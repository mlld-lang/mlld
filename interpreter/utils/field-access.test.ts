import { describe, it, expect } from 'vitest';
import { accessField, accessFields } from './field-access';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { createObjectVariable, createStructuredValueVariable } from '@core/types/variable/VariableFactories';
import { wrapStructured } from './structured-value';

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

  it('adds an extension hint for common file suffix fields', async () => {
    await expect(
      accessField('report', { type: 'field', value: 'json' }, { baseIdentifier: 'filename' })
    ).rejects.toThrow('Cannot access field "json" on non-object value (string)');
    await expect(
      accessField('report', { type: 'field', value: 'json' }, { baseIdentifier: 'filename' })
    ).rejects.toThrow('\'@filename.json\' looks like field access');
    await expect(
      accessField('report', { type: 'field', value: 'json' }, { baseIdentifier: 'filename' })
    ).rejects.toThrow('escape the dot: \'@filename\\.json\'');
  });

  it('does not add extension hint text for non-extension fields', async () => {
    try {
      await accessField('report', { type: 'field', value: 'custom' }, { baseIdentifier: 'filename' });
      throw new Error('Expected field access to throw');
    } catch (error) {
      expect((error as Error).message).toContain('Cannot access field "custom" on non-object value (string)');
      expect((error as Error).message).not.toContain('looks like field access');
    }
  });
});

describe('structured value mx accessors', () => {
  it('maps .mx.text and .mx.data to wrapper-level views', async () => {
    const payload = { stance: 'approved', mx: 'user-mx' };
    const structured = wrapStructured(payload, 'object', 'RAW-PAYLOAD');
    const variable = createStructuredValueVariable('result', structured, source);

    const mxText = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'text' } as const
    ], { preserveContext: false });
    expect(mxText).toBe('RAW-PAYLOAD');

    const mxData = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const
    ], { preserveContext: false });
    expect(mxData).toEqual(payload);

    const userMxThroughData = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const,
      { type: 'field', value: 'mx' } as const
    ], { preserveContext: false });
    expect(userMxThroughData).toBe('user-mx');
  });

  it('keeps plain dotted access aligned with .mx.data', async () => {
    const payload = { stance: 'approved', score: 9 };
    const structured = wrapStructured(payload, 'object', '{"stance":"approved","score":9}');
    const variable = createStructuredValueVariable('result', structured, source);

    const direct = await accessField(variable, { type: 'field', value: 'stance' }, { preserveContext: false });
    const viaMx = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const,
      { type: 'field', value: 'stance' } as const
    ], { preserveContext: false });

    expect(direct).toBe('approved');
    expect(viaMx).toBe('approved');
  });

  it('exposes .mx.text and .mx.data on text wrappers', async () => {
    const structured = wrapStructured('hello', 'text', 'hello');
    const variable = createStructuredValueVariable('result', structured, source);

    const mxText = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'text' } as const
    ], { preserveContext: false });
    const mxData = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const
    ], { preserveContext: false });

    expect(mxText).toBe('hello');
    expect(mxData).toBe('hello');
  });

  it('does not expose wrapper metadata as top-level fields', async () => {
    const structured = wrapStructured(
      { status: 'user-status' },
      'object',
      '{"status":"user-status"}',
      { filename: 'meta.json', source: 'load-content' }
    );
    const variable = createStructuredValueVariable('result', structured, source);

    const topLevelFilename = await accessField(
      variable,
      { type: 'field', value: 'filename' },
      { preserveContext: false }
    );
    expect(topLevelFilename).toBeNull();

    const mxFilename = await accessFields(
      variable,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'filename' } as const
      ],
      { preserveContext: false }
    );
    expect(mxFilename).toBe('meta.json');
  });

  it('keeps user data fields first for collisions like type/text/data', async () => {
    const payload = {
      type: 'user-type',
      text: 'user-text',
      data: 'user-data'
    };
    const structured = wrapStructured(payload, 'object', 'RAW');
    const variable = createStructuredValueVariable('result', structured, source);

    const topType = await accessField(variable, { type: 'field', value: 'type' }, { preserveContext: false });
    const topText = await accessField(variable, { type: 'field', value: 'text' }, { preserveContext: false });
    const topData = await accessField(variable, { type: 'field', value: 'data' }, { preserveContext: false });

    expect(topType).toBe('user-type');
    expect(topText).toBe('user-text');
    expect(topData).toBe('user-data');

    const mxType = await accessFields(
      variable,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'type' } as const
      ],
      { preserveContext: false }
    );
    expect(mxType).toBe('object');
  });
});
