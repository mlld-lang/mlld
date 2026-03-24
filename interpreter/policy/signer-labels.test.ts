import { describe, expect, it } from 'vitest';
import { matchesAnySignerPattern, resolveSignerLabels } from './signer-labels';

describe('resolveSignerLabels', () => {
  it('unions labels from matching signer patterns', () => {
    expect(
      resolveSignerLabels(
        'agent:writer',
        'verified',
        {
          'agent:*': ['trusted'],
          'agent:writer': ['internal']
        },
        'untrusted'
      )
    ).toEqual(['trusted', 'internal']);
  });

  it('falls back to the default unlabeled trust stance when unsigned or unmatched', () => {
    expect(resolveSignerLabels(null, 'unsigned', {}, 'untrusted')).toEqual(['untrusted']);
    expect(
      resolveSignerLabels('user:alice', 'verified', { 'agent:*': ['trusted'] }, 'untrusted')
    ).toEqual(['untrusted']);
  });

  it('forces modified and corrupted files to untrusted', () => {
    expect(
      resolveSignerLabels('user:alice', 'modified', { 'user:*': ['trusted'] }, 'trusted')
    ).toEqual(['untrusted']);
    expect(
      resolveSignerLabels('user:alice', 'corrupted', { 'user:*': ['trusted'] }, 'trusted')
    ).toEqual(['untrusted']);
  });
});

describe('matchesAnySignerPattern', () => {
  it('supports wildcard signer patterns', () => {
    expect(matchesAnySignerPattern('user:alice', ['agent:*', 'user:*'])).toBe(true);
    expect(matchesAnySignerPattern('agent:build', ['user:*'])).toBe(false);
  });
});
