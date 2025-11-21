import { describe, it, expect } from 'vitest';
import { keepStructured, isStructuredValue } from '@interpreter/utils/structured-value';

describe('keepStructured helper', () => {
  it('wraps plain strings into StructuredValue', () => {
    const wrapped = keepStructured('hello');
    expect(isStructuredValue(wrapped)).toBe(true);
    expect(wrapped.type).toBe('text');
    expect(wrapped.text).toBe('hello');
  });

  it('passes through an existing StructuredValue', () => {
    const original = keepStructured('hello');
    const again = keepStructured(original);
    expect(again).toBe(original);
  });

  it('keeps ctx when present on StructuredValue', () => {
    const wrapped = keepStructured('hi');
    const again = keepStructured(wrapped);
    expect(again.ctx).toBeDefined();
    expect(again.text).toBe('hi');
  });
});
