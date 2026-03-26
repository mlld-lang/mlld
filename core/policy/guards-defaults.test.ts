import { describe, it, expect } from 'vitest';
import { evaluateAuthorizationInheritedPolicyChecks, generatePolicyGuards } from './guards';
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

  it('checks named destination arg attestations for send rules', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown', 'no-send-to-external'] },
      operations: { 'exfil:send': ['mail:send'] }
    };

    const guards = generatePolicyGuards(policy);
    const sendUnknown = guards.find(guard => guard.name === '__policy_rule_no_send_to_unknown');
    const sendExternal = guards.find(guard => guard.name === '__policy_rule_no_send_to_external');

    expect(
      sendUnknown?.policyCondition?.({
        operation: {
          name: 'send',
          labels: ['mail:send'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { attestations: ['fact:@contact.email'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      sendUnknown?.policyCondition?.({
        operation: {
          name: 'send',
          labels: ['mail:send'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      sendUnknown?.policyCondition?.({
        operation: {
          name: 'send',
          labels: ['mail:send'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1', subject: 'ok' },
        argDescriptors: {
          subject: { attestations: ['known'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'"
    });

    expect(
      sendExternal?.policyCondition?.({
        operation: {
          name: 'send',
          labels: ['mail:send'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { attestations: ['known'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'"
    });

    expect(
      sendExternal?.policyCondition?.({
        operation: {
          name: 'send',
          labels: ['mail:send'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { attestations: ['fact:internal:@contact.email'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      sendExternal?.policyCondition?.({
        operation: {
          name: 'send',
          labels: ['mail:send'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { attestations: ['known:internal'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      sendUnknown?.policyCondition?.({
        operation: {
          name: 'createCalendarEvent',
          labels: ['mail:send'],
          metadata: { authorizationControlArgs: ['participants'] }
        },
        args: { participants: ['acct-1'] },
        argDescriptors: {
          participants: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });
  });

  it('falls back to the first provided arg for non-tool exfil:send operations', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['mail:send'] }
    };

    const guards = generatePolicyGuards(policy);
    const sendUnknown = guards.find(guard => guard.name === '__policy_rule_no_send_to_unknown');

    expect(
      sendUnknown?.policyCondition?.({
        operation: {
          name: 'send',
          labels: ['mail:send']
        },
        args: { destination: 'acct-1', body: 'hello' },
        argDescriptors: {
          destination: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });
  });

  it('fails closed for tool:w exfil:send operations without control-arg metadata', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w:send_money'] }
    };

    const guards = generatePolicyGuards(policy);
    const sendUnknown = guards.find(guard => guard.name === '__policy_rule_no_send_to_unknown');

    expect(
      sendUnknown?.policyCondition?.({
        operation: {
          name: 'sendMoney',
          labels: ['tool:w:send_money']
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { attestations: ['known'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'"
    });
  });

  it('checks named target arg attestations for destructive:targeted rules', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-destroy-unknown'] },
      operations: { 'destructive:targeted': ['tool:w:delete'] }
    };

    const guards = generatePolicyGuards(policy);
    const destroyGuard = guards.find(guard => guard.name === '__policy_rule_no_destroy_unknown');

    expect(
      destroyGuard?.policyCondition?.({
        operation: { name: 'delete', labels: ['tool:w:delete'] },
        args: { id: 'tx-1' },
        argDescriptors: {
          id: { attestations: ['fact:@task.id'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      destroyGuard?.policyCondition?.({
        operation: { name: 'delete', labels: ['tool:w:delete'] },
        args: { id: 'tx-1' },
        argDescriptors: {
          id: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      destroyGuard?.policyCondition?.({
        operation: { name: 'delete', labels: ['tool:w:delete'] },
        args: { fileId: 'tx-1' },
        argDescriptors: {
          fileId: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      destroyGuard?.policyCondition?.({
        operation: { name: 'delete', labels: ['tool:w:delete'] },
        args: { id: 'tx-1', note: 'x' },
        argDescriptors: {
          note: { attestations: ['known'] }
        }
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

  it('requires named destination args to keep known checks when authorization guards match', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown', 'no-send-to-external'] },
      operations: { 'exfil:send': ['tool:w:send_money'] }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['tool:w:send_money'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1', cc: [], bcc: [] },
        argDescriptors: {
          recipient: { attestations: ['known:internal'] }
        }
      })
    ).toBeUndefined();

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['tool:w:send_money'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { labels: [] }
        }
      })
    ).toMatchObject({
      rule: 'policy.defaults.rules.no-send-to-unknown'
    });
  });

  it('requires named target args to keep destroy-known checks when authorization guards match', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-destroy-unknown'] },
      operations: { 'destructive:targeted': ['tool:w:cancel_transaction'] }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: { labels: ['tool:w:cancel_transaction'] },
        args: { id: 'tx-1' },
        argDescriptors: {
          id: { attestations: ['known'] }
        }
      })
    ).toBeUndefined();

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: { labels: ['tool:w:cancel_transaction'] },
        args: { id: 'tx-1' },
        argDescriptors: {
          id: { labels: [] }
        }
      })
    ).toMatchObject({
      rule: 'policy.defaults.rules.no-destroy-unknown'
    });
  });

  it('allows authorization-carried attestations to satisfy inherited positive checks', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w:send_money'] }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['tool:w:send_money'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { labels: [] }
        },
        authorizedArgAttestations: {
          recipient: ['known']
        }
      })
    ).toBeUndefined();
  });

  it('allows fact attestations to satisfy inherited positive checks', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown', 'no-send-to-external', 'no-destroy-unknown'] },
      operations: {
        'exfil:send': ['tool:w:send_mail'],
        'destructive:targeted': ['tool:w:delete_record']
      }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['tool:w:send_mail'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        args: { recipient: 'acct-1' },
        argDescriptors: {
          recipient: { attestations: ['fact:internal:@contact.email'] }
        }
      })
    ).toBeUndefined();

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: { labels: ['tool:w:delete_record'] },
        args: { id: 'tx-1' },
        argDescriptors: {
          id: { attestations: ['fact:@task.id'] }
        }
      })
    ).toBeUndefined();
  });
});
