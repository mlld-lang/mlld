import { describe, expect, it } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import { isStructuredValue, wrapStructured } from './structured-value';
import { combineValues } from './value-combine';

describe('combineValues', () => {
  it('preserves StructuredValue wrappers when appending a proof-bearing value directly', () => {
    const proofBearing = wrapStructured('ada@example.com', 'text', undefined, {
      factsources: [{ ref: '@contact.email' } as any],
      security: makeSecurityDescriptor({ labels: ['fact:@contact.email'] })
    });

    const result = combineValues([], proofBearing, 'items') as unknown[];

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(proofBearing);
    expect(isStructuredValue(result[0])).toBe(true);
    expect((result[0] as any).mx.labels).toEqual(['fact:@contact.email']);
    expect((result[0] as any).mx.factsources[0].ref).toBe('@contact.email');
  });

  it('uses copy-on-first-append and then mutates the accumulator array in place', () => {
    const original = [1];

    const first = combineValues(original, [2], 'items') as unknown[];
    const second = combineValues(first, [3], 'items') as unknown[];

    expect(original).toEqual([1]);
    expect(first).toEqual([1, 2, 3]);
    expect(first).not.toBe(original);
    expect(second).toBe(first);
  });
});
