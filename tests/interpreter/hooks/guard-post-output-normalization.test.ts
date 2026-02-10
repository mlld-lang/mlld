import { describe, expect, it } from 'vitest';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import {
  buildTransformedGuardResult,
  normalizeFallbackOutputValue,
  normalizeRawOutput,
  normalizeReplacementVariables
} from '@interpreter/hooks/guard-post-output-normalization';

const VARIABLE_SOURCE = {
  directive: 'var' as const,
  syntax: 'quoted' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createOutputVariable(name: string, value: string) {
  return createSimpleTextVariable(
    name,
    value,
    VARIABLE_SOURCE,
    {
      security: makeSecurityDescriptor({
        labels: ['output-label'],
        sources: [`source:${name}`]
      })
    }
  );
}

describe('guard post output normalization utilities', () => {
  it('normalizes raw output from text/data wrappers and passthrough values', () => {
    expect(normalizeRawOutput({ text: 'text-value' })).toBe('text-value');
    expect(normalizeRawOutput({ data: 'data-value' })).toBe('data-value');
    expect(normalizeRawOutput(42)).toBe(42);
  });

  it('normalizes fallback output values to strings', () => {
    expect(normalizeFallbackOutputValue('ready')).toBe('ready');
    expect(normalizeFallbackOutputValue(undefined)).toBe('');
    expect(normalizeFallbackOutputValue(null)).toBe('');
    expect(normalizeFallbackOutputValue(123)).toBe('123');
  });

  it('normalizes replacement payloads into variable arrays', () => {
    const first = createOutputVariable('first', 'one');
    const second = createOutputVariable('second', 'two');

    expect(normalizeReplacementVariables(first)).toEqual([first]);
    expect(normalizeReplacementVariables([first, 'bad', second])).toEqual([first, second]);
    expect(normalizeReplacementVariables('invalid')).toEqual([]);
  });

  it('builds transformed results for string outputs with descriptor application', () => {
    const output = createOutputVariable('maskedOutput', 'masked-value');
    const descriptor = makeSecurityDescriptor({
      labels: ['sanitized'],
      sources: ['guard:sanitize']
    });
    const result = { value: output } as any;

    const transformed = buildTransformedGuardResult(result, output, 'masked-value', descriptor);

    expect((transformed as any).stdout).toBe('masked-value');
    expect((transformed as any).__guardTransformed).toBeDefined();
    const transformedDescriptor = extractSecurityDescriptor((transformed as any).value, {
      recursive: true,
      mergeArrayElements: true
    });
    expect(transformedDescriptor?.labels).toEqual(expect.arrayContaining(['sanitized']));
    expect(transformedDescriptor?.sources).toEqual(expect.arrayContaining(['guard:sanitize']));
  });

  it('builds transformed results for non-string outputs without structured wrapping', () => {
    const output = createOutputVariable('objectOutput', 'raw');
    const descriptor = makeSecurityDescriptor();
    const result = { value: output } as any;
    const objectValue = { ok: true };

    const transformed = buildTransformedGuardResult(result, output, objectValue, descriptor);

    expect(transformed.value).toBe(output);
    expect((transformed as any).__guardTransformed).toBe(output);
    expect((transformed as any).stdout).toBeUndefined();
  });
});
