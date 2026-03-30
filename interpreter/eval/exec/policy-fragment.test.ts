import { describe, expect, it } from 'vitest';
import { createHandleWrapper, createFactSourceHandle } from '@core/types/handle';
import { makeSecurityDescriptor } from '@core/types/security';
import { createObjectVariable } from '@core/types/variable';
import { parseSync } from '@grammar/parser';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { evaluateDirective } from '@interpreter/eval/directive';
import {
  getInvocationPolicyFragmentCompileReport,
  resolveInvocationPolicyFragment
} from './policy-fragment';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function setActiveLlmSession(env: Environment, sessionId: string): void {
  env.setLlmToolConfig({
    sessionId,
    mcpConfigPath: '',
    toolsCsv: '',
    mcpAllowedTools: '',
    nativeAllowedTools: '',
    unifiedAllowedTools: '',
    availableTools: [],
    inBox: false,
    cleanup: async () => {}
  });
}

function createFactEmailValue(email: string, sourceRef: string): ReturnType<typeof wrapStructured> {
  return wrapStructured(email, 'text', email, {
    security: makeSecurityDescriptor({
      labels: [`fact:${sourceRef}.email`]
    }),
    factsources: [
      createFactSourceHandle({
        sourceRef,
        field: 'email'
      })
    ]
  });
}

