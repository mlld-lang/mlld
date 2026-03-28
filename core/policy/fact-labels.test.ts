import { describe, expect, it } from 'vitest';
import {
  collectFactLabels,
  getLabelPatternSpecificity,
  hasMatchingFactLabel,
  matchesFactPattern,
  matchesLabelPattern,
  parseFactLabel
} from './fact-labels';

describe('fact label helpers', () => {
  it('parses record-addressed fact labels with optional tiers', () => {
    expect(parseFactLabel('fact:internal:@contact.email')).toEqual({
      raw: 'fact:internal:@contact.email',
      tiers: ['internal'],
      ref: '@contact.email',
      sourceRef: '@contact',
      field: 'email',
      fieldSegments: ['email']
    });

    expect(parseFactLabel('known')).toBeNull();
  });

  it('matches exact fact labels and tier-insensitive record field patterns', () => {
    expect(matchesFactPattern('fact:internal:@contact.email', 'fact:internal:@contact.email')).toBe(true);
    expect(matchesFactPattern('fact:@contact.email', 'fact:internal:@contact.email')).toBe(true);
    expect(matchesFactPattern('fact:@contact.email', 'fact:external:@contact.email')).toBe(true);
    expect(matchesFactPattern('fact:@contact.email', 'fact:internal:@contact.phone')).toBe(false);
  });

  it('matches wildcard field suffix patterns', () => {
    expect(matchesFactPattern('fact:*.email', 'fact:internal:@contact.email')).toBe(true);
    expect(matchesFactPattern('fact:internal:*.email', 'fact:internal:@contact.email')).toBe(true);
    expect(matchesFactPattern('fact:internal:*.email', 'fact:external:@contact.email')).toBe(false);
    expect(matchesFactPattern('fact:*.email', 'fact:internal:@contact.phone')).toBe(false);
    expect(matchesFactPattern('fact:*', 'fact:internal:@contact.phone')).toBe(true);
    expect(matchesFactPattern('fact:internal:*', 'fact:internal:@contact.phone')).toBe(true);
    expect(matchesFactPattern('fact:internal:*', 'fact:external:@contact.phone')).toBe(false);
  });

  it('dedupes collected fact labels and exposes generic label matching', () => {
    expect(
      collectFactLabels([
        'fact:internal:@contact.email',
        'secret',
        'fact:internal:@contact.email',
        'fact:@contact.phone'
      ])
    ).toEqual(['fact:internal:@contact.email', 'fact:@contact.phone']);

    expect(matchesLabelPattern('fact:*.email', 'fact:internal:@contact.email')).toBe(true);
    expect(matchesLabelPattern('fact:*', 'fact:internal:@contact.email')).toBe(true);
    expect(matchesLabelPattern('known', 'known:internal')).toBe(true);
    expect(hasMatchingFactLabel(['fact:internal:@contact.email'], 'fact:internal:*.email')).toBe(true);
  });

  it('orders exact patterns above wildcard fact patterns', () => {
    expect(getLabelPatternSpecificity('fact:internal:@contact.email')).toBeGreaterThan(
      getLabelPatternSpecificity('fact:internal:*.email')
    );
    expect(getLabelPatternSpecificity('fact:@contact.email')).toBeGreaterThan(
      getLabelPatternSpecificity('fact:*.email')
    );
    expect(getLabelPatternSpecificity('fact:*.email')).toBeGreaterThan(
      getLabelPatternSpecificity('fact:*')
    );
  });
});
