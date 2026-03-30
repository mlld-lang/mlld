import { describe, expect, it } from 'vitest';
import { createHandleWrapper } from '@core/types/handle';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { compilePolicyAuthorizations } from '@interpreter/policy/authorization-compiler';
import { buildAuthorizationToolContextForCollection } from '@interpreter/eval/exec/tool-metadata';
import type { ToolCollection } from '@core/types/tools';
import { createSimpleTextVariable, createStructuredValueVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { wrapStructured } from '@interpreter/utils/structured-value';
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

function createKnownStructuredText(value: string) {
  return wrapStructured(value, 'text', value, {
    security: makeSecurityDescriptor({
      attestations: ['known']
    })
  });
}

async function interpretWithEnvAndFiles(
  source: string,
  files: Record<string, string>
): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | null = null;

  for (const [filePath, content] of Object.entries(files)) {
    await fileSystem.writeFile(filePath, content);
  }

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

async function extractBuiltinResult(env: Environment, name: string) {
  const variable = env.getVariable(name);
  const resolved = await extractVariableValue(variable as any, env) as any;
  return resolved?.data ?? resolved;
}

async function invokePolicyBuiltin(
  env: Environment,
  method: 'build' | 'validate',
  intent: unknown,
  tools: unknown
) {
  const policyVar = env.getVariable('policy') as any;
  const executable = policyVar?.value?.[method];
  const fn = executable?.internal?.executableDef?.fn;
  if (typeof fn !== 'function') {
    throw new Error(`Expected @policy.${method} builtin`);
  }
  return fn(intent, tools, env);
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

  it('returns compiler reports from build and validate as additive diagnostics', async () => {
    const env = await interpretWithEnv(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @getContact() = { email: "ada@example.com", name: "Ada" } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /var @contact = @getContact()
      /var @contactEmail = @contact.email
    `);

    const contactEmail = await extractVariableValue(env.getVariable('contactEmail') as any, env);
    const issued = env.issueHandle(contactEmail);
    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;
    const intent = {
      sendEmail: {
        recipient: issued.handle,
        subject: 'hello'
      }
    };

    const built = await invokePolicyBuiltin(env, 'build', intent, writeTools) as any;
    const validated = await invokePolicyBuiltin(env, 'validate', intent, writeTools) as any;

    for (const result of [built, validated]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      const sendEmail = result.policy.authorizations.allow.sendEmail;
      expect(sendEmail?.kind).toBe('constrained');
      const recipientConstraint =
        sendEmail?.kind === 'constrained'
          ? sendEmail.args.recipient?.[0]
          : undefined;
      expect(recipientConstraint && 'eq' in recipientConstraint).toBe(true);
      if (!recipientConstraint || !('eq' in recipientConstraint)) {
        continue;
      }

      expect((recipientConstraint.eq as any)?.data ?? recipientConstraint.eq).toBe('ada@example.com');
      expect(recipientConstraint.attestations).toEqual(['fact:@contact.email']);
      expect(result.report).toMatchObject({
        strippedArgs: [{ tool: 'sendEmail', arg: 'subject' }],
        repairedArgs: [{ tool: 'sendEmail', arg: 'recipient', steps: ['resolved_handle'] }],
        compiledProofs: [{ tool: 'sendEmail', arg: 'recipient', labels: ['fact:@contact.email'] }]
      });
    }
  });

  it('accepts imported tool collections without importing the underlying executables', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @intent = {
          sendEmail: {
            recipient: { eq: "ada@example.com", attestations: ["known"] }
          }
        }

        /var @built = @policy.build(@intent, @writeTools)
      `,
      {
        '/tool-module.mld': `
          /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

          /var tools @writeTools = {
            sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
          }

          /export { @writeTools }
        `
      }
    );

    expect(env.getVariable('sendEmail')).toBeUndefined();

    const builtVar = env.getVariable('built');
    const builtResolved = await extractVariableValue(builtVar as any, env) as any;
    const built = builtResolved?.data ?? builtResolved;

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
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
  });

  it('validates imported tool collections without importing the underlying executables', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @intent = {
          sendEmail: {
            recipient: { eq: "ada@example.com", attestations: ["known"] }
          }
        }

        /var @validated = @policy.validate(@intent, @writeTools)
      `,
      {
        '/tool-module.mld': `
          /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

          /var tools @writeTools = {
            sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
          }

          /export { @writeTools }
        `
      }
    );

    expect(env.getVariable('sendEmail')).toBeUndefined();

    const validated = await extractBuiltinResult(env, 'validated');

    expect(validated.valid).toBe(true);
    expect(validated.issues).toEqual([]);
    expect(validated.report).toEqual({
      strippedArgs: [],
      repairedArgs: [],
      droppedEntries: [],
      droppedArrayElements: [],
      ambiguousValues: [],
      compiledProofs: []
    });
    expect(validated.policy.authorizations.allow.sendEmail).toEqual({
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
  });

  it('preserves shaped auth params for imported tool collections', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @intent = {
          sendEmail: {
            recipient: { eq: "ada@example.com", attestations: ["known"] },
            subject: "hello"
          }
        }

        /var @built = @policy.build(@intent, @writeTools)
      `,
      {
        '/tool-module.mld': `
          /exe exfil:send, tool:w @sendEmail(owner, repo, recipient, subject, body) = js { return recipient; } with { controlArgs: ["owner", "recipient"] }

          /var tools @writeTools = {
            sendEmail: {
              mlld: @sendEmail,
              bind: { owner: "mlld", repo: "main", body: "fixed" },
              expose: ["recipient", "subject"],
              controlArgs: ["recipient"]
            }
          }

          /export { @writeTools }
        `
      }
    );

    const importedCollection = env.getVariable('writeTools')?.value as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, importedCollection);
    const sendEmailContext = toolContext.get('sendEmail');

    expect(sendEmailContext).toBeDefined();
    expect([...sendEmailContext!.params]).toEqual(['recipient', 'subject']);
    expect([...sendEmailContext!.controlArgs]).toEqual(['recipient']);
    expect(sendEmailContext!.hasControlArgsMetadata).toBe(true);

    const builtVar = env.getVariable('built');
    const builtResolved = await extractVariableValue(builtVar as any, env) as any;
    const built = builtResolved?.data ?? builtResolved;

    expect(built.valid).toBe(true);
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
  });

  it('preserves shaped auth params for imported tool collections during validation', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @intent = {
          sendEmail: {
            recipient: { eq: "ada@example.com", attestations: ["known"] },
            subject: "hello"
          }
        }

        /var @validated = @policy.validate(@intent, @writeTools)
      `,
      {
        '/tool-module.mld': `
          /exe exfil:send, tool:w @sendEmail(owner, repo, recipient, subject, body) = js { return recipient; } with { controlArgs: ["owner", "recipient"] }

          /var tools @writeTools = {
            sendEmail: {
              mlld: @sendEmail,
              bind: { owner: "mlld", repo: "main", body: "fixed" },
              expose: ["recipient", "subject"],
              controlArgs: ["recipient"]
            }
          }

          /export { @writeTools }
        `
      }
    );

    const validated = await extractBuiltinResult(env, 'validated');

    expect(validated.valid).toBe(true);
    expect(validated.issues).toEqual([]);
    expect(validated.report).toMatchObject({
      strippedArgs: [{ tool: 'sendEmail', arg: 'subject' }]
    });
    expect(validated.policy.authorizations.allow.sendEmail).toEqual({
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
  });

  it('preserves explicit empty control-arg metadata for imported tool collections', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @intent = {
          createDraft: true
        }

        /var @built = @policy.build(@intent, @writeTools)
      `,
      {
        '/tool-module.mld': `
          /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: ["subject"] }

          /var tools @writeTools = {
            createDraft: {
              mlld: @createDraft,
              expose: ["subject", "body"],
              controlArgs: []
            }
          }

          /export { @writeTools }
        `
      }
    );

    const importedCollection = env.getVariable('writeTools')?.value as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, importedCollection);
    const createDraftContext = toolContext.get('createDraft');

    expect(createDraftContext).toBeDefined();
    expect([...createDraftContext!.params]).toEqual(['subject', 'body']);
    expect([...createDraftContext!.controlArgs]).toEqual([]);
    expect(createDraftContext!.hasControlArgsMetadata).toBe(true);

    const builtVar = env.getVariable('built');
    const builtResolved = await extractVariableValue(builtVar as any, env) as any;
    const built = builtResolved?.data ?? builtResolved;

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.createDraft).toEqual({
      kind: 'unconstrained'
    });
  });

  it('preserves explicit empty control-arg metadata for imported tool collections during validation', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @intent = {
          createDraft: true
        }

        /var @validated = @policy.validate(@intent, @writeTools)
      `,
      {
        '/tool-module.mld': `
          /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: ["subject"] }

          /var tools @writeTools = {
            createDraft: {
              mlld: @createDraft,
              expose: ["subject", "body"],
              controlArgs: []
            }
          }

          /export { @writeTools }
        `
      }
    );

    const validated = await extractBuiltinResult(env, 'validated');

    expect(validated.valid).toBe(true);
    expect(validated.issues).toEqual([]);
    expect(validated.report).toEqual({
      strippedArgs: [],
      repairedArgs: [],
      droppedEntries: [],
      droppedArrayElements: [],
      ambiguousValues: [],
      compiledProofs: []
    });
    expect(validated.policy.authorizations.allow.createDraft).toEqual({
      kind: 'unconstrained'
    });
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
    const issued = env.issueHandle(contactEmail);
    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        resolved: {
          sendEmail: {
            recipient: issued.handle
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
            recipient: issued.handle
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

  it('accepts handle wrapper values in the resolved bucket', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);
    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        resolved: {
          sendEmail: {
            recipient: createHandleWrapper(issued.handle)
          }
        }
      },
      rawSource: {
        resolved: {
          sendEmail: {
            recipient: createHandleWrapper(issued.handle)
          }
        }
      },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([]);
    expect(compilation.authorizations?.allow.sendEmail).toEqual({
      kind: 'constrained',
      args: {
        recipient: [
          {
            eq: approvedRecipient,
            attestations: ['known']
          }
        ]
      }
    });
  });

  it('accepts StructuredValue handle strings in resolved planner intent', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);
    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;
    const plannerIntent = {
      resolved: {
        sendEmail: {
          recipient: wrapStructured(issued.handle, 'text', issued.handle)
        }
      }
    };

    const built = await invokePolicyBuiltin(env, 'build', plannerIntent, writeTools) as any;

    expect(built.valid).toBe(true);
    expect(built.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'proofless_resolved_value',
          tool: 'sendEmail',
          arg: 'recipient'
        })
      ])
    );
    expect(built.policy.authorizations.allow.sendEmail).toEqual({
      kind: 'constrained',
      args: {
        recipient: [
          {
            eq: approvedRecipient,
            attestations: ['known']
          }
        ]
      }
    });
  });

  it('accepts StructuredValue handle wrappers in resolved planner intent', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);
    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;
    const plannerIntent = {
      resolved: {
        sendEmail: {
          recipient: [
            {
              handle: wrapStructured(issued.handle, 'text', issued.handle)
            }
          ]
        }
      }
    };

    const built = await invokePolicyBuiltin(env, 'build', plannerIntent, writeTools) as any;

    expect(built.valid).toBe(true);
    expect(built.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'proofless_resolved_value',
          tool: 'sendEmail',
          arg: 'recipient'
        })
      ])
    );
    expect(built.policy.authorizations.allow.sendEmail).toEqual({
      kind: 'constrained',
      args: {
        recipient: [
          {
            eq: [approvedRecipient],
            attestations: ['known']
          }
        ]
      }
    });
  });

  it('rejects bare literal strings in the resolved bucket as proofless values', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        resolved: {
          sendEmail: {
            recipient: 'ada@example.com'
          }
        }
      },
      rawSource: {
        resolved: {
          sendEmail: {
            recipient: 'ada@example.com'
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
          reason: 'proofless_resolved_value',
          tool: 'sendEmail',
          arg: 'recipient'
        })
      ])
    );
    expect(compilation.authorizations?.allow).toEqual({});
  });

  it('drops proofless resolved array elements individually and preserves handle-backed elements', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipients, subject, body) = js { return recipients; } with { controlArgs: ["recipients"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipients", "subject", "body"], controlArgs: ["recipients"] }
      }
    `);

    const recipientA = createKnownStructuredText('alice@example.com');
    const recipientB = createKnownStructuredText('bob@example.com');
    const handleA = env.issueHandle(recipientA);
    const handleB = env.issueHandle(recipientB);
    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        resolved: {
          sendEmail: {
            recipients: [handleA.handle, 'mask@example.com', createHandleWrapper(handleB.handle)]
          }
        }
      },
      rawSource: {
        resolved: {
          sendEmail: {
            recipients: [handleA.handle, 'mask@example.com', createHandleWrapper(handleB.handle)]
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
          reason: 'proofless_resolved_value',
          tool: 'sendEmail',
          arg: 'recipients',
          element: 1
        })
      ])
    );

    const entry = compilation.authorizations?.allow.sendEmail;
    expect(entry?.kind).toBe('constrained');
    const recipientsConstraint = entry?.kind === 'constrained'
      ? entry.args.recipients?.[0]
      : undefined;
    expect(recipientsConstraint && 'eq' in recipientsConstraint).toBe(true);
    if (!recipientsConstraint || !('eq' in recipientsConstraint) || !Array.isArray(recipientsConstraint.eq)) {
      return;
    }

    expect(recipientsConstraint.eq).toEqual([recipientA, recipientB]);
    expect(recipientsConstraint.attestations).toEqual(['known']);
  });

  it('accepts explicit empty arrays in the resolved bucket', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createCalendarEvent(participants, title, start_time) = js { return title; } with { controlArgs: ["participants"] }

      /var tools @writeTools = {
        createCalendarEvent: {
          mlld: @createCalendarEvent,
          expose: ["participants", "title", "start_time"],
          controlArgs: ["participants"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        resolved: {
          createCalendarEvent: {
            participants: []
          }
        }
      },
      rawSource: {
        resolved: {
          createCalendarEvent: {
            participants: []
          }
        }
      },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([]);
    expect(compilation.authorizations?.allow.createCalendarEvent).toEqual({
      kind: 'constrained',
      args: {
        participants: [
          {
            eq: []
          }
        ]
      }
    });
  });

  it('rejects bucketed intent from influenced sources even when resolved handles and allow tools are otherwise valid', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }
      /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: [] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] },
        createDraft: { mlld: @createDraft, expose: ["subject", "body"], controlArgs: [] }
      }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);
    const influencedSource = wrapStructured(
      {
        resolved: {
          sendEmail: {
            recipient: issued.handle
          }
        },
        allow: ['createDraft']
      },
      'object',
      JSON.stringify({
        resolved: {
          sendEmail: {
            recipient: issued.handle
          }
        },
        allow: ['createDraft']
      }),
      {
        security: makeSecurityDescriptor({
          labels: ['influenced']
        })
      }
    );
    env.setVariable(
      'plannerIntent',
      createStructuredValueVariable(
        'plannerIntent',
        influencedSource,
        {
          directive: 'var',
          syntax: 'object',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        resolved: {
          sendEmail: {
            recipient: issued.handle
          }
        },
        allow: ['createDraft']
      },
      rawSource: env.getVariable('plannerIntent'),
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([
      expect.objectContaining({
        reason: 'bucketed_intent_from_influenced_source'
      })
    ]);
    expect(compilation.authorizations).toBeUndefined();
  });

  it('rejects known-bucket intent from influenced sources before minting proof', async () => {
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
      [
        expect.objectContaining({
          reason: 'bucketed_intent_from_influenced_source'
        })
      ]
    );
    expect(compilation.authorizations).toBeUndefined();
  });
});
