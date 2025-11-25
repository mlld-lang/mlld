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

    expect(arrayVar.any?.ctx.labels.includes('secret')).toBe(true);
    expect(arrayVar.all?.ctx.labels.includes('secret')).toBe(false);
    expect(arrayVar.none?.ctx.labels.includes('public')).toBe(true);

    const ctx = arrayVar.ctx as any;
    expect(ctx.labels).toEqual(['secret', 'pii']);
    expect(ctx.sources).toEqual(['vault', 'form']);
    expect(Array.isArray(ctx.tokens)).toBe(true);
    expect(typeof ctx.totalTokens()).toBe('number');
    expect(typeof ctx.maxTokens()).toBe('number');

    expect(typeof arrayVar.totalTokens).toBe('function');
    expect(typeof arrayVar.maxTokens).toBe('function');
    expect(Array.isArray(arrayVar.raw)).toBe(true);
    expect(Object.keys(arrayVar)).not.toContain('any');
  });

  it('handles arrays without variable elements gracefully', () => {
    const source = VariableMetadataUtils.createSource('array', false, false);
    const arrayVar = createArrayVariable('plain', [{ text: 'hello' }], false, source);

    expect(arrayVar.any?.ctx.labels.includes('secret')).toBe(false);
    const ctx = arrayVar.ctx as any;
    expect(ctx.labels).toEqual([]);
    expect(ctx.sources).toEqual([]);
    expect(ctx.tokens).toEqual([]);
    expect(ctx.totalTokens()).toBe(0);
    expect(ctx.maxTokens()).toBe(0);
  });
});
