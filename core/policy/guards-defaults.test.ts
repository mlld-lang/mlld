import { describe, it, expect } from 'vitest';
import {
  evaluateAuthorizationInheritedPolicyChecks,
  evaluateControlArgCorrelation,
  generatePolicyGuards
} from './guards';
import { createFactSourceHandle } from '@core/types/handle';
import type { PolicyConfig } from './union';

describe('generatePolicyGuards defaults rules', () => {
  it('adds built-in rule guards', () => {
    const policy: PolicyConfig = {
      defaults: {
        rules: [
          'no-secret-exfil',
          'no-novel-urls',
          'no-send-to-unknown',
          'no-send-to-external',
          'no-destroy-unknown',
          'no-unknown-extraction-sources',
          'no-untrusted-destructive'
        ]
      }
    };

    const guards = generatePolicyGuards(policy);
    const names = guards.map(guard => guard.name);

    expect(names).toContain('__policy_rule_no_secret_exfil');
    expect(names).toContain('__policy_rule_no_novel_urls');
    expect(names).toContain('__policy_rule_no_send_to_unknown');
    expect(names).toContain('__policy_rule_no_send_to_external');
    expect(names).toContain('__policy_rule_no_destroy_unknown');
    expect(names).toContain('__policy_rule_no_unknown_extraction_sources');
    expect(names).toContain('__policy_rule_no_untrusted_destructive');

    const secretGuard = guards.find(guard => guard.name === '__policy_rule_no_secret_exfil');
    expect(secretGuard?.filterKind).toBe('data');
    expect(secretGuard?.filterValue).toBe('secret');
    expect(secretGuard?.privileged).toBe(true);

    const sendGuard = guards.find(guard => guard.name === '__policy_rule_no_send_to_unknown');
    expect(sendGuard?.filterKind).toBe('operation');
    expect(sendGuard?.filterValue).toBe('exe');
    expect(sendGuard?.privileged).toBe(true);

    const urlGuard = guards.find(guard => guard.name === '__policy_rule_no_novel_urls');
    expect(urlGuard?.filterKind).toBe('operation');
    expect(urlGuard?.filterValue).toBe('exe');
    expect(urlGuard?.privileged).toBe(true);

    const destroyGuard = guards.find(guard => guard.name === '__policy_rule_no_destroy_unknown');
    expect(destroyGuard?.filterKind).toBe('operation');
    expect(destroyGuard?.filterValue).toBe('exe');
    expect(destroyGuard?.privileged).toBe(true);
  });

  it('scopes no-untrusted-destructive to non-empty controlArgs and falls back on empty lists', () => {
    const scopedPolicy: PolicyConfig = {
      defaults: { rules: ['no-untrusted-destructive'] },
      operations: { destructive: ['tool:w'] }
    };

    const scopedGuard = generatePolicyGuards(scopedPolicy).find(
      guard => guard.name === '__policy_rule_no_untrusted_destructive'
    );

    expect(
      scopedGuard?.policyCondition?.({
        operation: {
          name: 'transfer',
          labels: ['tool:w'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        argName: 'memo',
        argDescriptors: {
          recipient: { labels: ['known'] },
          memo: { labels: ['untrusted'], taint: ['untrusted'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      scopedGuard?.policyCondition?.({
        operation: {
          name: 'transfer',
          labels: ['tool:w'],
          metadata: { authorizationControlArgs: [] }
        },
        argName: 'memo',
        argDescriptors: {
          recipient: { labels: ['known'] },
          memo: { labels: ['untrusted'], taint: ['untrusted'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'"
    });
  });

  it('checks all args for no-untrusted-privileged when policy taintFacts is enabled', () => {
    const policy: PolicyConfig = {
      defaults: {
        rules: [{ rule: 'no-untrusted-privileged', taintFacts: true }]
      },
      operations: { privileged: ['tool:w'] }
    };

    const guards = generatePolicyGuards(policy);
    const privilegedGuard = guards.find(guard => guard.name === '__policy_rule_no_untrusted_privileged');

    expect(
      privilegedGuard?.policyCondition?.({
        operation: {
          name: 'grantRole',
          labels: ['tool:w'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        argName: 'memo',
        argDescriptors: {
          recipient: { labels: ['known'] },
          memo: { labels: ['untrusted'], taint: ['untrusted'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-untrusted-privileged': label 'untrusted' cannot flow to 'privileged'"
    });
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
          participants: { attestations: ['fact:@calendar_evt.participants'] }
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

  it('checks named source arg attestations for extraction rules', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-unknown-extraction-sources'] }
    };

    const guards = generatePolicyGuards(policy);
    const extractGuard = guards.find(
      guard => guard.name === '__policy_rule_no_unknown_extraction_sources'
    );

    expect(
      extractGuard?.policyCondition?.({
        operation: {
          name: 'extractContacts',
          labels: ['tool:r'],
          metadata: { authorizationSourceArgs: ['source'] }
        },
        args: { source: 'contact-1' },
        argDescriptors: {
          source: { attestations: ['fact:@contact.id'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      extractGuard?.policyCondition?.({
        operation: {
          name: 'extractContacts',
          labels: ['tool:r'],
          metadata: { authorizationSourceArgs: ['source'] }
        },
        args: { source: 'contact-1' },
        argDescriptors: {
          source: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      extractGuard?.policyCondition?.({
        operation: {
          name: 'extractContacts',
          labels: ['tool:r'],
          metadata: { authorizationSourceArgs: ['source'] }
        },
        args: { source: 'contact-1' },
        argDescriptors: {
          query: { attestations: ['known'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      reason: "Rule 'no-unknown-extraction-sources': extraction source must carry 'known'"
    });

    expect(
      extractGuard?.policyCondition?.({
        operation: {
          name: 'extractContacts',
          labels: ['tool:r']
        },
        args: { source: 'contact-1' },
        argDescriptors: {
          source: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });
  });

  it('allows correlated control args when they come from the same keyed record', () => {
    expect(
      evaluateControlArgCorrelation({
        operation: {
          name: 'sendPayment',
          metadata: {
            authorizationControlArgs: ['recipient', 'txId'],
            correlateControlArgs: true
          }
        },
        args: { recipient: 'bob@example.com', txId: 'tx_001' },
        argDescriptors: {
          recipient: {
            factsources: [
              createFactSourceHandle({
                sourceRef: 'transaction',
                field: 'recipient',
                instanceKey: 'tx_001'
              })
            ]
          },
          txId: {
            factsources: [
              createFactSourceHandle({
                sourceRef: 'transaction',
                field: 'txId',
                instanceKey: 'tx_001'
              })
            ]
          }
        }
      })
    ).toBeUndefined();
  });

  it('denies correlated control args when they come from different keyed records', () => {
    expect(
      evaluateControlArgCorrelation({
        operation: {
          name: 'sendPayment',
          metadata: {
            authorizationControlArgs: ['recipient', 'txId'],
            correlateControlArgs: true
          }
        },
        args: { recipient: 'bob@example.com', txId: 'tx_002' },
        argDescriptors: {
          recipient: {
            factsources: [
              createFactSourceHandle({
                sourceRef: 'transaction',
                field: 'recipient',
                instanceKey: 'tx_001'
              })
            ]
          },
          txId: {
            factsources: [
              createFactSourceHandle({
                sourceRef: 'transaction',
                field: 'txId',
                instanceKey: 'tx_002'
              })
            ]
          }
        }
      })
    ).toMatchObject({
      rule: 'correlate-control-args',
      reason: expect.stringContaining('recipient -> @transaction[instance=tx_001]')
    });
  });

  it('denies correlated control args when a control arg lacks factsource metadata', () => {
    expect(
      evaluateControlArgCorrelation({
        operation: {
          name: 'sendPayment',
          metadata: {
            authorizationControlArgs: ['recipient', 'txId'],
            correlateControlArgs: true
          }
        },
        args: { recipient: 'bob@example.com', txId: 'tx_002' },
        argDescriptors: {
          recipient: {
            factsources: [
              createFactSourceHandle({
                sourceRef: 'transaction',
                field: 'recipient',
                instanceKey: 'tx_001'
              })
            ]
          },
          txId: {}
        }
      })
    ).toMatchObject({
      rule: 'correlate-control-args',
      reason: expect.stringContaining("arg 'txId' does not carry source-record provenance")
    });
  });

  it('ignores correlation checks for single control-arg tools', () => {
    expect(
      evaluateControlArgCorrelation({
        operation: {
          name: 'sendPayment',
          metadata: {
            authorizationControlArgs: ['recipient'],
            correlateControlArgs: true
          }
        },
        args: { recipient: 'bob@example.com' },
        argDescriptors: {
          recipient: {}
        }
      })
    ).toBeUndefined();
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

  it('denies influenced args with URLs absent from the registry', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-novel-urls'] }
    };

    const guards = generatePolicyGuards(policy);
    const urlGuard = guards.find(guard => guard.name === '__policy_rule_no_novel_urls');

    expect(
      urlGuard?.policyCondition?.({
        operation: {
          name: 'sendMessage',
          labels: ['tool:w:send_message']
        },
        argDescriptors: {
          body: {
            labels: ['influenced'],
            urls: ['https://evil.com/collect?d=secret']
          }
        },
        urlRegistry: ['https://example.com/reference']
      })
    ).toMatchObject({
      decision: 'deny',
      rule: 'policy.defaults.rules.no-novel-urls'
    });
  });

  it('allows influenced args when the URL is known or allowlisted', () => {
    const knownPolicy: PolicyConfig = {
      defaults: { rules: ['no-novel-urls'] }
    };
    const allowlistedPolicy: PolicyConfig = {
      defaults: { rules: ['no-novel-urls'] },
      urls: { allowConstruction: ['google.com'] }
    };

    const knownGuard = generatePolicyGuards(knownPolicy).find(
      guard => guard.name === '__policy_rule_no_novel_urls'
    );
    const allowlistedGuard = generatePolicyGuards(allowlistedPolicy).find(
      guard => guard.name === '__policy_rule_no_novel_urls'
    );

    expect(
      knownGuard?.policyCondition?.({
        operation: { name: 'fetch' },
        argDescriptors: {
          url: {
            labels: ['influenced'],
            urls: ['https://known.example.com/page']
          }
        },
        urlRegistry: ['https://known.example.com/page']
      })
    ).toEqual({ decision: 'allow' });

    expect(
      allowlistedGuard?.policyCondition?.({
        operation: { name: 'fetch' },
        argDescriptors: {
          url: {
            labels: ['influenced'],
            urls: ['https://www.google.com/search?q=ada']
          }
        },
        urlRegistry: []
      })
    ).toEqual({ decision: 'allow' });
  });

  it('does not apply no-novel-urls to args without influenced labels', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-novel-urls'] }
    };

    const guards = generatePolicyGuards(policy);
    const urlGuard = guards.find(guard => guard.name === '__policy_rule_no_novel_urls');

    expect(
      urlGuard?.policyCondition?.({
        operation: { name: 'fetch' },
        argDescriptors: {
          url: {
            labels: ['public'],
            urls: ['https://evil.com/collect?d=secret']
          }
        },
        urlRegistry: []
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
        operation: {
          name: 'deleteCalendarEvent',
          labels: ['tool:w:delete'],
          metadata: { authorizationControlArgs: ['eventRef'] }
        },
        args: { eventRef: 'evt-1' },
        argDescriptors: {
          eventRef: { attestations: ['fact:@calendar_evt.event_ref'] }
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

  it('keeps extraction-source positive checks in inherited authorization paths', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-unknown-extraction-sources'] }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['tool:r'],
          metadata: { authorizationSourceArgs: ['source'] }
        },
        args: { source: 'doc-1' },
        argDescriptors: {
          source: { attestations: ['known'] }
        }
      })
    ).toBeUndefined();

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['tool:r'],
          metadata: { authorizationSourceArgs: ['source'] }
        },
        args: { source: 'doc-1' },
        argDescriptors: {
          source: { labels: [] }
        }
      })
    ).toMatchObject({
      rule: 'policy.defaults.rules.no-unknown-extraction-sources'
    });
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

    const controlArgPolicy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown', 'no-destroy-unknown'] },
      operations: {
        'exfil:send': ['tool:w:send_mail'],
        'destructive:targeted': ['tool:w:delete_record']
      }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy: controlArgPolicy,
        operation: {
          labels: ['tool:w:send_mail'],
          metadata: { authorizationControlArgs: ['participants'] }
        },
        args: { participants: ['ada@example.com'] },
        argDescriptors: {
          participants: { attestations: ['fact:@calendar_evt.participants'] }
        }
      })
    ).toBeUndefined();

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy: controlArgPolicy,
        operation: {
          labels: ['tool:w:delete_record'],
          metadata: { authorizationControlArgs: ['targetRef'] }
        },
        args: { targetRef: 'tx-1' },
        argDescriptors: {
          targetRef: { attestations: ['fact:@task.target_ref'] }
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

  it('keeps field-name heuristics on inferred positive-check paths', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown', 'no-destroy-unknown'] },
      operations: {
        'exfil:send': ['mail:send'],
        'destructive:targeted': ['tool:w:delete_record']
      }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['mail:send']
        },
        args: { participants: ['ada@example.com'] },
        argDescriptors: {
          participants: { attestations: ['fact:@calendar_evt.participants'] }
        }
      })
    ).toMatchObject({
      rule: 'policy.defaults.rules.no-send-to-unknown'
    });

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          labels: ['tool:w:delete_record']
        },
        args: { targetRef: 'tx-1' },
        argDescriptors: {
          targetRef: { attestations: ['fact:@task.target_ref'] }
        }
      })
    ).toMatchObject({
      rule: 'policy.defaults.rules.no-destroy-unknown'
    });
  });

  it('uses projection-first suggestions for inherited positive checks', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w:send_email'] }
    };

    const failure = evaluateAuthorizationInheritedPolicyChecks({
      policy,
      operation: {
        labels: ['tool:w:send_email'],
        metadata: { authorizationControlArgs: ['recipient'] }
      },
      args: { recipient: 'evil@example.com' }
    });

    expect(failure?.suggestions).toContain(
      'Use a projected handle for the destination from an approved tool result or another approved source'
    );
    expect(failure?.suggestions?.join('\n')).not.toContain('@fyi.known');
  });

  it('enforces declarative fact requirements for runtime guards and inherited checks', () => {
    const policy: PolicyConfig = {
      facts: {
        requirements: {
          '@createCalendarEvent': {
            participants: ['fact:internal:*.email']
          }
        }
      }
    };

    const guards = generatePolicyGuards(policy);
    const factGuard = guards.find(guard =>
      guard.name.includes('__policy_fact_requirement_op:named:createcalendarevent_participants')
    );

    expect(
      factGuard?.policyCondition?.({
        operation: {
          name: 'createCalendarEvent',
          named: 'op:named:createcalendarevent',
          labels: ['tool:w:create_calendar_event']
        },
        args: { participants: ['ada@example.com'] },
        argDescriptors: {
          participants: { attestations: ['fact:internal:@contact.email'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      factGuard?.policyCondition?.({
        operation: {
          name: 'createCalendarEvent',
          named: 'op:named:createcalendarevent',
          labels: ['tool:w:create_calendar_event']
        },
        args: { participants: ['ada@example.com'] },
        argDescriptors: {
          participants: { attestations: ['fact:@contact.email'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      rule: 'policy.facts.requirements.op:named:createcalendarevent.participants',
      suggestions: [
        "Use a projected handle for 'participants' from an approved tool result or another approved source",
        'Review active policies with @mx.policy.active'
      ]
    });

    const inheritedFailure = evaluateAuthorizationInheritedPolicyChecks({
      policy,
      operation: {
        name: 'createCalendarEvent',
        named: 'op:named:createcalendarevent',
        labels: ['tool:w:create_calendar_event']
      },
      args: { participants: ['ada@example.com'] },
      argDescriptors: {
        participants: { attestations: ['fact:@contact.email'] }
      }
    });

    expect(inheritedFailure).toMatchObject({
      rule: 'policy.facts.requirements.op:named:createcalendarevent.participants'
    });
    expect(inheritedFailure?.suggestions).toContain(
      "Use a projected handle for 'participants' from an approved tool result or another approved source"
    );
    expect(inheritedFailure?.suggestions?.join('\n')).not.toContain('@fyi.known');

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy,
        operation: {
          name: 'createCalendarEvent',
          labels: ['tool:w:create_calendar_event']
        },
        args: { participants: ['ada@example.com'] },
        argDescriptors: {
          participants: { attestations: ['fact:internal:@contact.email'] }
        }
      })
    ).toBeUndefined();
  });

  it('uses exact field fact requirements to reject wrong-record control arg proofs', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w:invite_user_to_slack'] },
      facts: {
        requirements: {
          '@invite_user_to_slack': {
            user_email: ['known', 'fact:*.user_email']
          }
        }
      }
    };
    const operation = {
      name: 'invite_user_to_slack',
      named: 'op:named:invite_user_to_slack',
      labels: ['tool:w:invite_user_to_slack'],
      metadata: { authorizationControlArgs: ['user', 'user_email'] }
    };
    const args = { user: 'Dora', user_email: 'dora@example.com' };

    const guards = generatePolicyGuards(policy);
    const factGuard = guards.find(guard =>
      guard.name.includes('__policy_fact_requirement_op:named:invite_user_to_slack_user_email')
    );

    expect(
      factGuard?.policyCondition?.({
        operation,
        args,
        argDescriptors: {
          user: { attestations: ['known'] },
          user_email: { attestations: ['fact:@slack_msg.sender'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      rule: 'policy.facts.requirements.op:named:invite_user_to_slack.user_email'
    });

    expect(
      factGuard?.policyCondition?.({
        operation,
        args,
        argDescriptors: {
          user: { attestations: ['known'] },
          user_email: { attestations: ['fact:@contact.email'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      rule: 'policy.facts.requirements.op:named:invite_user_to_slack.user_email'
    });

    expect(
      factGuard?.policyCondition?.({
        operation,
        args,
        argDescriptors: {
          user: { attestations: ['known'] },
          user_email: { attestations: ['fact:@directory.user_email'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      factGuard?.policyCondition?.({
        operation,
        args,
        argDescriptors: {
          user: { attestations: ['known'] },
          user_email: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });
  });

  it('uses explicit fact requirement overrides to accept differently named source fields', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w:invite_user_to_slack'] },
      facts: {
        requirements: {
          '@invite_user_to_slack': {
            user_email: ['known', 'fact:*.email']
          }
        }
      }
    };
    const operation = {
      name: 'invite_user_to_slack',
      named: 'op:named:invite_user_to_slack',
      labels: ['tool:w:invite_user_to_slack'],
      metadata: { authorizationControlArgs: ['user', 'user_email'] }
    };
    const args = { user: 'Dora', user_email: 'Dora' };

    const guards = generatePolicyGuards(policy);
    const factGuard = guards.find(guard =>
      guard.name.includes('__policy_fact_requirement_op:named:invite_user_to_slack_user_email')
    );

    expect(
      factGuard?.policyCondition?.({
        operation,
        args,
        argDescriptors: {
          user: { attestations: ['known'] },
          user_email: { attestations: ['fact:@slack_msg.sender'] }
        }
      })
    ).toMatchObject({
      decision: 'deny',
      rule: 'policy.facts.requirements.op:named:invite_user_to_slack.user_email'
    });

    expect(
      factGuard?.policyCondition?.({
        operation,
        args,
        argDescriptors: {
          user: { attestations: ['known'] },
          user_email: { attestations: ['fact:@contact.email'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    expect(
      factGuard?.policyCondition?.({
        operation,
        args,
        argDescriptors: {
          user: { attestations: ['known'] },
          user_email: { attestations: ['known'] }
        }
      })
    ).toEqual({ decision: 'allow' });

    const inheritedFailure = evaluateAuthorizationInheritedPolicyChecks({
      policy,
      operation,
      args,
      argDescriptors: {
        user: { attestations: ['known'] },
        user_email: { attestations: ['fact:@slack_msg.sender'] }
      }
    });

    expect(inheritedFailure).toMatchObject({
      rule: 'policy.facts.requirements.op:named:invite_user_to_slack.user_email'
    });
  });

  it('scopes inherited no-untrusted-privileged checks to non-empty controlArgs unless taintFacts is enabled', () => {
    const scopedPolicy: PolicyConfig = {
      defaults: { rules: ['no-untrusted-privileged'] },
      operations: { privileged: ['tool:w'] }
    };

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy: scopedPolicy,
        operation: {
          name: 'grantRole',
          labels: ['tool:w'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        argDescriptors: {
          recipient: { labels: ['known'] },
          memo: { labels: ['untrusted'], taint: ['untrusted'] }
        }
      })
    ).toBeUndefined();

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy: scopedPolicy,
        operation: {
          name: 'grantRole',
          labels: ['tool:w'],
          metadata: { authorizationControlArgs: [] }
        },
        argDescriptors: {
          recipient: { labels: ['known'] },
          memo: { labels: ['untrusted'], taint: ['untrusted'] }
        }
      })
    ).toMatchObject({
      rule: 'policy.defaults.rules.no-untrusted-privileged'
    });

    expect(
      evaluateAuthorizationInheritedPolicyChecks({
        policy: {
          defaults: {
            rules: [{ rule: 'no-untrusted-privileged', taintFacts: true }]
          },
          operations: { privileged: ['tool:w'] }
        },
        operation: {
          name: 'grantRole',
          labels: ['tool:w'],
          metadata: { authorizationControlArgs: ['recipient'] }
        },
        argDescriptors: {
          recipient: { labels: ['known'] },
          memo: { labels: ['untrusted'], taint: ['untrusted'] }
        }
      })
    ).toMatchObject({
      rule: 'policy.defaults.rules.no-untrusted-privileged'
    });
  });
});
