import { describe, expect, it } from 'vitest';
import {
  evaluatePolicyAuthorizationDecision,
  mergePolicyAuthorizations,
  normalizePolicyAuthorizations,
  validatePolicyAuthorizations
} from './authorizations';

describe('policy authorizations', () => {
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

  it('fails validation when a tool with control args uses true or omits a required control arg', () => {
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
      ]
    ]);

    const validation = validatePolicyAuthorizations(
      {
        allow: {
          send_email: true,
          create_file: {}
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
    expect(validation.warnings.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['authorizations-empty-entry', 'authorizations-unconstrained-tool'])
    );
  });

  it('allows listed operations, enforces empty omitted control args, and denies unlisted tools', () => {
    const authorizations = normalizePolicyAuthorizations({
      allow: {
        send_email: {
          args: {
            recipients: ['alice@example.com'],
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
    ).toEqual({ decision: 'allow', matched: true });

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
});
