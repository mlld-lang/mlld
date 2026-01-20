import { describe, it, expect } from 'vitest';
import { generatePolicyGuards } from './guards';
import type { PolicyConfig } from './union';

describe('generatePolicyGuards defaults rules', () => {
  it('adds built-in rule guards', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-secret-exfil', 'no-untrusted-destructive'] }
    };

    const guards = generatePolicyGuards(policy);
    const names = guards.map(guard => guard.name);

    expect(names).toContain('__policy_rule_no_secret_exfil');
    expect(names).toContain('__policy_rule_no_untrusted_destructive');

    const secretGuard = guards.find(guard => guard.name === '__policy_rule_no_secret_exfil');
    expect(secretGuard?.filterKind).toBe('data');
    expect(secretGuard?.filterValue).toBe('secret');
    expect(secretGuard?.privileged).toBe(true);
  });
});
