import { describe, expect, it } from 'vitest';
import {
  evaluatePolicyAuthorizationDecision,
  mergePolicyAuthorizations,
  normalizePolicyAuthorizations,
  validatePolicyAuthorizations
} from './authorizations';

describe('policy authorizations', () => {
  it('normalizes deny-only authorizations', () => {
    expect(
      normalizePolicyAuthorizations({
        deny: ['update_password', 'update_user_info']
      })
    ).toEqual({
      deny: ['update_password', 'update_user_info']
    });
  });

  it('intersects allowed tools and conjoins argument constraints on merge', () => {
    const base = normalizePolicyAuthorizations({
      allow: {
        send_email: {
          args: {
            recipients: ['alice@example.com'],
            cc: []
          }
        },
        create_file: true
      }
    });
    const incoming = normalizePolicyAuthorizations({
      allow: {
        send_email: {
          args: {
            bcc: []
          }
        },
        archive_file: true
      }
    });

    const merged = mergePolicyAuthorizations(base, incoming);

    expect(merged).toEqual({
      allow: {
        send_email: {
          kind: 'constrained',
          args: {
            recipients: [{ eq: ['alice@example.com'] }],
            cc: [{ eq: [] }],
            bcc: [{ eq: [] }]
          }
        }
      }
    });
  });

  it('preserves allow entries when only one side declares allow and unions deny lists', () => {
    const base = normalizePolicyAuthorizations({
      deny: ['update_password']
    });
    const incoming = normalizePolicyAuthorizations({
      allow: {
        send_email: {
          args: {
            recipients: ['alice@example.com']
          }
        }
      },
      deny: ['update_user_info']
    });

    expect(mergePolicyAuthorizations(base, incoming)).toEqual({
      allow: {
        send_email: {
          kind: 'constrained',
          args: {
            recipients: [{ eq: ['alice@example.com'] }]
          }
        }
      },
      deny: ['update_password', 'update_user_info']
    });
  });

  it('is idempotent for already-normalized authorization entries', () => {
    const normalized = normalizePolicyAuthorizations({
      allow: {
        send_email: {
          args: {
            recipients: ['alice@example.com'],
            cc: []
          }
        },
        create_file: true
      }
    });

    expect(normalized).toBeDefined();
    expect(normalizePolicyAuthorizations(normalized)).toEqual(normalized);
  });

  it('fails validation when a tool with effective control args uses true', () => {
    const toolContext = new Map([
      [
        'send_email',
        {
          name: 'send_email',
          params: new Set(['recipients', 'cc', 'bcc', 'subject']),
          controlArgs: new Set(['recipients', 'cc', 'bcc']),
          hasControlArgsMetadata: true
        }
      ],
      [
        'create_file',
        {
          name: 'create_file',
          params: new Set(['title']),
          controlArgs: new Set<string>(),
          hasControlArgsMetadata: true
        }
      ],
      [
        'send_money',
        {
          name: 'send_money',
          params: new Set(['recipient', 'amount']),
          controlArgs: new Set<string>(),
          hasControlArgsMetadata: false
        }
      ]
    ]);

    const validation = validatePolicyAuthorizations(
      {
        allow: {
          send_email: true,
          create_file: {},
          send_money: true
        }
      },
      toolContext,
      {
        requireKnownTools: true,
        requireControlArgsMetadata: true
      }
    );

    expect(validation.errors.map(issue => issue.code)).toContain(
      'authorizations-unconstrained-control-args'
    );
    expect(validation.errors.map(issue => issue.message).join('\n')).toContain(
      "send_money"
    );
    expect(validation.warnings.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['authorizations-empty-entry', 'authorizations-unconstrained-tool'])
    );
  });

  it('fails validation when an allowed tool is denied by policy', () => {
    const toolContext = new Map([
      [
        'send_email',
        {
          name: 'send_email',
          params: new Set(['recipients']),
          controlArgs: new Set(['recipients']),
          hasControlArgsMetadata: true
        }
      ]
    ]);

    const validation = validatePolicyAuthorizations(
      {
        allow: {
          send_email: {
            args: {
              recipients: ['alice@example.com']
            }
          }
        }
      },
      toolContext,
      {
        requireKnownTools: true,
        requireControlArgsMetadata: true,
        deniedTools: ['send_email']
      }
    );

    expect(validation.errors.map(issue => issue.code)).toContain('authorizations-denied-tool');
  });

  it('fails closed by treating all params as control args when metadata is absent', () => {
    const toolContext = new Map([
      [
        'send_money',
        {
          name: 'send_money',
          params: new Set(['recipient', 'amount']),
          controlArgs: new Set<string>(),
          hasControlArgsMetadata: false
        }
      ]
    ]);

    const authorizations = normalizePolicyAuthorizations(
      {
        allow: {
          send_money: {
            args: {
              recipient: 'acct-1'
            }
          }
        }
      },
      undefined,
      toolContext
    );
    if (!authorizations) {
      throw new Error('Expected normalized authorizations');
    }

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'send_money',
        args: {
          recipient: 'acct-1'
        },
        controlArgs: ['recipient', 'amount']
      })
    ).toEqual({ decision: 'allow', matched: true });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'send_money',
        args: {
          recipient: 'acct-1',
          amount: 100
        },
        controlArgs: ['recipient', 'amount']
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'args_mismatch'
    });
  });

  it('strips non-control args when trusted control arg metadata is available', () => {
    const toolContext = new Map([
      [
        'create_calendar_event',
        {
          name: 'create_calendar_event',
          params: new Set(['participants', 'title', 'start_time', 'location']),
          controlArgs: new Set(['participants']),
          hasControlArgsMetadata: true
        }
      ]
    ]);

    const authorizations = normalizePolicyAuthorizations(
      {
        allow: {
          create_calendar_event: {
            args: {
              participants: ['ada@example.com'],
              title: 'Dinner at New Israeli Restaurant',
              start_time: '2026-09-26',
              location: '123 Rue de Rivoli'
            }
          }
        }
      },
      undefined,
      toolContext
    );

    expect(authorizations).toEqual({
      allow: {
        create_calendar_event: {
          kind: 'constrained',
          args: {
            participants: [{ eq: ['ada@example.com'] }]
          }
        }
      }
    });
  });

  it('preserves constrained-empty entries after stripping data args for tools with control args', () => {
    const toolContext = new Map([
      [
        'create_calendar_event',
        {
          name: 'create_calendar_event',
          params: new Set(['participants', 'title', 'start_time']),
          controlArgs: new Set(['participants']),
          hasControlArgsMetadata: true
        }
      ]
    ]);

    const authorizations = normalizePolicyAuthorizations(
      {
        allow: {
          create_calendar_event: {
            args: {
              title: 'Dinner at New Israeli Restaurant',
              start_time: '2026-09-26'
            }
          }
        }
      },
      undefined,
      toolContext
    );
    if (!authorizations) {
      throw new Error('Expected normalized authorizations');
    }

    expect(authorizations).toEqual({
      allow: {
        create_calendar_event: {
          kind: 'constrained',
          args: {}
        }
      }
    });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'create_calendar_event',
        args: {
          participants: []
        },
        controlArgs: ['participants']
      })
    ).toEqual({ decision: 'allow', matched: true });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'create_calendar_event',
        args: {
          participants: ['ada@example.com']
        },
        controlArgs: ['participants']
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'args_mismatch'
    });
  });

  it('normalizes stripped-all entries to true when metadata declares no control args', () => {
    const toolContext = new Map([
      [
        'create_file',
        {
          name: 'create_file',
          params: new Set(['title', 'body']),
          controlArgs: new Set<string>(),
          hasControlArgsMetadata: true
        }
      ]
    ]);

    const authorizations = normalizePolicyAuthorizations(
      {
        allow: {
          create_file: {
            args: {
              title: 'Quarterly update'
            }
          }
        }
      },
      undefined,
      toolContext
    );

    expect(authorizations).toEqual({
      allow: {
        create_file: {
          kind: 'unconstrained'
        }
      }
    });
  });

  it('allows listed operations, enforces empty omitted control args, and denies unlisted tools', () => {
    const authorizations = normalizePolicyAuthorizations({
      allow: {
        send_email: {
          args: {
            recipients: {
              eq: ['alice@example.com'],
              attestations: ['known']
            },
            cc: []
          }
        }
      }
    });
    if (!authorizations) {
      throw new Error('Expected normalized authorizations');
    }

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'send_email',
        args: {
          recipients: ['alice@example.com'],
          cc: [],
          bcc: []
        },
        controlArgs: ['recipients', 'cc', 'bcc']
      })
    ).toEqual({
      decision: 'allow',
      matched: true,
      matchedAttestations: {
        recipients: ['known']
      }
    });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'send_email',
        args: {
          recipients: ['alice@example.com'],
          cc: [],
          bcc: ['other@example.com']
        },
        controlArgs: ['recipients', 'cc', 'bcc']
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'args_mismatch'
    });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'archive_email',
        args: {},
        controlArgs: []
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'unlisted'
    });
  });

  it('treats all params as effective control args when runtime metadata is absent', () => {
    const authorizations = normalizePolicyAuthorizations({
      allow: {
        send_money: {
          args: {
            recipient: 'acct-1',
            amount: 100
          }
        }
      }
    });
    if (!authorizations) {
      throw new Error('Expected normalized authorizations');
    }

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'send_money',
        args: {
          recipient: 'acct-1',
          amount: 100
        },
        controlArgs: ['recipient', 'amount']
      })
    ).toEqual({ decision: 'allow', matched: true });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'send_money',
        args: {
          recipient: 'acct-1',
          amount: 200
        },
        controlArgs: ['recipient', 'amount']
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'args_mismatch'
    });
  });

  it('tracks matched attestation requirements for oneOf candidates', () => {
    const authorizations = normalizePolicyAuthorizations({
      allow: {
        send_email: {
          args: {
            recipients: {
              oneOf: [['alice@example.com'], ['ops@example.com']],
              oneOfAttestations: [['known'], ['known:internal']]
            }
          }
        }
      }
    });
    if (!authorizations) {
      throw new Error('Expected normalized authorizations');
    }

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations,
        operationName: 'send_email',
        args: {
          recipients: ['ops@example.com']
        },
        controlArgs: ['recipients']
      })
    ).toEqual({
      decision: 'allow',
      matched: true,
      matchedAttestations: {
        recipients: ['known:internal']
      }
    });
  });
});