describe('resolveInvocationPolicyFragment', () => {
  it('resolves handle-backed authorization constraints to live values before normalization', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );
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
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );
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
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipients, subject, body) = `sent` with { controlArgs: ["recipients"] }')[0] as any,
      env
    );
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
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipients, subject, body) = `sent` with { controlArgs: ["recipients"] }')[0] as any,
      env
    );
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

  it('rejects authorization entries for tools denied by the ambient policy', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );
    env.setPolicySummary({
      authorizations: {
        deny: ['sendEmail']
      }
    });

    await expect(
      resolveInvocationPolicyFragment(
        {
          authorizations: {
            allow: {
              sendEmail: {
                args: {
                  recipient: {
                    eq: 'ada@example.com',
                    attestations: ['known']
                  }
                }
              }
            }
          }
        },
        env
      )
    ).rejects.toThrow(/denied by policy\.authorizations\.deny/i);
  });

  it('rejects proofless scalar control args during runtime policy compilation', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );

    await expect(
      resolveInvocationPolicyFragment(
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
      )
    ).rejects.toThrow(/lacks required proof/i);
  });

  it('accepts explicit known-attested literals for control args', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            sendEmail: {
              args: {
                recipient: {
                  eq: 'ada@example.com',
                  attestations: ['known']
                }
              }
            }
          }
        }
      },
      env
    );

    const clause = policy?.authorizations?.allow?.sendEmail;
    expect(clause?.kind).toBe('constrained');
    const recipientConstraint = clause?.kind === 'constrained'
      ? clause.args.recipient?.[0]
      : undefined;
    expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
    if (!recipientConstraint || !('eq' in recipientConstraint)) {
      return;
    }

    expect(recipientConstraint.eq).toBe('ada@example.com');
    expect(recipientConstraint.attestations).toEqual(['known']);
  });

  it('accepts bucketed known intent and strips audit-only source metadata', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          known: {
            sendEmail: {
              recipient: {
                value: 'ada@example.com',
                source: 'user asked to email Ada'
              }
            }
          }
        }
      },
      env
    );

    const clause = policy?.authorizations?.allow?.sendEmail;
    expect(clause?.kind).toBe('constrained');
    const recipientConstraint = clause?.kind === 'constrained'
      ? clause.args.recipient?.[0]
      : undefined;
    expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
    if (!recipientConstraint || !('eq' in recipientConstraint)) {
      return;
    }

    expect(recipientConstraint.eq).toBe('ada@example.com');
    expect(recipientConstraint.attestations).toEqual(['known']);
    expect(Object.prototype.hasOwnProperty.call(recipientConstraint, 'source')).toBe(false);
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

  it('resolves bare handle token authorization constraints to live values before normalization', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }')[0] as any,
      env
    );
    const liveValue = wrapStructured('ada@example.com', 'text', 'ada@example.com', {
      security: makeSecurityDescriptor({
        labels: ['known']
      })
    });
    const issued = env.issueHandle(liveValue);

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            sendEmail: {
              args: {
                recipient: issued.handle
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
    expect(recipientConstraint.eq).toBe(liveValue);
    expect(recipientConstraint.attestations).toEqual(['known']);
  });

  it('strips non-control args from with { policy } authorizations using executable controlArgs metadata', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @createCalendarEvent(participants, title, start_time) = `sent` with { controlArgs: ["participants"] }')[0] as any,
      env
    );

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            createCalendarEvent: {
              args: {
                participants: {
                  eq: ['ada@example.com'],
                  attestations: ['known']
                },
                title: 'Dinner at New Israeli Restaurant',
                start_time: '2026-09-26'
              }
            }
          }
        }
      },
      env
    );

    expect(policy?.authorizations).toEqual({
      allow: {
        createCalendarEvent: {
          kind: 'constrained',
          args: {
            participants: [{ eq: ['ada@example.com'], attestations: ['known'] }]
          }
        }
      }
    });
    expect(getInvocationPolicyFragmentCompileReport(policy)).toMatchObject({
      strippedArgs: [
        { tool: 'createCalendarEvent', arg: 'title' },
        { tool: 'createCalendarEvent', arg: 'start_time' }
      ],
      droppedEntries: [],
      ambiguousValues: [],
      compiledProofs: []
    });
  });

  it('keeps constrained-empty entries when data args strip away for tools with control args', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @createCalendarEvent(participants, title, start_time) = `sent` with { controlArgs: ["participants"] }')[0] as any,
      env
    );

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            createCalendarEvent: {
              args: {
                title: 'Dinner at New Israeli Restaurant',
                start_time: '2026-09-26'
              }
            }
          }
        }
      },
      env
    );

    expect(policy?.authorizations).toEqual({
      allow: {
        createCalendarEvent: {
          kind: 'constrained',
          args: {}
        }
      }
    });
  });

  it('strips non-control args using scoped tool collection metadata', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent`')[0] as any,
      env
    );
    env.setScopedEnvironmentConfig({
      tools: {
        send_email: {
          mlld: 'send_email',
          controlArgs: ['recipient']
        }
      }
    } as any);

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            send_email: {
              args: {
                recipient: {
                  eq: 'ada@example.com',
                  attestations: ['known']
                },
                subject: 'hello',
                body: 'details'
              }
            }
          }
        }
      },
      env
    );

    expect(policy?.authorizations).toEqual({
      allow: {
        send_email: {
          kind: 'constrained',
          args: {
            recipient: [{ eq: 'ada@example.com', attestations: ['known'] }]
          }
        }
      }
    });
  });

  it('normalizes stripped-all entries to true when scoped metadata declares no control args', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe tool:w @create_file(title, body) = `sent`')[0] as any,
      env
    );
    env.setScopedEnvironmentConfig({
      tools: {
        create_file: {
          mlld: 'create_file',
          controlArgs: []
        }
      }
    } as any);

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            create_file: {
              args: {
                title: 'Quarterly update'
              }
            }
          }
        }
      },
      env
    );

    expect(policy?.authorizations).toEqual({
      allow: {
        create_file: {
          kind: 'unconstrained'
        }
      }
    });
  });

  it('rejects bare literal authorization constraints for control args at runtime', async () => {
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
    env.issueHandle(contactEmail, {
      preview: 'a***@example.com',
      metadata: { field: 'email' }
    });

    await expect(
      resolveInvocationPolicyFragment(
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
      )
    ).rejects.toThrow(/lacks required proof/i);
  });

  it('rejects masked preview authorization constraints for control args at runtime', async () => {
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
    env.issueHandle(contactEmail, {
      preview: 'm***@example.com',
      metadata: { field: 'email' }
    });

    await expect(
      resolveInvocationPolicyFragment(
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
      )
    ).rejects.toThrow(/lacks required proof/i);
  });

  it('rejects proofless array control-arg entries at runtime', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipients, subject, body) = `sent` with { controlArgs: ["recipients"] }')[0] as any,
      env
    );

    await expect(
      resolveInvocationPolicyFragment(
        {
          authorizations: {
            allow: {
              sendEmail: {
                args: {
                  recipients: ['ada@example.com', 'grace@example.com']
                }
              }
            }
          }
        },
        env
      )
    ).rejects.toThrow(/lacks required proof/i);
  });

  it('preserves fact-bearing array leaves in variable-held policy fragments', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipients, subject, body) = `sent` with { controlArgs: ["recipients"] }')[0] as any,
      env
    );
    env.setVariable(
      'contactA',
      createObjectVariable(
        'contactA',
        {
          email: createFactEmailValue('alice@example.com', '@contact_a')
        },
        false,
        {
          directive: 'var',
          syntax: 'object',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );
    env.setVariable(
      'contactB',
      createObjectVariable(
        'contactB',
        {
          email: createFactEmailValue('bob@example.com', '@contact_b')
        },
        false,
        {
          directive: 'var',
          syntax: 'object',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    await evaluateDirective(
      parseSync('/var @taskPolicy = { authorizations: { allow: { sendEmail: { args: { recipients: [@contactA.email, @contactB.email] } } } } }')[0] as any,
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
    expect(Array.isArray(recipientsConstraint.eq)).toBe(true);
    const recipients = recipientsConstraint.eq as unknown[];
    expect(recipients).toHaveLength(2);
    expect(recipients.every(item => isStructuredValue(item))).toBe(true);
    expect(recipientsConstraint.attestations).toEqual(
      expect.arrayContaining(['fact:@contact_a.email', 'fact:@contact_b.email'])
    );
  });

  it('preserves fact-bearing array leaves through object-spread-built policy fragments', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipients, subject, body) = `sent` with { controlArgs: ["recipients"] }')[0] as any,
      env
    );
    env.setVariable(
      'contactA',
      createObjectVariable(
        'contactA',
        {
          email: createFactEmailValue('alice@example.com', '@contact_a')
        },
        false,
        {
          directive: 'var',
          syntax: 'object',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );
    env.setVariable(
      'contactB',
      createObjectVariable(
        'contactB',
        {
          email: createFactEmailValue('bob@example.com', '@contact_b')
        },
        false,
        {
          directive: 'var',
          syntax: 'object',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    await evaluateDirective(
      parseSync('/var @basePolicy = { authorizations: { allow: { sendEmail: { args: { recipients: [@contactA.email, @contactB.email] } } } } }')[0] as any,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { ...@basePolicy }')[0] as any,
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
    expect(Array.isArray(recipientsConstraint.eq)).toBe(true);
    const recipients = recipientsConstraint.eq as unknown[];
    expect(recipients).toHaveLength(2);
    expect(recipients.every(item => isStructuredValue(item))).toBe(true);
  });

  it('preserves fact-bearing array leaves without same-session fact-root lifting', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipients, subject, body) = `sent` with { controlArgs: ["recipients"] }')[0] as any,
      env
    );

    const weakLeaf = wrapStructured('alice@example.com', 'text', 'alice@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact_a.email']
      })
    });

    const policy = await resolveInvocationPolicyFragment(
      {
        authorizations: {
          allow: {
            sendEmail: {
              args: {
                recipients: [weakLeaf]
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
    expect(recipientsConstraint && 'eq' in recipientsConstraint).toBe(true);
    if (!recipientsConstraint || !('eq' in recipientsConstraint) || !Array.isArray(recipientsConstraint.eq)) {
      return;
    }

    const recipient = recipientsConstraint.eq[0];
    expect(isStructuredValue(recipient)).toBe(true);
    expect((recipient as any).mx.factsources).toBeUndefined();
    expect(getInvocationPolicyFragmentCompileReport(policy)).toMatchObject({
      compiledProofs: [
        {
          tool: 'sendEmail',
          arg: 'recipients',
          labels: ['fact:@contact_a.email']
        }
      ]
    });
  });
});
