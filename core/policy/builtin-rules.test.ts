import { describe, it, expect } from 'vitest';
import { shouldAddInfluencedLabel } from './builtin-rules';
import type { PolicyConfig } from './union';

describe('shouldAddInfluencedLabel', () => {
  it('returns true when untrusted input reaches an llm exe', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['untrusted-llms-get-influenced'] }
    };

    expect(shouldAddInfluencedLabel(policy, ['untrusted'], ['llm'])).toBe(true);
  });

  it('uses unlabeled defaults to infer untrusted input', () => {
    const policy: PolicyConfig = {
      defaults: {
        unlabeled: 'untrusted',
        rules: ['untrusted-llms-get-influenced']
      }
    };

    expect(shouldAddInfluencedLabel(policy, ['src:exec'], ['llm'])).toBe(true);
  });

  it('returns false when the rule is disabled', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-secret-exfil'] }
    };

    expect(shouldAddInfluencedLabel(policy, ['untrusted'], ['llm'])).toBe(false);
  });
});
