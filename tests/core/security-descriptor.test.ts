import { describe, it, expect } from 'vitest';
import {
  makeSecurityDescriptor,
  mergeDescriptors,
  hasLabel,
  compareTaintLevels,
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
    expect(descriptor.taintLevel).toBe('unknown');
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(DATA_LABELS).toContain('secret');
  });

  it('falls back to default descriptor when no labels provided', () => {
    const descriptor = makeSecurityDescriptor();
    expect(descriptor.labels).toEqual([]);
    expect(descriptor.taintLevel).toBe('unknown');
  });

  it('merges descriptors preserving highest taint and labels', () => {
    const secret = makeSecurityDescriptor({ labels: ['secret'], taintLevel: 'userInput' });
    const network = makeSecurityDescriptor({ labels: ['network'], taintLevel: 'networkLive' });

    const merged = mergeDescriptors(secret, network);
    expect(merged.labels).toEqual(['secret', 'network']);
    expect(merged.taintLevel).toBe('networkLive');
    expect(hasLabel(merged, 'network')).toBe(true);
  });

  it('serialises and deserialises descriptors', () => {
    const descriptor = makeSecurityDescriptor({
      labels: ['pii'],
      taintLevel: 'resolver',
      sources: ['/tmp/data']
    });

    const serialised = serializeSecurityDescriptor(descriptor);
    expect(serialised).toMatchObject({
      labels: ['pii'],
      taintLevel: 'resolver',
      sources: ['/tmp/data']
    });

    const restored = deserializeSecurityDescriptor(serialised);
    expect(restored).toBeDefined();
    expect(restored!.labels).toEqual(['pii']);
    expect(restored!.taintLevel).toBe('resolver');
  });

  it('compares taint levels using defined order', () => {
    expect(compareTaintLevels('userInput', 'literal')).toBe('userInput');
    expect(compareTaintLevels('unknown', 'literal')).toBe('literal');
    expect(compareTaintLevels('networkLive', 'networkCached')).toBe('networkLive');
  });
});
