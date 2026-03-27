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
      sources: ['/tmp/data'],
      urls: ['https://example.com/a']
    });

    const serialised = serializeSecurityDescriptor(descriptor);
    expect(serialised).toMatchObject({
      labels: ['pii'],
      taint: ['pii', 'src:dynamic'],
      sources: ['/tmp/data'],
      urls: ['https://example.com/a']
    });

    const restored = deserializeSecurityDescriptor(serialised);
    expect(restored).toBeDefined();
    expect(restored!.labels).toEqual(['pii']);
    expect(restored!.taint).toEqual(['pii', 'src:dynamic']);
    expect(restored!.urls).toEqual(['https://example.com/a']);
  });

  it('preserves tool provenance order and deduplicates by auditRef', () => {
    const first = makeSecurityDescriptor({
      tools: [
        { name: 'fetchIssue', args: ['id'], auditRef: 'audit-1' }
      ]
    });
    const duplicate = makeSecurityDescriptor({
      tools: [
        { name: 'fetchIssue', args: ['id'], auditRef: 'audit-1' }
      ]
    });
    const second = makeSecurityDescriptor({
      tools: [
        { name: 'verifyIssue', args: ['content'], auditRef: 'audit-2' }
      ]
    });

    const merged = mergeDescriptors(first, duplicate, second);
    expect(merged.tools).toEqual([
      { name: 'fetchIssue', args: ['id'], auditRef: 'audit-1' },
      { name: 'verifyIssue', args: ['content'], auditRef: 'audit-2' }
    ]);

    const serialized = serializeSecurityDescriptor(merged);
    const restored = deserializeSecurityDescriptor(serialized);
    expect(restored?.tools).toEqual(merged.tools);
  });

  it('merges and deduplicates url provenance', () => {
    const first = makeSecurityDescriptor({
      urls: ['https://example.com/a', 'https://example.com/a']
    });
    const second = makeSecurityDescriptor({
      urls: ['https://docs.example.com/b']
    });

    const merged = mergeDescriptors(first, second);
    expect(merged.urls).toEqual([
      'https://example.com/a',
      'https://docs.example.com/b'
    ]);
  });
});
