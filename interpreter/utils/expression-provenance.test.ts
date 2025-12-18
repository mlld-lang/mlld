import { describe, expect, it } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  materializeExpressionValue,
  setExpressionProvenance,
  getExpressionProvenance
} from '@core/types/provenance/ExpressionProvenance';

describe('ExpressionProvenance', () => {
  it('stores descriptor for objects', () => {
    const value = {};
    const descriptor = makeSecurityDescriptor({ labels: ['secret'], sources: ['expr'] });
    setExpressionProvenance(value, descriptor);
    expect(getExpressionProvenance(value)).toEqual(descriptor);
  });

  it('materializes variables with mx labels', () => {
    const value = {};
    const descriptor = makeSecurityDescriptor({ labels: ['secret'], sources: ['expr'] });
    setExpressionProvenance(value, descriptor);
    const variable = materializeExpressionValue(value, { name: 'testExpr' });
    expect(variable).toBeDefined();
    expect(variable?.name).toBe('testExpr');
    expect(variable?.mx?.labels).toContain('secret');
  });
});
