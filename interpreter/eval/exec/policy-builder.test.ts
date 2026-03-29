import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
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
});
