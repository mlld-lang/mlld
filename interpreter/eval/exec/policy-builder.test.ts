import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { ExecInvocation } from '@core/types';
import { createHandleWrapper } from '@core/types/handle';
import { evaluatePolicyAuthorizationDecision } from '@core/policy/authorizations';
import { normalizePolicyConfig } from '@core/policy/union';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
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
  tools: unknown,
  options?: unknown
) {
  const policyVar = env.getVariable('policy') as any;
  const executable = policyVar?.value?.[method];
  const fn = executable?.internal?.executableDef?.fn;
  if (typeof fn !== 'function') {
    throw new Error(`Expected @policy.${method} builtin`);
  }
  if (arguments.length >= 5) {
    return fn(intent, tools, options, env);
  }
  return fn(intent, tools, env);
}

async function evaluateSourceInEnv(env: Environment, source: string): Promise<void> {
  for (const directive of (parseSync(source) as any[]).filter(
    node => node && typeof node === 'object' && node.type === 'Directive'
  )) {
    await evaluateDirective(directive, env);
  }
}

function expectResolvedRecipientAuthorization(result: any, approvedRecipient: unknown): void {
  expect(result.valid).toBe(true);
  expect(result.issues).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        reason: 'proofless_resolved_value',
        tool: 'sendEmail',
        arg: 'recipient'
      })
    ])
  );
  expect(result.policy.authorizations.allow.sendEmail).toEqual({
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

  it('rejects tools outside the active role can_authorize set before compilation', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @send_email(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }
      /exe tool:w @delete_file(id) = js { return id; } with { controlArgs: ["id"] }

      /var tools @writeTools = {
        send_email: { mlld: @send_email, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] },
        delete_file: { mlld: @delete_file, expose: ["id"], controlArgs: ["id"] }
      }
    `);

    env.setPolicySummary(
      normalizePolicyConfig({
        authorizations: {
          can_authorize: {
            'role:planner': ['send_email']
          }
        } as any
      })!
    );
    env.setLlmToolConfig({
      sessionId: 'planner-session',
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: [],
      authorizationRole: 'role:planner',
      inBox: false,
      cleanup: async () => {}
    });

    const built = await invokePolicyBuiltin(
      env,
      'build',
      { allow: ['delete_file'] },
      env.getVariable('writeTools')?.value
    ) as any;

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'invalid_authorization',
          tool: 'delete_file',
          message: "Role 'role:planner' cannot authorize tool 'delete_file'"
        })
      ])
    );
    expect(built.policy.can_authorize).toBeUndefined();
  });

  it('derives role can_authorize defaults from catalog entries', async () => {
    const env = await interpretWithEnv(`
      /record @send_email_inputs = {
        facts: [recipient: string],
        data: [subject: string, body: string],
        validate: "strict"
      }

      /exe tool:w @send_email(recipient, subject, body) = js { return recipient; }

      /var tools @writeTools = {
        send_email: {
          mlld: @send_email,
          inputs: @send_email_inputs,
          labels: ["execute:w", "exfil:send", "comm:w"],
          can_authorize: "role:planner"
        }
      }
    `);

    env.setLlmToolConfig({
      sessionId: 'planner-session',
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: [],
      authorizationRole: 'role:planner',
      inBox: false,
      cleanup: async () => {}
    });

    const built = await invokePolicyBuiltin(
      env,
      'build',
      {
        send_email: {
          recipient: { eq: 'ada@example.com', attestations: ['known'] }
        }
      },
      env.getVariable('writeTools')?.value
    ) as any;

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.can_authorize).toBeUndefined();
    expect(built.policy.authorizations.allow.send_email).toEqual({
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

  it('treats catalog can_authorize false as a deny default', async () => {
    const env = await interpretWithEnv(`
      /record @delete_file_inputs = {
        facts: [id: string],
        validate: "strict"
      }

      /exe tool:w @delete_file(id) = js { return id; }

      /var tools @writeTools = {
        delete_file: {
          mlld: @delete_file,
          inputs: @delete_file_inputs,
          labels: ["execute:w", "destructive:targeted"],
          can_authorize: false
        }
      }
    `);

    const built = await invokePolicyBuiltin(
      env,
      'build',
      { allow: ['delete_file'] },
      env.getVariable('writeTools')?.value
    ) as any;

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'denied_by_policy',
          tool: 'delete_file'
        })
      ])
    );
    expect(built.policy.can_authorize).toBeUndefined();
    expect(built.policy.authorizations.allow).toEqual({});
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
          code: 'proofless_control_arg',
          phase: 'build',
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
      compiledProofs: [],
      autoAllowedTools: []
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

  it('accepts imported tool collections threaded through object fields for build and validate', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @config = { writeTools: @writeTools }
        /var @intent = {
          update_item: true
        }

        /var @built = @policy.build(@intent, @config.writeTools)
        /var @validated = @policy.validate(@intent, @config.writeTools)
      `,
      {
        '/tool-module.mld': `
          /exe tool:w @update_item(id, amount, subject) = js { return id; } with { controlArgs: [] }

          /var tools @writeTools = {
            update_item: { mlld: @update_item }
          }

          /export { @writeTools }
        `
      }
    );

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');
    for (const result of [built, validated]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.policy.authorizations.allow.update_item).toEqual({
        kind: 'unconstrained'
      });
    }
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

  it('derives empty control-arg metadata from no-fact input records for imported tool collections', async () => {
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
          /record @createDraftInputs = {
            data: [subject: string, body: string],
            validate: "strict"
          }

          /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: ["subject"] }

          /var tools @writeTools = {
            createDraft: {
              mlld: @createDraft,
              inputs: @createDraftInputs
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

  it('derives empty control-arg metadata from no-fact input records for imported tool collections during validation', async () => {
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
          /record @createDraftInputs = {
            data: [subject: string, body: string],
            validate: "strict"
          }

          /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: ["subject"] }

          /var tools @writeTools = {
            createDraft: {
              mlld: @createDraft,
              inputs: @createDraftInputs
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
      compiledProofs: [],
      autoAllowedTools: []
    });
    expect(validated.policy.authorizations.allow.createDraft).toEqual({
      kind: 'unconstrained'
    });
  });

  it('returns a dispatch-ready policy for allow-only writes without manual reconstruction', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: [] }

      /var tools @writeTools = {
        createDraft: {
          mlld: @createDraft,
          expose: ["subject", "body"],
          controlArgs: []
        }
      }
    `);

    env.setPolicySummary({
      defaults: { rules: ['no-untrusted-destructive'] },
      operations: { destructive: ['tool:w:deleteDraft'] },
      authorizations: { deny: ['deleteDraft'] }
    });

    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;
    const built = await invokePolicyBuiltin(env, 'build', { allow: ['createDraft'] }, writeTools) as any;

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.defaults).toEqual({
      rules: ['no-untrusted-destructive']
    });
    expect(built.policy.operations).toEqual({
      destructive: ['tool:w:deleteDraft']
    });
    expect(built.policy.authorizations.deny).toEqual(['deleteDraft']);
    expect(built.policy.authorizations.allow.createDraft).toEqual({
      kind: 'tool'
    });
  });

  it('returns a direct-exe dispatch-ready policy for allow-list tools with no input-record control args', async () => {
    const env = await interpretWithEnv(`
      /record @create_note_inputs = {
        facts: [],
        data: [content: string],
        validate: "strict"
      }

      /exe tool:w @create_note(content) = \`@content\`

      /var tools @writeTools = {
        create_note: {
          mlld: @create_note,
          inputs: @create_note_inputs,
          labels: ["tool:w"]
        }
      }

      /var @built = @policy.build({ allow: ["create_note"] }, @writeTools)
      /var @result = @create_note("hello") with { policy: @built.policy }
    `);

    const built = await extractBuiltinResult(env, 'built');
    const result = await extractBuiltinResult(env, 'result');

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.create_note).toEqual({
      kind: 'tool'
    });
    expect(result).toBe('hello');
  });

  it('accepts allow-list tools when input-record control args are optional and omitted', async () => {
    const env = await interpretWithEnv(`
      /record @create_note_inputs = {
        facts: [content: string?],
        data: [title: string],
        validate: "strict"
      }

      /exe tool:w @createNote(content, title) = js { return title; }

      /var tools @writeTools = {
        create_note: {
          mlld: @createNote,
          inputs: @create_note_inputs,
          labels: ["tool:w"]
        }
      }

      /var @built = @policy.build({ allow: ["create_note"] }, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.create_note).toEqual({
      kind: 'constrained',
      args: {}
    });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations: built.policy.authorizations,
        operationName: 'create_note',
        args: { title: 'note' },
        controlArgs: ['content']
      })
    ).toEqual({
      decision: 'allow',
      matched: true
    });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations: built.policy.authorizations,
        operationName: 'create_note',
        args: { content: 'private', title: 'note' },
        controlArgs: ['content']
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'args_mismatch'
    });
  });

  it('accepts object-form true allow when input-record control args are optional and omitted', async () => {
    const env = await interpretWithEnv(`
      /record @create_note_inputs = {
        facts: [content: string?],
        data: [title: string],
        validate: "strict"
      }

      /exe tool:w @createNote(content, title) = js { return title; }

      /var tools @writeTools = {
        create_note: {
          mlld: @createNote,
          inputs: @create_note_inputs,
          labels: ["tool:w"]
        }
      }

      /var @built = @policy.build({ allow: { create_note: true } }, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.create_note).toEqual({
      kind: 'constrained',
      args: {}
    });
  });

  it('accepts mixed object-form true allow when input-record control args are optional and omitted', async () => {
    const env = await interpretWithEnv(`
      /record @create_note_inputs = {
        facts: [content: string?],
        data: [title: string],
        validate: "strict"
      }
      /record @create_draft_inputs = {
        data: [title: string],
        validate: "strict"
      }

      /exe tool:w @createNote(content, title) = js { return title; }
      /exe tool:w @createDraft(title) = js { return title; }

      /var tools @writeTools = {
        create_note: {
          mlld: @createNote,
          inputs: @create_note_inputs,
          labels: ["tool:w"]
        },
        create_draft: {
          mlld: @createDraft,
          inputs: @create_draft_inputs,
          labels: ["tool:w"]
        }
      }

      /var @built = @policy.build({
        allow: {
          create_note: true,
          create_draft: { args: { title: "draft" } }
        }
      }, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.create_note).toEqual({
      kind: 'constrained',
      args: {}
    });
    expect(built.policy.authorizations.allow.create_draft).toEqual({
      kind: 'unconstrained'
    });
  });

  it('rejects allow-list tools when input-record control args are required', async () => {
    const env = await interpretWithEnv(`
      /record @create_note_inputs = {
        facts: [content: string],
        data: [title: string],
        validate: "strict"
      }

      /exe tool:w @createNote(content, title) = js { return title; }

      /var tools @writeTools = {
        createNote: {
          mlld: @createNote,
          inputs: @create_note_inputs,
          labels: ["tool:w"]
        }
      }

      /var @built = @policy.build({ allow: ["createNote"] }, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual([
      expect.objectContaining({
        reason: 'requires_control_args',
        tool: 'createNote'
      })
    ]);
    expect(built.policy.authorizations.allow).toEqual({});
  });

  it('accepts plain arrays of executable refs for build and validate', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createDraft(subject, body) = js { return subject; } with { controlArgs: [] }
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with {
        controlArgs: ["recipient"]
      }

      /var @writeTools = [@createDraft, @sendEmail]
      /var @intent = { allow: ["createDraft"] }

      /var @built = @policy.build(@intent, @writeTools)
      /var @validated = @policy.validate(@intent, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.policy.authorizations.allow.createDraft).toEqual({
        kind: 'tool'
      });
      expect(result.policy.authorizations.allow).not.toHaveProperty('sendEmail');
    }
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
      kind: 'tool'
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

  it('accepts task option on build and validate for matching known literals', async () => {
    const env = await interpretWithEnv(`
      /exe finance:w, tool:w @transferFunds(recipient, amount, memo) = js { return recipient; } with { controlArgs: ["recipient", "amount"] }

      /var tools @writeTools = {
        transferFunds: {
          mlld: @transferFunds,
          expose: ["recipient", "amount", "memo"],
          controlArgs: ["recipient", "amount"]
        }
      }

      /var @query = "Transfer 100 dollars to John@Example.com"
      /var @intent = {
        known: {
          transferFunds: {
            recipient: {
              value: "john@example.com",
              source: "user explicitly provided the recipient"
            },
            amount: 100,
            memo: "internal note"
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools, { task: @query })
      /var @validated = @policy.validate(@intent, @writeTools, { task: @query })
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.policy.authorizations.allow.transferFunds).toEqual({
        kind: 'constrained',
        args: {
          recipient: [
            {
              eq: 'john@example.com',
              attestations: ['known']
            }
          ],
          amount: [
            {
              eq: 100,
              attestations: ['known']
            }
          ]
        }
      });
      expect(result.report).toMatchObject({
        strippedArgs: [{ tool: 'transferFunds', arg: 'memo' }]
      });
    }
  });

  it('reports no_update_fields and drops update tools when no changed fields are authorized', async () => {
    const env = await interpretWithEnv(`
      /exe finance:w, tool:w @updateScheduledTransaction(id, recipient, amount, date, subject) = js { return amount; } with {
        controlArgs: ["id", "recipient"],
        updateArgs: ["amount", "date", "subject"]
      }

      /var tools @writeTools = {
        updateScheduledTransaction: {
          mlld: @updateScheduledTransaction,
          expose: ["id", "recipient", "amount", "date", "subject"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        allow: {
          updateScheduledTransaction: {
            id: 'txn-1',
            recipient: 'acct-1'
          }
        }
      },
      rawSource: {
        allow: {
          updateScheduledTransaction: {
            id: 'txn-1',
            recipient: 'acct-1'
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
          code: 'no_update_fields',
          phase: 'build',
          reason: 'no_update_fields',
          tool: 'updateScheduledTransaction'
        })
      ])
    );
    expect(compilation.authorizations?.allow).toEqual({});
  });

  it('validates exactPayloadArgs against task text for known bucket values', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createDraft(subject, body) = js { return subject; } with {
        controlArgs: [],
        exactPayloadArgs: ["subject"]
      }

      /var tools @writeTools = {
        createDraft: {
          mlld: @createDraft,
          expose: ["subject", "body"]
        }
      }

      /var @query = "Draft an email with subject line: Q3 Review"
      /var @intent = {
        known: {
          createDraft: {
            subject: {
              value: "Urgent follow-up",
              source: "user explicitly provided the subject"
            }
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools, { task: @query })
      /var @validated = @policy.validate(@intent, @writeTools, { task: @query })
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'payload_not_in_task',
            tool: 'createDraft',
            arg: 'subject',
            message: "Payload literal 'Urgent follow-up' for 'subject' not found in task text"
          })
        ])
      );
      expect(result.policy.authorizations.allow).toEqual({});
    }
  });

  it('accepts flat-intent exactPayloadArgs values that appear in the task text', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createDraft(subject, body) = js { return subject; } with {
        controlArgs: [],
        exactPayloadArgs: ["subject"]
      }

      /var tools @writeTools = {
        createDraft: {
          mlld: @createDraft,
          expose: ["subject", "body"]
        }
      }

      /var @query = "Draft an email with subject line: Q3 Review"
      /var @intent = {
        createDraft: {
          subject: "q3 review"
        }
      }

      /var @built = @policy.build(@intent, @writeTools, { task: @query })
    `);

    const built = await extractBuiltinResult(env, 'built');
    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.createDraft).toEqual({
      kind: 'unconstrained'
    });
  });

  it('auto-allows omitted bucketed tools whose input records declare no facts', async () => {
    const env = await interpretWithEnv(`
      /record @create_draft_inputs = {
        data: [subject: string, body: string?],
        validate: "strict"
      }

      /exe tool:w @createDraft(subject, body) = js { return subject; }

      /var tools @writeTools = {
        createDraft: {
          mlld: @createDraft,
          inputs: @create_draft_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: { allow: {} },
      rawSource: { allow: {} },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([]);
    expect(compilation.authorizations?.allow?.createDraft).toEqual({ kind: 'tool' });
    expect(compilation.report.autoAllowedTools).toEqual([
      { tool: 'createDraft', reason: 'no-facts' }
    ]);
  });

  it('auto-allows omitted bucketed tools whose fact fields are all optional benign', async () => {
    const env = await interpretWithEnv(`
      /record @send_email_inputs = {
        facts: [recipient: string?],
        data: [subject: string],
        optional_benign: [recipient],
        validate: "strict"
      }

      /exe exfil:send, tool:w @sendEmail(recipient, subject) = js { return subject; }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: { allow: {} },
      rawSource: { allow: {} },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([]);
    expect(compilation.authorizations?.allow?.sendEmail).toEqual({ kind: 'tool' });
    expect(compilation.report.autoAllowedTools).toEqual([
      { tool: 'sendEmail', reason: 'all-optional-benign' }
    ]);
  });

  it('does not auto-allow omitted tools when any fact field is not optional benign', async () => {
    const env = await interpretWithEnv(`
      /record @send_email_inputs = {
        facts: [recipient: string?, cc: string?],
        data: [subject: string],
        optional_benign: [recipient],
        validate: "strict"
      }

      /exe exfil:send, tool:w @sendEmail(recipient, cc, subject) = js { return subject; }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: { allow: {} },
      rawSource: { allow: {} },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([]);
    expect(compilation.authorizations?.allow).toEqual({});
    expect(compilation.report.autoAllowedTools).toEqual([]);
  });

  it('does not auto-allow omitted tools that are denied by policy', async () => {
    const env = await interpretWithEnv(`
      /record @send_email_inputs = {
        facts: [recipient: string?],
        data: [subject: string],
        optional_benign: [recipient],
        validate: "strict"
      }

      /exe exfil:send, tool:w @sendEmail(recipient, subject) = js { return subject; }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: { allow: {} },
      rawSource: { allow: {} },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: ['sendEmail'],
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([]);
    expect(compilation.authorizations?.allow).toEqual({});
    expect(compilation.report.autoAllowedTools).toEqual([]);
  });

  it('does not auto-allow omitted tools in flat intent mode', async () => {
    const env = await interpretWithEnv(`
      /record @send_email_inputs = {
        facts: [recipient: string?],
        data: [subject: string],
        optional_benign: [recipient],
        validate: "strict"
      }

      /exe exfil:send, tool:w @sendEmail(recipient, subject) = js { return subject; }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {},
      rawSource: {},
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.issues).toEqual([]);
    expect(compilation.authorizations?.allow).toEqual({});
    expect(compilation.report.autoAllowedTools).toEqual([]);
  });

  it('reports exact_not_in_task for input-record exact fields', async () => {
    const env = await interpretWithEnv(`
      /record @create_draft_inputs = {
        data: [subject: string, body: string],
        exact: [subject],
        validate: "strict"
      }

      /exe tool:w @createDraft(subject, body) = js { return subject; }

      /var tools @writeTools = {
        createDraft: {
          mlld: @createDraft,
          inputs: @create_draft_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        known: {
          createDraft: {
            subject: {
              value: 'Urgent follow-up',
              source: 'user'
            }
          }
        }
      },
      rawSource: {
        known: {
          createDraft: {
            subject: {
              value: 'Urgent follow-up',
              source: 'user'
            }
          }
        }
      },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      taskText: 'Draft an email about the roadmap',
      mode: 'builder'
    });

    expect(compilation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'exact_not_in_task',
          tool: 'createDraft',
          arg: 'subject'
        })
      ])
    );
    expect(compilation.authorizations?.allow).toEqual({});
  });

  it('drops tools when input-record allowlist checks fail', async () => {
    const env = await interpretWithEnv(`
      /var @approvedRecipients = ["ada@example.com"]

      /record @send_email_inputs = {
        facts: [recipient: string],
        data: [subject: string],
        allowlist: { recipient: @approvedRecipients },
        validate: "strict"
      }

      /exe tool:w @sendEmail(recipient, subject) = js { return subject; }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        allow: {
          sendEmail: {
            recipient: 'mallory@example.com',
            subject: 'hi'
          }
        }
      },
      rawSource: {
        allow: {
          sendEmail: {
            recipient: 'mallory@example.com',
            subject: 'hi'
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
          code: 'allowlist_mismatch',
          phase: 'build',
          reason: 'allowlist_mismatch',
          tool: 'sendEmail',
          arg: 'recipient'
        })
      ])
    );
    expect(compilation.authorizations?.allow).toEqual({});
  });

  it('expands allow true to input-record allowlist constraints for required control args', async () => {
    const env = await interpretWithEnv(`
      /var @approvedRecipients = ["ada@example.com"]

      /record @send_email_inputs = {
        facts: [recipient: string],
        data: [subject: string],
        allowlist: { recipient: @approvedRecipients },
        validate: "strict"
      }

      /exe tool:w, exfil:send @sendEmail(recipient, subject) = js { return subject; }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w", "tool:w", "exfil:send"],
          can_authorize: "role:planner"
        }
      }

      /exe role:planner @buildPolicy() = [
        => @policy.build(
          { allow: { sendEmail: true } },
          @writeTools,
          {
            task: "Send hello to ada@example.com.",
            basePolicy: {
              defaults: { rules: [] },
              operations: { "exfil:send": ["sendEmail"] },
              authorizations: {
                deny: [],
                can_authorize: { "role:planner": ["sendEmail"] }
              }
            }
          }
        )
      ]

      /var @built = @buildPolicy()
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.sendEmail).toEqual({
      kind: 'constrained',
      args: {
        recipient: [{ oneOf: ['ada@example.com'], oneOfAttestations: [['known']] }]
      }
    });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations: built.policy.authorizations,
        operationName: 'sendEmail',
        args: { recipient: 'ada@example.com', subject: 'hello' },
        controlArgs: ['recipient']
      })
    ).toMatchObject({
      decision: 'allow',
      matched: true,
      matchedAttestations: {
        recipient: ['known']
      }
    });

    expect(
      evaluatePolicyAuthorizationDecision({
        authorizations: built.policy.authorizations,
        operationName: 'sendEmail',
        args: { recipient: 'mallory@example.com', subject: 'hello' },
        controlArgs: ['recipient']
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'args_mismatch'
    });
  });

  it('drops blocklisted array elements for input-record policy checks', async () => {
    const env = await interpretWithEnv(`
      /var @blockedSubjects = ["blocked subject"]

      /record @send_email_inputs = {
        facts: [],
        data: [subjects: array],
        blocklist: { subjects: @blockedSubjects },
        validate: "strict"
      }

      /exe tool:w @sendEmail(subjects) = js { return subjects; }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const toolCollection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const toolContext = buildAuthorizationToolContextForCollection(env, toolCollection);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: {
        allow: {
          sendEmail: {
            subjects: ['ok subject', 'blocked subject']
          }
        }
      },
      rawSource: {
        allow: {
          sendEmail: {
            subjects: ['ok subject', 'blocked subject']
          }
        }
      },
      env,
      toolContext,
      policy: env.getPolicySummary(),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'builder'
    });

    expect(compilation.report.droppedArrayElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'sendEmail',
          arg: 'subjects',
          index: 1,
          reason: 'blocklist_match'
        })
      ])
    );
    expect(compilation.authorizations?.allow?.sendEmail).toBeDefined();
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

  it('treats trusted-data record fields as proofless in build and validate', async () => {
    const env = await interpretWithEnv(`
      /record @contact = {
        facts: [id: string],
        data: {
          trusted: [email: string]
        }
      }
      /exe untrusted, src:mcp @getContact() = js {
        return {
          id: "contact-1",
          email: "ada@example.com"
        };
      } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /var @contact = @getContact()
      /var @contactEmail = @contact.email
    `);

    const contactEmail = await extractVariableValue(env.getVariable('contactEmail') as any, env) as any;
    expect(contactEmail.mx.labels).toContain('src:mcp');
    expect(contactEmail.mx.labels).not.toContain('untrusted');
    expect(contactEmail.mx.labels.some((label: string) => label.startsWith('fact:'))).toBe(false);

    const issued = env.issueHandle(contactEmail, {
      preview: 'a***@example.com',
      metadata: { field: 'email' }
    });
    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;
    const plannerIntent = {
      resolved: {
        sendEmail: {
          recipient: issued.handle,
          subject: 'hello'
        }
      }
    };

    for (const method of ['build', 'validate'] as const) {
      const result = await invokePolicyBuiltin(env, method, plannerIntent, writeTools) as any;
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'proofless_control_arg',
            phase: 'build',
            reason: 'proofless_control_arg',
            tool: 'sendEmail',
            arg: 'recipient'
          })
        ])
      );
      expect(result.report.compiledProofs).toEqual([]);
      expect(result.policy.authorizations.allow).toEqual({});
    }
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

  it('accepts planner-style masked handle-bearing objects in resolved intent', async () => {
    const env = await interpretWithEnv(`
      /exe finance:w, tool:w @updateScheduledTransaction(recipient, id, amount) = js { return amount; } with { controlArgs: ["recipient", "id"] }

      /var tools @writeTools = {
        updateScheduledTransaction: {
          mlld: @updateScheduledTransaction,
          expose: ["recipient", "id", "amount"],
          controlArgs: ["recipient", "id"]
        }
      }
    `);

    const approvedRecipient = createKnownStructuredText('US122000000121212121212');
    const approvedId = createKnownStructuredText('scheduled-rent-7');
    const issuedRecipient = env.issueHandle(approvedRecipient);
    const issuedId = env.issueHandle(approvedId);
    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;
    const plannerIntent = {
      resolved: {
        updateScheduledTransaction: {
          id: [{ handle: issuedId.handle }],
          recipient: [
            {
              preview: 'U***1212',
              handle: wrapStructured(issuedRecipient.handle, 'text', issuedRecipient.handle)
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
          tool: 'updateScheduledTransaction'
        })
      ])
    );
    expect(built.policy.authorizations.allow.updateScheduledTransaction).toEqual({
      kind: 'constrained',
      args: {
        id: [
          {
            eq: [approvedId],
            attestations: ['known']
          }
        ],
        recipient: [
          {
            eq: [approvedRecipient],
            attestations: ['known']
          }
        ]
      }
    });
  });

  it('preserves bare handle wrappers through js state merges before policy build', async () => {
    const env = await interpretWithEnv(`
      /exe @mergeState(state, patch) = js {
        function deepMerge(base, next) {
          if (
            !base ||
            typeof base !== 'object' ||
            Array.isArray(base) ||
            !next ||
            typeof next !== 'object' ||
            Array.isArray(next)
          ) {
            return next;
          }

          const merged = { ...base };
          for (const [key, value] of Object.entries(next)) {
            merged[key] = key in merged ? deepMerge(merged[key], value) : value;
          }
          return merged;
        }

        return deepMerge(state, patch);
      }

      /exe finance:w, tool:w @updateScheduledTransaction(recipient, id, amount) = js { return amount; } with { controlArgs: ["recipient", "id"] }

      /var tools @writeTools = {
        updateScheduledTransaction: {
          mlld: @updateScheduledTransaction,
          expose: ["recipient", "id", "amount"],
          controlArgs: ["recipient", "id"]
        }
      }
    `);

    const approvedRecipient = createKnownStructuredText('US122000000121212121212');
    const approvedId = createKnownStructuredText('scheduled-rent-7');
    const issuedRecipient = env.issueHandle(approvedRecipient);
    const issuedId = env.issueHandle(approvedId);
    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;

    const mergeInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'merge-state',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'merge-state-ref',
        identifier: 'mergeState',
        args: [
          { trusted: {} } as any,
          {
            trusted: {
              updateScheduledTransaction: {
                id: createHandleWrapper(issuedId.handle),
                recipient: {
                  preview: 'U***1212',
                  handle: issuedRecipient.handle
                },
                amount: 1200
              }
            }
          } as any
        ]
      }
    };

    const mergedStateResult = await evaluateExecInvocation(mergeInvocation, env);
    const mergedState = (mergedStateResult.value as any).data as {
      trusted: {
        updateScheduledTransaction: {
          id: unknown;
          recipient: unknown;
          amount: number;
        };
      };
    };

    expect(mergedState.trusted.updateScheduledTransaction.id).toEqual(
      createHandleWrapper(issuedId.handle)
    );

    const built = await invokePolicyBuiltin(
      env,
      'build',
      {
        resolved: {
          updateScheduledTransaction: mergedState.trusted.updateScheduledTransaction
        }
      },
      writeTools
    ) as any;

    expect(built.valid).toBe(true);
    expect(built.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'proofless_resolved_value',
          tool: 'updateScheduledTransaction',
          arg: 'id'
        })
      ])
    );
  });

  it('accepts planner-style ref handle-bearing objects in resolved intent', async () => {
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
              value: 'ada@example.com',
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

  it('accepts parsed planner JSON resolved handle wrappers through @parse.llm', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);
    env.setVariable(
      'plannerJson',
      createSimpleTextVariable(
        'plannerJson',
        [
          '```json',
          JSON.stringify({
            resolved: {
              sendEmail: {
                recipient: [
                  {
                    handle: issued.handle
                  }
                ]
              }
            }
          }),
          '```'
        ].join('\n'),
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: true
        }
      )
    );

    await evaluateSourceInEnv(env, `
      /var @intent = @plannerJson | @parse.llm
      /var @built = @policy.build(@intent, @writeTools)
      /var @validated = @policy.validate(@intent, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expectResolvedRecipientAuthorization(result, approvedRecipient);
      expect(result.report).toMatchObject({
        repairedArgs: [{ tool: 'sendEmail', arg: 'recipient', steps: ['resolved_handle'] }],
        compiledProofs: [{ tool: 'sendEmail', arg: 'recipient', labels: ['known'] }]
      });
    }
  });

  it('preserves parsed planner resolved handles through wrapper exes ending at policy build and validate', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /var @basePolicy = {
        authorizations: {
          deny: []
        }
      }

      /exe @validateAuthorizationIntent(intent) = @policy.validate(@intent, @writeTools)
      /exe @buildAuthorizationPolicy(intent) = @policy.build(@intent, @writeTools)
      /exe @validateDefendedAuthorizationIntent(intent) = @validateAuthorizationIntent(@intent) with { policy: @basePolicy }
      /exe @buildDefendedAuthorizationPolicy(intent) = @buildAuthorizationPolicy(@intent) with { policy: @basePolicy }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);
    env.setVariable(
      'plannerJson',
      createSimpleTextVariable(
        'plannerJson',
        JSON.stringify({
          resolved: {
            sendEmail: {
              recipient: [
                {
                  handle: issued.handle
                }
              ]
            }
          }
        }),
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    await evaluateSourceInEnv(env, `
      /var @intent = @plannerJson | @parse
      /var @wrappedBuilt = @buildDefendedAuthorizationPolicy(@intent)
      /var @wrappedValidated = @validateDefendedAuthorizationIntent(@intent)
    `);

    const wrappedBuilt = await extractBuiltinResult(env, 'wrappedBuilt');
    const wrappedValidated = await extractBuiltinResult(env, 'wrappedValidated');

    for (const result of [wrappedBuilt, wrappedValidated]) {
      expectResolvedRecipientAuthorization(result, approvedRecipient);
      expect(result.report).toMatchObject({
        repairedArgs: [{ tool: 'sendEmail', arg: 'recipient', steps: ['resolved_handle'] }],
        compiledProofs: [{ tool: 'sendEmail', arg: 'recipient', labels: ['known'] }]
      });
    }
  });

  it('accepts an explicit basePolicy option for build and validate', async () => {
    const env = await interpretWithEnv(`
      /policy @scriptPolicy = {
        defaults: { rules: ["no-untrusted-destructive"] },
        operations: { destructive: ["tool:w"] },
        authorizations: {
          deny: ["sendEmail"]
        }
      }

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /var @explicitBasePolicy = {
        defaults: { rules: ["no-send-to-unknown"] },
        operations: { "exfil:send": ["tool:w"] },
        authorizations: {
          deny: []
        }
      }

      /var @intent = {
        sendEmail: {
          recipient: { eq: "ada@example.com", attestations: ["known"] }
        }
      }

      /var @builtDefault = @policy.build(@intent, @writeTools)
      /var @builtExplicit = @policy.build(@intent, @writeTools, { basePolicy: @explicitBasePolicy })
      /var @validatedExplicit = @policy.validate(@intent, @writeTools, { basePolicy: @explicitBasePolicy })
    `);

    const builtDefault = await extractBuiltinResult(env, 'builtDefault');
    const builtExplicit = await extractBuiltinResult(env, 'builtExplicit');
    const validatedExplicit = await extractBuiltinResult(env, 'validatedExplicit');

    expect(builtDefault.valid).toBe(false);
    expect(builtDefault.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'denied_by_policy',
          tool: 'sendEmail'
        })
      ])
    );
    expect(builtDefault.policy.defaults?.rules).toEqual(['no-untrusted-destructive']);
    expect(builtDefault.policy.operations).toEqual({ destructive: ['tool:w'] });
    expect(builtDefault.policy.authorizations.allow).toEqual({});

    for (const result of [builtExplicit, validatedExplicit]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.policy.defaults?.rules).toEqual(['no-send-to-unknown']);
      expect(result.policy.operations).toEqual({ 'exfil:send': ['tool:w'] });
      expect(result.policy.authorizations.allow.sendEmail).toEqual({
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
      expect(result.policy.authorizations.deny || []).not.toContain('sendEmail');
    }
  });

  it('preserves explicit basePolicy passed through parameter-bound field access', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /policy @scriptPolicy = {
          defaults: { rules: ["script-rule"] },
          operations: { destructive: ["tool:w"] },
          authorizations: {
            deny: ["sendEmail"]
          }
        }

        /import { @dispatch } from "./framework.mld"

        /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

        /var tools @writeTools = {
          sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
        }

        /var @basePolicy = {
          defaults: { rules: ["explicit-rule"] },
          operations: { "exfil:send": ["tool:w"] },
          authorizations: {
            deny: []
          }
        }

        /var @agent = {
          basePolicy: @basePolicy,
          toolsCollection: @writeTools
        }

        /var @intent = {
          sendEmail: {
            recipient: { eq: "ada@example.com", attestations: ["known"] }
          }
        }

        /var @result = @dispatch(@agent, @intent)
      `,
      {
        '/framework.mld': `
          /exe @dispatch(agent, intent) = [
            let @builtDirect = @policy.build(
              @intent,
              @agent.toolsCollection,
              { basePolicy: @agent.basePolicy }
            )
            let @bpClone = { ...@agent.basePolicy }
            let @builtClone = @policy.build(
              @intent,
              @agent.toolsCollection,
              { basePolicy: @bpClone }
            )

            => {
              direct: @builtDirect.policy.defaults.rules,
              clone: @builtClone.policy.defaults.rules
            }
          ]

          /export { @dispatch }
        `
      }
    );

    const result = await extractBuiltinResult(env, 'result');

    expect(result).toEqual({
      direct: ['explicit-rule'],
      clone: ['explicit-rule']
    });
  });

  it('preserves explicit basePolicy when defaults.rules comes from an exe-returned array', async () => {
    const env = await interpretWithEnv(`
      /exe @buildRules() = [
        => ["no-send-to-unknown", "no-untrusted-destructive"]
      ]

      /exe @buildBasePolicy() = [
        let @rules = @buildRules()
        => {
          defaults: { rules: @rules },
          operations: { "exfil:send": ["tool:w"] },
          authorizations: {
            deny: []
          }
        }
      ]

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /exe @dispatch(agent, intent) = [
        let @builtDirect = @policy.build(
          @intent,
          @agent.toolsCollection,
          { basePolicy: @agent.basePolicy }
        )
        let @bpClone = { ...@agent.basePolicy }
        let @builtClone = @policy.build(
          @intent,
          @agent.toolsCollection,
          { basePolicy: @bpClone }
        )

        => {
          direct: @builtDirect.policy.defaults.rules,
          clone: @builtClone.policy.defaults.rules
        }
      ]

      /var @agent = {
        basePolicy: @buildBasePolicy(),
        toolsCollection: @writeTools
      }

      /var @intent = {
        sendEmail: {
          recipient: { eq: "ada@example.com", attestations: ["known"] }
        }
      }

      /var @result = @dispatch(@agent, @intent)
    `);

    const result = await extractBuiltinResult(env, 'result');

    expect(result).toEqual({
      direct: ['no-send-to-unknown', 'no-untrusted-destructive'],
      clone: ['no-send-to-unknown', 'no-untrusted-destructive']
    });
  });

  it('validate accepts canonical, structured, and planner-display resolved handle forms', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);
    const writeTools = env.getVariable('writeTools')?.value as ToolCollection;

    const cases = [
      {
        label: 'bare handle strings',
        intent: {
          resolved: {
            sendEmail: {
              recipient: [issued.handle]
            }
          }
        }
      },
      {
        label: 'exact handle wrappers',
        intent: {
          resolved: {
            sendEmail: {
              recipient: [createHandleWrapper(issued.handle)]
            }
          }
        }
      },
      {
        label: 'StructuredValue handle strings',
        intent: {
          resolved: {
            sendEmail: {
              recipient: [wrapStructured(issued.handle, 'text', issued.handle)]
            }
          }
        }
      },
      {
        label: 'StructuredValue handle wrappers',
        intent: {
          resolved: {
            sendEmail: {
              recipient: [
                {
                  handle: wrapStructured(issued.handle, 'text', issued.handle)
                }
              ]
            }
          }
        }
      },
      {
        label: 'planner-style masked objects',
        intent: {
          resolved: {
            sendEmail: {
              recipient: [
                {
                  preview: 'a***@example.com',
                  handle: wrapStructured(issued.handle, 'text', issued.handle)
                }
              ]
            }
          }
        }
      },
      {
        label: 'planner-style ref objects',
        intent: {
          resolved: {
            sendEmail: {
              recipient: [
                {
                  value: 'ada@example.com',
                  handle: wrapStructured(issued.handle, 'text', issued.handle)
                }
              ]
            }
          }
        }
      }
    ] as const;

    for (const testCase of cases) {
      const validated = await invokePolicyBuiltin(env, 'validate', testCase.intent, writeTools) as any;

      expectResolvedRecipientAuthorization(validated, approvedRecipient);
      expect(validated.report).toMatchObject({
        repairedArgs: [{ tool: 'sendEmail', arg: 'recipient', steps: ['resolved_handle'] }],
        compiledProofs: [{ tool: 'sendEmail', arg: 'recipient', labels: ['known'] }]
      });
    }
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

  it('rejects known literals that do not appear in the provided task text', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
      
      /var @query = "Please send an update to ada@example.com"
      /var @intent = {
        known: {
          sendEmail: {
            recipient: "evil@attacker.com"
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools, { task: @query })
      /var @validated = @policy.validate(@intent, @writeTools, { task: @query })
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'known_not_in_task',
            tool: 'sendEmail',
            arg: 'recipient',
            message: "Known literal 'evil@attacker.com' not found in task text"
          })
        ])
      );
      expect(result.policy.authorizations.allow).toEqual({});
    }
  });

  it('checks known array elements individually against the provided task text', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipients, subject, body) = js { return recipients; } with { controlArgs: ["recipients"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipients", "subject", "body"], controlArgs: ["recipients"] }
      }

      /var @query = "Please email john@example.com with the status update"
      /var @intent = {
        known: {
          sendEmail: {
            recipients: ["John@example.com", "evil@attacker.com"]
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools, { task: @query })
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'known_not_in_task',
          tool: 'sendEmail',
          arg: 'recipients',
          message: "Known literal 'evil@attacker.com' not found in task text"
        })
      ])
    );
    expect(built.policy.authorizations.allow).toEqual({});
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

  it('rejects handle wrappers in the known bucket when task validation is enabled', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
    `);

    const approvedRecipient = createKnownStructuredText('ada@example.com');
    const issued = env.issueHandle(approvedRecipient);

    await evaluateSourceInEnv(env, `
      /var @query = "Please email ada@example.com"
      /var @intent = {
        known: {
          sendEmail: {
            recipient: {
              handle: "${issued.handle}"
            }
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools, { task: @query })
      /var @validated = @policy.validate(@intent, @writeTools, { task: @query })
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'known_contains_handle',
            tool: 'sendEmail',
            arg: 'recipient',
            message: 'Handle wrappers belong in resolved, not known'
          })
        ])
      );
      expect(result.policy.authorizations.allow).toEqual({});
    }
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

  it('treats empty or null task as no task validation', async () => {
    const env = await interpretWithEnv(`
      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with { controlArgs: ["recipient"] }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }
      
      /var @intent = {
        known: {
          sendEmail: {
            recipient: "ada@example.com"
          }
        }
      }

      /var @emptyTaskBuilt = @policy.build(@intent, @writeTools, { task: "" })
      /var @nullTaskBuilt = @policy.build(@intent, @writeTools, { task: null })
    `);

    for (const name of ['emptyTaskBuilt', 'nullTaskBuilt']) {
      const built = await extractBuiltinResult(env, name);

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
    }
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

  it('accepts flat fact-bearing control arg values without requiring handle strings', async () => {
    const env = await interpretWithEnv(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @getContact() = { email: "ada@example.com", name: "Ada" } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with {
        controlArgs: ["recipient"]
      }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /var @contact = @getContact()
      /var @contactEmail = @contact.email
      /var @intent = {
        sendEmail: {
          recipient: @contactEmail
        }
      }

      /var @built = @policy.build(@intent, @writeTools)
      /var @validated = @policy.validate(@intent, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.policy.authorizations.allow.sendEmail).toEqual({
        kind: 'constrained',
        args: {
          recipient: [
            {
              eq: expect.anything(),
              attestations: ['fact:@contact.email']
            }
          ]
        }
      });
      const recipientConstraint = result.policy.authorizations.allow.sendEmail.args.recipient[0];
      expect((recipientConstraint.eq as any)?.data ?? recipientConstraint.eq).toBe('ada@example.com');
    }
  });

  it('accepts fact-bearing values in the resolved bucket without requiring explicit handles', async () => {
    const env = await interpretWithEnv(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @getContact() = { email: "ada@example.com", name: "Ada" } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with {
        controlArgs: ["recipient"]
      }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] }
      }

      /var @contact = @getContact()
      /var @contactEmail = @contact.email
      /var @intent = {
        resolved: {
          sendEmail: {
            recipient: @contactEmail
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools)
      /var @validated = @policy.validate(@intent, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.policy.authorizations.allow.sendEmail).toEqual({
        kind: 'constrained',
        args: {
          recipient: [
            {
              eq: expect.anything(),
              attestations: ['fact:@contact.email']
            }
          ]
        }
      });
      const recipientConstraint = result.policy.authorizations.allow.sendEmail.args.recipient[0];
      expect((recipientConstraint.eq as any)?.data ?? recipientConstraint.eq).toBe('ada@example.com');
    }
  });

  it('treats allow object entries as explicit tool-level authorization in bucketed intent', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createFile(path, body) = js { return path; }

      /var tools @writeTools = {
        createFile: { mlld: @createFile, expose: ["path", "body"] }
      }

      /var @intent = {
        allow: {
          createFile: true
        }
      }

      /var @built = @policy.build(@intent, @writeTools)
      /var @validated = @policy.validate(@intent, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');
    const validated = await extractBuiltinResult(env, 'validated');

    for (const result of [built, validated]) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.policy.authorizations.allow.createFile).toEqual({
        kind: 'tool'
      });
    }

    const decision = evaluatePolicyAuthorizationDecision({
      authorizations: built.policy.authorizations,
      operationName: 'createFile',
      args: { path: 'notes.txt', body: 'hello' },
      controlArgs: ['path', 'body']
    });
    expect(decision).toMatchObject({
      decision: 'allow',
      matched: true
    });
  });

  it('matches builder-shaped wrapped eq and oneOf constraints at runtime authorization evaluation', () => {
    const decision = evaluatePolicyAuthorizationDecision({
      authorizations: {
        allow: {
          sendEmail: {
            kind: 'constrained',
            args: {
              recipient: [
                {
                  eq: {
                    value: 'ada@example.com',
                    source: 'user'
                  },
                  attestations: ['known']
                },
                {
                  oneOf: [
                    {
                      value: 'ada@example.com',
                      source: 'user'
                    }
                  ],
                  oneOfAttestations: [['known']]
                }
              ]
            }
          }
        }
      },
      operationName: 'sendEmail',
      args: { recipient: 'ada@example.com' },
      controlArgs: ['recipient']
    });

    expect(decision).toMatchObject({
      decision: 'allow',
      matched: true,
      matchedAttestations: {
        recipient: ['known']
      }
    });
  });

  it('builds all three bucket types together without dropping entries', async () => {
    const env = await interpretWithEnv(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @getContact() = { email: "ada@example.com", name: "Ada" } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with {
        controlArgs: ["recipient"]
      }
      /exe tool:w @createDraft(subject, body) = js { return subject; } with {
        controlArgs: ["subject"]
      }
      /exe tool:w @createFile(path, body) = js { return path; }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] },
        createDraft: { mlld: @createDraft, expose: ["subject", "body"], controlArgs: ["subject"] },
        createFile: { mlld: @createFile, expose: ["path", "body"] }
      }

      /var @contact = @getContact()
      /var @contactEmail = @contact.email
      /var @query = "Send it to ada@example.com and create a draft with subject hi"
      /var @intent = {
        resolved: {
          sendEmail: {
            recipient: @contactEmail
          }
        },
        known: {
          createDraft: {
            subject: {
              value: "hi",
              source: "user typed the subject"
            }
          }
        },
        allow: {
          createFile: true
        }
      }

      /var @built = @policy.build(@intent, @writeTools, { task: @query })
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.policy.authorizations.allow.sendEmail).toEqual({
      kind: 'constrained',
      args: {
        recipient: [
          {
            eq: expect.anything(),
            attestations: ['fact:@contact.email']
          }
        ]
      }
    });
    expect(built.policy.authorizations.allow.createDraft).toEqual({
      kind: 'constrained',
      args: {
        subject: [
          {
            eq: 'hi',
            attestations: ['known']
          }
        ]
      }
    });
    expect(built.policy.authorizations.allow.createFile).toEqual({
      kind: 'tool'
    });
  });

  it('rejects mixed flat and bucketed authorization intents loudly', async () => {
    const env = await interpretWithEnv(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @getContact() = { email: "ada@example.com", name: "Ada" } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js { return recipient; } with {
        controlArgs: ["recipient"]
      }
      /exe tool:w @createDraft(subject, body) = js { return subject; } with {
        controlArgs: ["subject"]
      }

      /var tools @writeTools = {
        sendEmail: { mlld: @sendEmail, expose: ["recipient", "subject", "body"], controlArgs: ["recipient"] },
        createDraft: { mlld: @createDraft, expose: ["subject", "body"], controlArgs: ["subject"] }
      }

      /var @contact = @getContact()
      /var @contactEmail = @contact.email
      /var @intent = {
        sendEmail: {
          recipient: @contactEmail
        },
        known: {
          createDraft: {
            subject: {
              value: "hi",
              source: "user typed the subject"
            }
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'invalid_authorization',
          message: expect.stringContaining('Cannot mix flat tool entries with bucketed authorization fields')
        })
      ])
    );
    expect(built.policy.authorizations.allow).toEqual({});
  });

  it('reports unrecognized top-level authorization fields instead of dropping them silently', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createDraft(subject, body) = js { return subject; } with {
        controlArgs: ["subject"]
      }

      /var tools @writeTools = {
        createDraft: { mlld: @createDraft, expose: ["subject", "body"], controlArgs: ["subject"] }
      }

      /var @intent = {
        typoBucket: {
          createDraft: true
        },
        known: {
          createDraft: {
            subject: {
              value: "hi",
              source: "user typed the subject"
            }
          }
        }
      }

      /var @built = @policy.build(@intent, @writeTools)
    `);

    const built = await extractBuiltinResult(env, 'built');

    expect(built.valid).toBe(false);
    expect(built.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'invalid_authorization',
          message: "Unrecognized authorization field 'typoBucket'; expected one of: resolved, known, allow, or a tool name"
        })
      ])
    );
    expect(built.policy.authorizations.allow).toEqual({});
  });
});
