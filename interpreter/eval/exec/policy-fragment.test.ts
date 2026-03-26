import { describe, expect, it } from 'vitest';
import { createHandleWrapper, createFactSourceHandle } from '@core/types/handle';
import { makeSecurityDescriptor } from '@core/types/security';
import { parseSync } from '@grammar/parser';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { evaluateDirective } from '@interpreter/eval/directive';
import { resolveInvocationPolicyFragment } from './policy-fragment';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('resolveInvocationPolicyFragment', () => {
  it('resolves handle-backed authorization constraints to live values before normalization', async () => {
    const env = createEnv();
    const approvedRecipient = wrapStructured('acct-1', 'text', 'acct-1', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const issued = env.issueHandle(approvedRecipient);

    const policy = await resolveInvocationPolicyFragment(
      {
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { 'exfil:send': ['tool:w'] },
        authorizations: {
          allow: {
            sendMoney: {
              args: {
                recipient: createHandleWrapper(issued.handle)
              }
            }
          }
        }
      },
      env
    );

    const clause = policy?.authorizations?.allow.sendMoney;
    expect(clause).toBeDefined();
    expect(clause?.kind).toBe('constrained');

    const recipientConstraint = clause?.kind === 'constrained'
      ? clause.args.recipient?.[0]
      : undefined;
    expect(recipientConstraint).toBeDefined();
    expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
    if (!recipientConstraint || !('eq' in recipientConstraint)) {
      return;
    }

    expect(isStructuredValue(recipientConstraint.eq)).toBe(true);
    expect(recipientConstraint.eq).not.toEqual(createHandleWrapper(issued.handle));
    expect((recipientConstraint.eq as any).text).toBe('acct-1');
    expect(recipientConstraint.attestations).toEqual(['known']);
  });

  it('resolves handle-backed constraints issued from fact-bearing live values', async () => {
    const env = createEnv();
    const email = wrapStructured('ada@example.com', 'text', 'ada@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      }),
      factsources: [
        createFactSourceHandle({
          sourceRef: '@contact',
          field: 'email'
        })
      ]
    });
    const issued = env.issueHandle(email);

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            sendEmail: {
              args: {
                recipient: createHandleWrapper(issued.handle)
              }
            }
          }
        }
      },
      env
    );

    const clause = policy?.authorizations?.allow.sendEmail;
    expect(clause?.kind).toBe('constrained');

    const recipientConstraint = clause?.kind === 'constrained'
      ? clause.args.recipient?.[0]
      : undefined;
    expect(recipientConstraint).toBeDefined();
    expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
    if (!recipientConstraint || !('eq' in recipientConstraint)) {
      return;
    }

    expect(isStructuredValue(recipientConstraint.eq)).toBe(true);
    expect((recipientConstraint.eq as any).mx.has_label?.('fact:*.email')).toBe(true);
    expect(recipientConstraint.attestations).toEqual(['fact:@contact.email']);
  });

  it('resolves arrays of handle-backed authorization constraints to live values', async () => {
    const env = createEnv();
    const recipientA = wrapStructured('alice@example.com', 'text', 'alice@example.com', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const recipientB = wrapStructured('bob@example.com', 'text', 'bob@example.com', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const handleA = env.issueHandle(recipientA);
    const handleB = env.issueHandle(recipientB);

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            sendEmail: {
              args: {
                recipients: [createHandleWrapper(handleA.handle), createHandleWrapper(handleB.handle)]
              }
            }
          }
        }
      },
      env
    );

    const clause = policy?.authorizations?.allow.sendEmail;
    expect(clause?.kind).toBe('constrained');

    const recipientsConstraint = clause?.kind === 'constrained'
      ? clause.args.recipients?.[0]
      : undefined;
    expect(recipientsConstraint).toBeDefined();
    expect(recipientsConstraint && 'eq' in recipientsConstraint).toBe(true);
    if (!recipientsConstraint || !('eq' in recipientsConstraint)) {
      return;
    }

    expect(Array.isArray(recipientsConstraint.eq)).toBe(true);
    expect(recipientsConstraint.eq).not.toEqual([
      createHandleWrapper(handleA.handle),
      createHandleWrapper(handleB.handle)
    ]);
    const resolvedRecipients = recipientsConstraint.eq as unknown[];
    expect(resolvedRecipients).toHaveLength(2);
    expect(isStructuredValue(resolvedRecipients[0])).toBe(true);
    expect(isStructuredValue(resolvedRecipients[1])).toBe(true);
    expect((resolvedRecipients[0] as any).text).toBe('alice@example.com');
    expect((resolvedRecipients[1] as any).text).toBe('bob@example.com');
    expect(recipientsConstraint.attestations).toEqual(['known']);
  });

  it('compiles attestation proof for arrays of handle-backed constraints coming from policy variables', async () => {
    const env = createEnv();
    const recipientA = wrapStructured('alice@example.com', 'text', 'alice@example.com', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const recipientB = wrapStructured('bob@example.com', 'text', 'bob@example.com', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const handleA = env.issueHandle(recipientA);
    const handleB = env.issueHandle(recipientB);

    await evaluateDirective(
      parseSync(`/var @taskPolicy = { authorizations: { allow: { sendEmail: { args: { recipients: ${JSON.stringify([createHandleWrapper(handleA.handle), createHandleWrapper(handleB.handle)])} } } } } }`)[0] as any,
      env
    );

    const policy = await resolveInvocationPolicyFragment(
      {
        type: 'VariableReference',
        nodeId: 'task-policy-ref',
        identifier: 'taskPolicy',
        fields: []
      } as any,
      env
    );
    const clause = policy?.authorizations?.allow.sendEmail;
    expect(clause?.kind).toBe('constrained');
    const recipientsConstraint = clause?.kind === 'constrained'
      ? clause.args.recipients?.[0]
      : undefined;
    expect(recipientsConstraint && 'eq' in recipientsConstraint).toBe(true);
    if (!recipientsConstraint || !('eq' in recipientsConstraint)) {
      return;
    }
    expect(recipientsConstraint.attestations).toEqual(['known']);
  });

  it('fails closed when authorization constraints reference unknown handles', async () => {
    const env = createEnv();

    await expect(
      resolveInvocationPolicyFragment(
        {
          authorizations: {
            allow: {
              sendEmail: {
                args: {
                  recipient: createHandleWrapper('h_missing')
                }
              }
            }
          }
        },
        env
      )
    ).rejects.toThrow(/unknown handle/i);
  });

  it('materializes emitted bare literal authorization constraints from prior projected values', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );
    const contactEmail = wrapStructured('ada@example.com', 'text', 'ada@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });
    env.recordProjectionExposure({
      sessionId: 'planner-session',
      value: contactEmail,
      kind: 'bare',
      field: 'email',
      record: 'contact',
      emittedLiteral: 'ada@example.com',
      issuedAt: Date.now()
    });

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            sendEmail: {
              args: {
                recipient: 'ada@example.com'
              }
            }
          }
        }
      },
      env
    );

    const clause = policy?.authorizations?.allow.sendEmail;
    expect(clause?.kind).toBe('constrained');

    const recipientConstraint = clause?.kind === 'constrained'
      ? clause.args.recipient?.[0]
      : undefined;
    expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
    if (!recipientConstraint || !('eq' in recipientConstraint)) {
      return;
    }

    expect(isStructuredValue(recipientConstraint.eq)).toBe(true);
    expect((recipientConstraint.eq as any).mx.has_label?.('fact:*.email')).toBe(true);
    expect(recipientConstraint.eq).not.toBe('ada@example.com');
  });

  it('materializes emitted masked preview authorization constraints from prior projected values', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );
    const contactEmail = wrapStructured('mark@example.com', 'text', 'mark@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });

    env.recordProjectionExposure({
      sessionId: 'planner-session',
      value: contactEmail,
      kind: 'mask',
      handle: 'h_mark01',
      field: 'email',
      record: 'contact',
      emittedPreview: 'm***@example.com',
      issuedAt: Date.now()
    });

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            sendEmail: {
              args: {
                recipient: 'm***@example.com'
              }
            }
          }
        }
      },
      env
    );

    const clause = policy?.authorizations?.allow.sendEmail;
    expect(clause?.kind).toBe('constrained');

    const recipientConstraint = clause?.kind === 'constrained'
      ? clause.args.recipient?.[0]
      : undefined;
    expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
    if (!recipientConstraint || !('eq' in recipientConstraint)) {
      return;
    }

    expect(isStructuredValue(recipientConstraint.eq)).toBe(true);
    expect((recipientConstraint.eq as any).mx.has_label?.('fact:*.email')).toBe(true);
    expect(recipientConstraint.eq).not.toBe('m***@example.com');
  });

  it('fails closed on ambiguous projected previews in authorization constraints', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );

    env.recordProjectionExposure({
      sessionId: 'planner-a',
      value: wrapStructured('sarah@company.com', 'text', 'sarah@company.com', {
        security: makeSecurityDescriptor({
          labels: ['fact:@contact.email']
        })
      }),
      kind: 'mask',
      handle: 'h_sarah01',
      emittedPreview: 's***@company.com',
      issuedAt: 1
    });
    env.recordProjectionExposure({
      sessionId: 'planner-b',
      value: wrapStructured('steve@company.com', 'text', 'steve@company.com', {
        security: makeSecurityDescriptor({
          labels: ['fact:@contact.email']
        })
      }),
      kind: 'mask',
      handle: 'h_steve01',
      emittedPreview: 's***@company.com',
      issuedAt: 2
    });

    await expect(
      resolveInvocationPolicyFragment(
        {
          authorizations: {
            allow: {
              sendEmail: {
                args: {
                  recipient: 's***@company.com'
                }
              }
            }
          }
        },
        env
      )
    ).rejects.toThrow(/handle wrapper from the tool result/i);
  });
});
