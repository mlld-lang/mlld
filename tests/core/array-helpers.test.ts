import { describe, it, expect } from 'vitest';
import { createSimpleTextVariable, createArrayVariable } from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable/VariableMetadata';
import { makeSecurityDescriptor } from '@core/types/security';

describe('universal array helpers', () => {
  it('attaches quantifiers and aggregate context to array variables', () => {
    const source = VariableMetadataUtils.createSource('array', false, false);

    const secretVar = createSimpleTextVariable('secretVar', 'secret payload', source, {
      security: makeSecurityDescriptor({ labels: ['secret'], sources: ['vault'] })
    });
    const piiVar = createSimpleTextVariable('piiVar', 'pii payload', source, {
      security: makeSecurityDescriptor({ labels: ['pii'], sources: ['form'] })
    });

    const arrayVar = createArrayVariable('items', [secretVar, piiVar], true, source, {
      isSystem: true
    });

    expect(arrayVar.any?.mx.labels.includes('secret')).toBe(true);
    expect(arrayVar.all?.mx.labels.includes('secret')).toBe(false);
    expect(arrayVar.none?.mx.labels.includes('public')).toBe(true);

    const mx = arrayVar.mx as any;
    expect(mx.labels).toEqual(['secret', 'pii']);
    expect(mx.sources).toEqual(['vault', 'form']);
    expect(Array.isArray(mx.tokens)).toBe(true);
    expect(typeof mx.totalTokens()).toBe('number');
    expect(typeof mx.maxTokens()).toBe('number');

    expect(typeof arrayVar.totalTokens).toBe('function');
    expect(typeof arrayVar.maxTokens).toBe('function');
    expect(Array.isArray(arrayVar.raw)).toBe(true);
    expect(Object.keys(arrayVar)).not.toContain('any');
  });

  it('handles arrays without variable elements gracefully', () => {
    const source = VariableMetadataUtils.createSource('array', false, false);
    const arrayVar = createArrayVariable('plain', [{ text: 'hello' }], false, source);

    expect(arrayVar.any?.mx.labels.includes('secret')).toBe(false);
    const mx = arrayVar.mx as any;
    expect(mx.labels).toEqual([]);
    expect(mx.sources).toEqual([]);
    expect(mx.tokens).toEqual([]);
    expect(mx.totalTokens()).toBe(0);
    expect(mx.maxTokens()).toBe(0);
  });
});
