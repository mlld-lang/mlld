import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { compilePolicyAuthorizations } from '@interpreter/policy/authorization-compiler';
import { buildAuthorizationToolContextForCollection } from '@interpreter/eval/exec/tool-metadata';
import type { ToolCollection } from '@core/types/tools';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/module.mld.md'
} as const;

async function interpretWithEnv(source: string): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | null = null;

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

describe('@policy builtin', () => {
  it('builds canonical allow fragments, strips data args, and drops denied tools', async () => {
    const env = await interpretWithEnv(`
      /policy @denyPolicy = {
        authorizations: {
          deny: ["updatePassword"]
        }
      }

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }
      /exe destructive, tool:w @updatePassword(userId, password) = js { return userId; } with { controlArgs: ["userId"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] },
        updatePassword: { mlld: @updatePassword, expose: ["userId", "password"], controlArgs: ["userId"] }
      }

      /var @intent = {
        sendEmail: {
          recipient: { eq: "ada@example.com", attestations: ["known"] },
          subject: "hello"
        },
        updatePassword: {
          userId: { eq: "user-1", attestations: ["known"] }
        }
      }

      /var @built = @policy.build(@intent, @writeTools)
    `);

    const builtVar = env.getVariable('built');
    const builtResolved = await extractVariableValue(builtVar as any, env) as any;
    const built = builtResolved?.data ?? builtResolved;

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'denied_by_policy',
          tool: 'updatePassword'
        })
      ])
    );
    expect(built.policy.authorizations.allow.sendEmail).toEqual({
      kind: 'constrained',
      args: {
        recipient: [
          {
            eq: 'ada@example.com',
            attestations: ['known']
          }
        ]
      }
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        built.policy.authorizations.allow.sendEmail.args,
        'subject'
      )
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        built.policy.authorizations.allow,
        'updatePassword'
      )
    ).toBe(false);
  });

  it('reports proofless control args and emits an empty allow fragment for that tool', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /var @intent = {
        sendEmail: {
          recipient: "ada@example.com"
        }
      }

      /var @built = @policy.build(@intent, @writeTools)
    `);

    const builtVar = env.getVariable('built');
    const builtResolved = await extractVariableValue(builtVar as any, env) as any;
    const built = builtResolved?.data ?? builtResolved;

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'proofless_control_arg',
          tool: 'sendEmail',
          arg: 'recipient'
        })
      ])
    );
    expect(built.policy.authorizations.allow).toEqual({});
  });

  it('builds bucketed intent, prefers resolved entries, and preserves unconstrained allow tools', async () => {
    const env = await interpretWithEnv(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @getContact() = { email: "ada@example.com", name: "Ada" } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }
      /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: [] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] },
        createDraft: { mlld: @createDraft, expose: ["subject", "body"], controlArgs: [] }
      }

      /var @contact = @getContact()
      /var @contactEmail = @contact.email
    `);

    const contactEmail = await extractVariableValue(env.getVariable('contactEmail') as any, env);
    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        resolved: {
          sendEmail: {
            recipient: contactEmail
          }
        },
        known: {
          sendEmail: {
            recipient: {
              value: 'ignored@example.com',
              source: 'user asked for a different email'
            }
          }
        },
        allow: ['createDraft']
      },
      rawSource: {
        resolved: {
          sendEmail: {
            recipient: contactEmail
          }
        },
        known: {
          sendEmail: {
            recipient: {
              value: 'ignored@example.com',
              source: 'user asked for a different email'
            }
          }
        },
        allow: ['createDraft']
      },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'superseded_by_resolved',
          tool: 'sendEmail',
          arg: 'recipient'
        })
      ])
    );
    expect(compilation.authorizations?.allow?.createDraft).toEqual({
      kind: 'unconstrained'
    });

    const sendEmailEntry = compilation.authorizations?.allow?.sendEmail;
    expect(sendEmailEntry?.kind).toBe('constrained');
    const recipientConstraint = sendEmailEntry?.kind === 'constrained'
      ? sendEmailEntry.args.recipient[0]
      : undefined;
    expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
    if (!recipientConstraint || !('eq' in recipientConstraint)) {
      return;
    }

    expect((recipientConstraint.eq as any)?.data ?? recipientConstraint.eq).toBe('ada@example.com');
    expect(recipientConstraint.attestations).toEqual(['fact:@contact.email']);
    expect(Object.prototype.hasOwnProperty.call(recipientConstraint, 'source')).toBe(false);
  });

  it('drops known bucket entries that try to mint proof from influenced inputs', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    env.setVariable(
      'plannerRecipient',
      createSimpleTextVariable(
        'plannerRecipient',
        'ada@example.com',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({
            labels: ['influenced']
          })
        }
      )
    );

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        known: {
          sendEmail: {
            recipient: {
              value: env.getVariable('plannerRecipient'),
              source: 'planner summary'
            }
          }
        }
      },
      rawSource: {
        known: {
          sendEmail: {
            recipient: {
              value: env.getVariable('plannerRecipient'),
              source: 'planner summary'
            }
          }
        }
      },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'known_from_influenced_source',
          tool: 'sendEmail',
          arg: 'recipient'
        })
      ])
    );
    expect(compilation.authorizations?.allow).toEqual({});
  });
});
