import { describe, expect, it } from 'vitest';
import { ValueHandleRegistry } from './ValueHandleRegistry';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

describe('ValueHandleRegistry', () => {
  it('issues stable opaque handles and resolves stored values', () => {
    const registry = new ValueHandleRegistry();
    const entry = registry.issue({ email: 'ada@example.com' }, {
      preview: 'ada@example.com',
      metadata: { fact: 'fact:@contact.email' }
    });

    expect(entry.handle).toMatch(HANDLE_RE);
    expect(entry.preview).toBe('ada@example.com');
    expect(entry.metadata).toEqual({ fact: 'fact:@contact.email' });
    expect(registry.resolve(entry.handle)).toMatchObject({
      handle: entry.handle,
      value: { email: 'ada@example.com' }
    });
  });

  it('returns undefined for unknown handles', () => {
    const registry = new ValueHandleRegistry();
    expect(registry.resolve('h_missing')).toBeUndefined();
  });
});
