import { describe, it, expect } from 'vitest';
import { generatePolicyGuards } from './guards';
import type { PolicyConfig } from './union';

describe('generatePolicyGuards defaults rules', () => {
  it('adds built-in rule guards', () => {
    const policy: PolicyConfig = {
      defaults: {
        rules: [
          'no-secret-exfil',
          'no-send-to-unknown',
          'no-send-to-external',
          'no-destroy-unknown',
          'no-untrusted-destructive'
        ]
      }
    };

    const guards = generatePolicyGuards(policy);
    const names = guards.map(guard => guard.name);

    expect(names).toContain('__policy_rule_no_secret_exfil');
    expect(names).toContain('__policy_rule_no_send_to_unknown');
    expect(names).toContain('__policy_rule_no_send_to_external');
    expect(names).toContain('__policy_rule_no_destroy_unknown');
    expect(names).toContain('__policy_rule_no_untrusted_destructive');

    const secretGuard = guards.find(guard => guard.name === '__policy_rule_no_secret_exfil');
    expect(secretGuard?.filterKind).toBe('data');
    expect(secretGuard?.filterValue).toBe('secret');
    expect(secretGuard?.privileged).toBe(true);

    const sendGuard = guards.find(guard => guard.name === '__policy_rule_no_send_to_unknown');
    expect(sendGuard?.filterKind).toBe('operation');
    expect(sendGuard?.filterValue).toBe('exe');
    expect(sendGuard?.privileged).toBe(true);

    const destroyGuard = guards.find(guard => guard.name === '__policy_rule_no_destroy_unknown');
    expect(destroyGuard?.filterKind).toBe('operation');
    expect(destroyGuard?.filterValue).toBe('exe');
    expect(destroyGuard?.privileged).toBe(true);
  });

  it('checks the first positional input for send destination labels', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown', 'no-send-to-external'] },
      operations: { 'exfil:send': ['mail:send'] }
    };

    const guards = generatePolicyGuards(policy);
    const sendUnknown = guards.find(guard => guard.name === '__policy_rule_no_send_to_unknown');
    const sendExternal = guards.find(guard => guard.name === '__policy_rule_no_send_to_external');

    expect(
      sendUnknown?.policyCondition?.({
        operation: { name: 'send', labels: ['mail:send'] },
        inputs: [{ labels: ['known'] }]
      })
    ).toEqual({ decision: 'allow' });

    expect(
      sendUnknown?.policyCondition?.({
        operation: { name: 'send', labels: ['mail:send'] },
        inputs: [{ labels: [] }, { labels: ['known'] }]
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'"
    });

    expect(
      sendExternal?.policyCondition?.({
        operation: { name: 'send', labels: ['mail:send'] },
        inputs: [{ labels: ['known'] }]
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'"
    });

    expect(
      sendExternal?.policyCondition?.({
        operation: { name: 'send', labels: ['mail:send'] },
        inputs: [{ labels: ['known:internal'] }]
      })
    ).toEqual({ decision: 'allow' });
  });

  it('checks the first positional input for destructive:targeted labels', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-destroy-unknown'] },
      operations: { 'destructive:targeted': ['tool:w:delete'] }
    };

    const guards = generatePolicyGuards(policy);
    const destroyGuard = guards.find(guard => guard.name === '__policy_rule_no_destroy_unknown');

    expect(
      destroyGuard?.policyCondition?.({
        operation: { name: 'delete', labels: ['tool:w:delete'] },
        inputs: [{ labels: ['known'] }]
      })
    ).toEqual({ decision: 'allow' });

    expect(
      destroyGuard?.policyCondition?.({
        operation: { name: 'delete', labels: ['tool:w:delete'] },
        inputs: [{ labels: [] }, { labels: ['known'] }]
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'"
    });

    expect(
      destroyGuard?.policyCondition?.({
        operation: { name: 'rotatePassword', labels: ['destructive:untargeted'] },
        inputs: [{ labels: [] }]
      })
    ).toEqual({ decision: 'allow' });
  });
});
