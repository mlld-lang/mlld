import { describe, it, expect } from 'vitest';
import {
  makeSecurityDescriptor,
  mergeDescriptors,
  normalizeSecurityDescriptor,
  removeLabelsFromDescriptor,
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
    expect(makeSecurityDescriptor()).toBe(descriptor);
  });

  it('interns repeated equal descriptors and canonical empty arrays', () => {
    const first = makeSecurityDescriptor({ labels: ['known'], sources: ['src:mcp'] });
    const second = makeSecurityDescriptor({ labels: ['known'], sources: ['src:mcp'] });

    expect(second).toBe(first);
    expect(first.labels).toBe(second.labels);
    expect(first.sources).toBe(second.sources);
    expect(Object.isFrozen(first.labels)).toBe(true);
  });

  it('does not intern descriptors with nested policy contexts', () => {
    const first = makeSecurityDescriptor({
      labels: ['secret'],
      policyContext: { nested: { rule: 'a' } as any }
    });
    const second = makeSecurityDescriptor({
      labels: ['secret'],
      policyContext: { nested: { rule: 'a' } as any }
    });

    expect(second).not.toBe(first);
    expect(second.policyContext).toEqual(first.policyContext);
  });

  it('normalizes shape-compatible descriptors defensively', () => {
    const labels = ['secret'];
    const input = {
      labels,
      taint: ['secret'],
      attestations: [],
      sources: [],
      urls: ['https://example.com/a']
    };

    const normalized = normalizeSecurityDescriptor(input);
    expect(normalized).toBeDefined();
    expect(normalized).not.toBe(input);

    labels.push('mutated');
    expect(normalized?.labels).toEqual(['secret']);
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

  it('preserves url provenance when removing labels', () => {
    const descriptor = makeSecurityDescriptor({
      labels: ['known', 'untrusted'],
      sources: ['src:file'],
      urls: ['https://example.com/a'],
      tools: [{ name: 'fetch', auditRef: 'audit-1' }],
      capability: 'command',
      policyContext: { rule: 'test' }
    });

    const stripped = removeLabelsFromDescriptor(descriptor, ['untrusted']);
    expect(stripped?.labels).toEqual(['known']);
    expect(stripped?.urls).toEqual(['https://example.com/a']);
    expect(stripped?.sources).toEqual(['src:file']);
    expect(stripped?.tools).toEqual([{ name: 'fetch', auditRef: 'audit-1' }]);
    expect(stripped?.capability).toBe('command');
    expect(stripped?.policyContext).toEqual({ rule: 'test' });
  });
});
