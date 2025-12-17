import { describe, it, expect } from 'vitest';
import {
  parseAndWrapJson,
  collectParameterDescriptors,
  collectAndMergeParameterDescriptors,
  wrapStructured,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import type { Variable, VariableSource } from '@core/types/variable';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';

const SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

function createVariable(name: string, descriptor?: ReturnType<typeof makeSecurityDescriptor>): Variable {
  const mx = {
    labels: descriptor?.labels ?? [],
    taint: descriptor?.taint ?? [],
    sources: descriptor?.sources ?? [],
    policy: descriptor?.policyContext ?? null
  };
  return {
    type: 'simple-text',
    name,
    value: '',
    source: SOURCE,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    mx,
    internal: {}
  };
}

describe('parseAndWrapJson', () => {
  it('wraps JSON strings and preserves metadata', () => {
    const metadata = { source: 'test-helper' };
    const wrapped = parseAndWrapJson('{"name":"Ada"}', { metadata });

    expect(wrapped && isStructuredValue(wrapped)).toBe(true);
    expect((wrapped as any).type).toBe('object');
    expect((wrapped as any).data).toEqual({ name: 'Ada' });
    expect((wrapped as any).mx.source).toBe('test-helper');
  });

  it('returns original value when string is not JSON (non-strict)', () => {
    expect(parseAndWrapJson('hello world')).toBe('hello world');
  });

  it('returns undefined for non-JSON when strict is enabled', () => {
    expect(parseAndWrapJson('hello world', { strict: true })).toBeUndefined();
  });

  it('preserves original text when preserveText flag is on', () => {
    const messyJson = '{\n  "name": "Ada"\n}';
    const wrapped = parseAndWrapJson(messyJson, { preserveText: true });

    expect(wrapped && isStructuredValue(wrapped)).toBe(true);
    expect((wrapped as any).text).toBe(messyJson);
  });
});

describe('collectParameterDescriptors helpers', () => {
  it('collects descriptors for available parameters only', () => {
    const first = makeSecurityDescriptor({ labels: ['alpha'] });
    const second = makeSecurityDescriptor({ labels: ['beta'] });
    const env = {
      getVariable: (name: string) => {
        if (name === 'one') return createVariable('one', first);
        if (name === 'two') return createVariable('two', second);
        return undefined;
      }
    };

    const descriptors = collectParameterDescriptors(['one', 'missing', 'two'], env);
    expect(descriptors).toEqual([first, second]);
  });

  it('merges descriptors when multiple parameters are present', () => {
    const first = makeSecurityDescriptor({ labels: ['alpha'] });
    const second = makeSecurityDescriptor({ labels: ['beta'] });
    const env = {
      getVariable: (name: string) => {
        if (name === 'one') return createVariable('one', first);
        if (name === 'two') return createVariable('two', second);
        return undefined;
      },
      mergeSecurityDescriptors: (...descriptors: any[]) => mergeDescriptors(...descriptors)
    };

    const merged = collectAndMergeParameterDescriptors(['one', 'two'], env as any);
    expect(merged?.labels).toEqual(expect.arrayContaining(['alpha', 'beta']));
  });

  it('returns undefined when no descriptors exist', () => {
    const env = {
      getVariable: () => undefined,
      mergeSecurityDescriptors: mergeDescriptors
    };

    expect(collectAndMergeParameterDescriptors(['ghost'], env as any)).toBeUndefined();
  });
});
