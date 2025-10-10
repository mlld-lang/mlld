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
  it('deduplicates labels and defaults inference', () => {
    const descriptor = makeSecurityDescriptor({
      labels: ['secret', 'secret', 'untrusted']
    });

    expect(Array.from(descriptor.labels)).toEqual(['secret', 'untrusted']);
    expect(descriptor.inference).toBe('explicit');
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(DATA_LABELS).toContain('secret');
  });

  it('falls back to default descriptor when no labels provided', () => {
    const descriptor = makeSecurityDescriptor();
    expect(Array.from(descriptor.labels)).toEqual([]);
    expect(descriptor.taint).toBe('unknown');
    expect(descriptor.inference).toBe('default');
  });

  it('merges descriptors preserving highest taint and labels', () => {
    const secret = makeSecurityDescriptor({ labels: ['secret'], taint: 'userInput' });
    const network = makeSecurityDescriptor({ labels: ['network'], taint: 'networkLive' });

    const merged = mergeDescriptors(secret, network);
    expect(Array.from(merged.labels)).toEqual(['secret', 'network']);
    expect(merged.taint).toBe('networkLive');
    expect(merged.inference).toBe('explicit');
    expect(hasLabel(merged, 'network')).toBe(true);
  });

  it('serialises and deserialises descriptors', () => {
    const descriptor = makeSecurityDescriptor({
      labels: ['pii'],
      taint: 'resolver',
      source: { path: '/tmp/data' }
    });

    const serialised = serializeSecurityDescriptor(descriptor);
    expect(serialised).toMatchObject({
      labels: ['pii'],
      taint: 'resolver',
      source: { path: '/tmp/data' }
    });

    const restored = deserializeSecurityDescriptor(serialised);
    expect(restored).toBeDefined();
    expect(Array.from(restored!.labels)).toEqual(['pii']);
    expect(restored!.taint).toBe('resolver');
  });

  it('compares taint levels using defined order', () => {
    expect(compareTaintLevels('userInput', 'literal')).toBe('userInput');
    expect(compareTaintLevels('unknown', 'literal')).toBe('literal');
    expect(compareTaintLevels('networkLive', 'networkCached')).toBe('networkLive');
  });
});
