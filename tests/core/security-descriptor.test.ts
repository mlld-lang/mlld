import { describe, it, expect } from 'vitest';
import {
  makeSecurityDescriptor,
  mergeDescriptors,
  hasLabel,
  serializeSecurityDescriptor,
  deserializeSecurityDescriptor,
  DATA_LABELS
} from '@core/types/security';

describe('SecurityDescriptor helpers', () => {
  it('deduplicates labels and freezes descriptor', () => {
    const descriptor = makeSecurityDescriptor({
      labels: ['secret', 'secret', 'untrusted']
    });

    expect(descriptor.labels).toEqual(['secret', 'untrusted']);
    expect(descriptor.taint).toEqual(['secret', 'untrusted']);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(DATA_LABELS).toContain('secret');
  });

  it('falls back to default descriptor when no labels provided', () => {
    const descriptor = makeSecurityDescriptor();
    expect(descriptor.labels).toEqual([]);
    expect(descriptor.taint).toEqual([]);
  });

  it('merges descriptors preserving highest taint and labels', () => {
    const secret = makeSecurityDescriptor({ labels: ['secret'] });
    const network = makeSecurityDescriptor({ labels: ['network'] });

    const merged = mergeDescriptors(secret, network);
    expect(merged.labels).toEqual(['secret', 'network']);
    expect(merged.taint).toEqual(['secret', 'network']);
    expect(hasLabel(merged, 'network')).toBe(true);
  });

  it('serialises and deserialises descriptors', () => {
    const descriptor = makeSecurityDescriptor({
      labels: ['pii'],
      taint: ['pii', 'src:dynamic'],
      sources: ['/tmp/data']
    });

    const serialised = serializeSecurityDescriptor(descriptor);
    expect(serialised).toMatchObject({
      labels: ['pii'],
      taint: ['pii', 'src:dynamic'],
      sources: ['/tmp/data']
    });

    const restored = deserializeSecurityDescriptor(serialised);
    expect(restored).toBeDefined();
    expect(restored!.labels).toEqual(['pii']);
    expect(restored!.taint).toEqual(['pii', 'src:dynamic']);
  });
});
