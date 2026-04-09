import { describe, expect, it } from 'vitest';
import {
  createFactSourceHandle,
  createHandleWrapper,
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

  it('recognizes only exact single-key handle wrappers', () => {
    expect(createHandleWrapper('h_17')).toEqual({ handle: 'h_17' });
    expect(JSON.stringify(createHandleWrapper('h_17'))).toBe('{"handle":"h_17"}');

    expect(isHandleWrapper({ handle: 'h_17' })).toBe(true);
    expect(isHandleWrapper({ handle: 'h_17', label: 'email' })).toBe(false);
    expect(isHandleWrapper({ value: 'h_17' })).toBe(false);
    expect(isHandleWrapper(['h_17'])).toBe(false);
  });
});
