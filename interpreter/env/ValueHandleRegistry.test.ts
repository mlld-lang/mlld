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

  it('reuses the same handle for the same value within one session and separates by session', () => {
    const registry = new ValueHandleRegistry();

    const first = registry.issue({ email: 'ada@example.com' }, { sessionId: 'session-a' });
    const second = registry.issue({ email: 'ada@example.com' }, { sessionId: 'session-a' });
    const otherSession = registry.issue({ email: 'ada@example.com' }, { sessionId: 'session-b' });

    expect(second.handle).toBe(first.handle);
    expect(otherSession.handle).not.toBe(first.handle);
  });

  it('keeps distinct stable keys separate inside one session', () => {
    const registry = new ValueHandleRegistry();

    const first = registry.issue('ada@example.com', {
      sessionId: 'session-a',
      stableKey: 'contact|c1|email'
    });
    const second = registry.issue('ada@example.com', {
      sessionId: 'session-a',
      stableKey: 'contact|c2|email'
    });
    const repeated = registry.issue('ada@example.com', {
      sessionId: 'session-a',
      stableKey: 'contact|c1|email'
    });

    expect(second.handle).not.toBe(first.handle);
    expect(repeated.handle).toBe(first.handle);
  });
});
