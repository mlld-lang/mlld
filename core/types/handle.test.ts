import { describe, expect, it } from 'vitest';
import {
  createFactSourceHandle,
  createHandleWrapper,
  getFactSourceKey,
  internFactSourceArray,
  isFactSourceHandle,
  isHandleWrapper
} from './handle';

describe('handle types', () => {
  it('creates stable serializable factsource handles', () => {
    const handle = createFactSourceHandle({
      sourceRef: 'contact',
      field: 'email',
      instanceKey: 'ada@example.com',
      coercionId: 'coerce-1',
      position: 0,
      tiers: ['internal', 'verified', 'internal']
    });

    expect(handle).toEqual({
      kind: 'record-field',
      ref: '@contact.email',
      sourceRef: '@contact',
      field: 'email',
      instanceKey: 'ada@example.com',
      coercionId: 'coerce-1',
      position: 0,
      tiers: ['internal', 'verified']
    });
    expect(JSON.stringify(handle)).toBe(
      '{"kind":"record-field","ref":"@contact.email","sourceRef":"@contact","field":"email","instanceKey":"ada@example.com","coercionId":"coerce-1","position":0,"tiers":["internal","verified"]}'
    );
    expect(isFactSourceHandle(handle)).toBe(true);
  });

  it('rejects malformed tier metadata before factsource keying', () => {
    const cyclic: unknown[] = ['safe'];
    cyclic.push(cyclic);
    const malformed = {
      kind: 'record-field',
      ref: '@contact.email',
      sourceRef: '@contact',
      field: 'email',
      tiers: cyclic
    };

    expect(isFactSourceHandle(malformed)).toBe(false);
    expect(() => internFactSourceArray([malformed as any])).not.toThrow();
    expect(internFactSourceArray([malformed as any])).toEqual([]);
  });

  it('keys legacy factsources without descending into runtime-shaped objects', () => {
    const cyclic: Record<string, unknown> = {
      ref: '@legacy.value',
      sourceRef: '@legacy',
      field: 'value'
    };
    cyclic.self = cyclic;

    expect(() => internFactSourceArray([cyclic as any])).not.toThrow();
    expect(() => getFactSourceKey({
      kind: 'record-field',
      ref: '@legacy.value',
      sourceRef: '@legacy',
      field: 'value',
      tiers: cyclic.self as any
    })).not.toThrow();
  });

  it('recognizes only exact single-key handle wrappers', () => {
    expect(createHandleWrapper('h_17')).toEqual({ handle: 'h_17' });
    expect(JSON.stringify(createHandleWrapper('h_17'))).toBe('{"handle":"h_17"}');

    expect(isHandleWrapper({ handle: 'h_17' })).toBe(true);
    expect(isHandleWrapper({ handle: 'h_17', label: 'email' })).toBe(false);
    expect(isHandleWrapper({ value: 'h_17' })).toBe(false);
    expect(isHandleWrapper(['h_17'])).toBe(false);
  });
});
