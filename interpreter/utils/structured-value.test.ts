import { describe, it, expect } from 'vitest';
import {
  asText,
  parseAndWrapJson,
  collectParameterDescriptors,
  collectAndMergeParameterDescriptors,
  extractSecurityDescriptor,
  wrapStructured,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import type { Variable, VariableSource } from '@core/types/variable';
import {
  makeSecurityDescriptor,
  mergeDescriptors,
  serializeSecurityDescriptor
} from '@core/types/security';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';

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

describe('text serialization fallbacks', () => {
  it('defers derived object text until a caller actually asks for it', () => {
    let toJsonCalls = 0;
    const value = {
      name: 'Ada',
      toJSON() {
        toJsonCalls += 1;
        return { name: 'Ada' };
      }
    };

    const wrapped = wrapStructured(value, 'object');
    expect(toJsonCalls).toBe(0);

    expect(wrapped.text).toBe('{"name":"Ada"}');
    expect(toJsonCalls).toBe(1);
    expect(wrapped.text).toBe('{"name":"Ada"}');
    expect(toJsonCalls).toBe(1);
  });

  it('serializes plain objects as JSON instead of [object Object]', () => {
    expect(asText({ name: 'Ada', active: true })).toBe('{"name":"Ada","active":true}');
  });

  it('surfaces circular objects as unserializable instead of [object Object]', () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(asText(value)).toBe('[unserializable object]');
    expect(wrapStructured(value, 'object').text).toBe('[unserializable object]');
  });
});

describe('extractSecurityDescriptor with refined record metadata', () => {
  it('does not let empty expression provenance mask structured metadata', () => {
    const structured = wrapStructured(
      'alice@example.com',
      'text',
      'alice@example.com',
      {
        security: makeSecurityDescriptor({ labels: ['fact:@contact.email'] })
      }
    );

    setExpressionProvenance(structured, makeSecurityDescriptor());

    const descriptor = extractSecurityDescriptor(structured);
    expect(descriptor?.labels).toContain('fact:@contact.email');
  });

  it('keeps wrapper descriptors shallow but includes namespace field descriptors recursively', () => {
    const structured = wrapStructured(
      { recipient: 'acct-1', subject: 'Rent' },
      'object',
      '{"recipient":"acct-1","subject":"Rent"}',
      {
        security: makeSecurityDescriptor({ labels: ['src:mcp'] })
      }
    );
    structured.internal = {
      ...(structured.internal ?? {}),
      namespaceMetadata: {
        recipient: {
          security: serializeSecurityDescriptor(
            makeSecurityDescriptor({ labels: ['fact:@transaction.recipient'] })
          )
        },
        subject: {
          security: serializeSecurityDescriptor(
            makeSecurityDescriptor({ labels: ['untrusted'] })
          )
        }
      }
    };

    const shallow = extractSecurityDescriptor(structured);
    expect(shallow?.labels).toEqual(['src:mcp']);

    const recursive = extractSecurityDescriptor(structured, {
      recursive: true,
      mergeArrayElements: true
    });
    expect(recursive?.labels).toEqual(
      expect.arrayContaining(['src:mcp', 'fact:@transaction.recipient', 'untrusted'])
    );
  });

  it('does not reintroduce untrusted when every refined child stays a fact', () => {
    const structured = wrapStructured(
      { recipient: 'acct-1' },
      'object',
      '{"recipient":"acct-1"}',
      {
        security: makeSecurityDescriptor({ labels: ['src:mcp'] })
      }
    );
    structured.internal = {
      ...(structured.internal ?? {}),
      namespaceMetadata: {
        recipient: {
          security: serializeSecurityDescriptor(
            makeSecurityDescriptor({ labels: ['fact:@transaction.recipient'] })
          )
        }
      }
    };

    const recursive = extractSecurityDescriptor(structured, {
      recursive: true,
      mergeArrayElements: true
    });
    expect(recursive?.labels).toEqual(
      expect.arrayContaining(['src:mcp', 'fact:@transaction.recipient'])
    );
    expect(recursive?.labels).not.toContain('untrusted');
  });

  it('recursively merges array children from refined record results', () => {
    const child = wrapStructured(
      { recipient: 'acct-1', subject: 'Rent' },
      'object',
      '{"recipient":"acct-1","subject":"Rent"}',
      {
        security: makeSecurityDescriptor({ labels: ['src:mcp'] })
      }
    );
    child.internal = {
      ...(child.internal ?? {}),
      namespaceMetadata: {
        recipient: {
          security: serializeSecurityDescriptor(
            makeSecurityDescriptor({ labels: ['fact:@transaction.recipient'] })
          )
        },
        subject: {
          security: serializeSecurityDescriptor(
            makeSecurityDescriptor({ labels: ['untrusted'] })
          )
        }
      }
    };

    const wrappedArray = wrapStructured([child], 'array', undefined, {
      security: makeSecurityDescriptor({ labels: ['src:mcp'] })
    });

    const recursive = extractSecurityDescriptor(wrappedArray, {
      recursive: true,
      mergeArrayElements: true
    });
    expect(recursive?.labels).toEqual(
      expect.arrayContaining(['src:mcp', 'fact:@transaction.recipient', 'untrusted'])
    );
  });
});
