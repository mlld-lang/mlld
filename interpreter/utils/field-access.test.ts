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
  variable.ctx = { labels: ['secret'] } as any;
  return variable;
}

describe('field access provenance', () => {
  it('inherits provenance when accessing single field', async () => {
    const variable = createSecretObject();
    const result = await accessField(variable, { type: 'field', value: 'nested' });
    const materialized = materializeExpressionValue(result as Record<string, unknown>, { name: 'nested' });
    expect(materialized?.ctx?.labels).toContain('secret');
  });

  it('preserves provenance across multiple field accesses', async () => {
    const variable = createSecretObject();
    const fields = [
      { type: 'field', value: 'nested' } as const,
      { type: 'field', value: 'inner' } as const
    ];
    const result = await accessFields(variable, fields);
    const materialized = materializeExpressionValue((result as any).value ?? result, { name: 'inner' });
    expect(materialized?.ctx?.labels).toContain('secret');
  });
});
