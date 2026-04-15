import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import {
  evaluateFyiTools,
  renderInjectedAuthorizationNotes
} from '@interpreter/fyi/tool-docs';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { Environment } from '@interpreter/env/Environment';
import { normalizePolicyConfig } from '@core/policy/union';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/tool-docs-test.mld'
} as const;

function normalizeSource(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  const indents = lines
    .filter(line => line.trim().length > 0)
    .map(line => line.match(/^(\s*)/)?.[1].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines.map(line => line.slice(minIndent)).join('\n');
}

async function interpretWithEnv(
  source: string,
  files?: Record<string, string>
): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  for (const [filePath, content] of Object.entries(files ?? {})) {
    await fileSystem.writeFile(filePath, normalizeSource(content));
  }

  let environment: Environment | undefined;
  await interpret(normalizeSource(source), {
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

async function readVarData(env: Environment, name: string): Promise<unknown> {
  const variable = env.getVariable(name);
  if (!variable) {
    throw new Error(`Missing variable @${name}`);
  }

  const value = await extractVariableValue(variable as any, env);
  return isStructuredValue(value) ? value.data : value;
}

describe('@fyi.tools', () => {
  it('exposes @toolDocs as a top-level alias for @fyi.tools', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @sendEmail(recipient, subject, body) = "sent" with {
        controlArgs: ["recipient"]
      }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          expose: ["recipient", "subject", "body"]
        }
      }

      /var @docs = @toolDocs(@writeTools, { format: "json" })
    `);

    try {
      const docs = await readVarData(env, 'docs') as {
        tools: Array<Record<string, unknown>>;
      };
      expect(docs.tools).toEqual([
        expect.objectContaining({
          name: 'sendEmail',
          controlArgs: ['recipient'],
          discoveryCall: '@fyi.known("sendEmail")'
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('renders canonical arg lists for shaped tool collections using exposed params only', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @sendEmail(owner, recipient, subject, body) = js { return subject; } with {
        controlArgs: ["owner", "recipient"]
      }

      /var tools @writeTools = {
        outreach: {
          mlld: @sendEmail,
          bind: { owner: "mlld" },
          expose: ["recipient", "subject", "body"],
          controlArgs: ["recipient"]
        }
      }
    `);

    try {
      const docs = await evaluateFyiTools(env.getVariable('writeTools')?.value, env);
      expect(docs.text).toContain('Write tools (require authorization):');
      expect(docs.text).toContain('### outreach');
      expect(docs.text).toContain('- `recipient` (string, **control arg**)');
      expect(docs.text).toContain('- `subject` (string)');
      expect(docs.text).toContain('- `body` (string)');
      expect(docs.text).not.toContain('owner');
      expect(docs.text).not.toContain('@fyi.known("outreach")');
    } finally {
      env.cleanup();
    }
  });

  it('renders control args in the canonical per-arg form without same-source helper text', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @updateScheduledTransaction(id, recipient, amount) = js { return amount; } with {
        controlArgs: ["id", "recipient"],
        correlateControlArgs: true
      }
      /exe tool:w @sendEmail(recipients, cc, bcc, subject) = js { return subject; } with {
        controlArgs: ["recipients", "cc", "bcc"]
      }

      /var tools @writeTools = {
        update_scheduled_transaction: {
          mlld: @updateScheduledTransaction,
          expose: ["id", "recipient", "amount"]
        },
        send_email: {
          mlld: @sendEmail,
          expose: ["recipients", "cc", "bcc", "subject"]
        }
      }
    `);

    try {
      const docs = await evaluateFyiTools(env.getVariable('writeTools')?.value, env);
      expect(docs.text).toContain('### update_scheduled_transaction');
      expect(docs.text).toContain('- `id` (string, **control arg**)');
      expect(docs.text).toContain('- `recipient` (string, **control arg**)');
      expect(docs.text).toContain('### send_email');
      expect(docs.text).toContain('- `recipients` (string, **control arg**)');
      expect(docs.text).toContain('- `cc` (string, **control arg**)');
      expect(docs.text).toContain('- `bcc` (string, **control arg**)');
      expect(docs.text).not.toContain('(same source)');
    } finally {
      env.cleanup();
    }
  });

  it('renders canonical explicit @toolDocs() sections outside MCP context', async () => {
    const env = await interpretWithEnv(`
      /var @approvedRecipients = ["ada-recipient"]

      /record @send_email_inputs = {
        facts: [recipient: string, cc: string?],
        data: {
          trusted: [subject: string],
          untrusted: [body: string?]
        },
        exact: [subject],
        update: [body],
        allowlist: { recipient: @approvedRecipients },
        blocklist: { recipient: ["blocked-recipient"] },
        optional_benign: [cc],
        validate: "strict"
      }

      /record @search_contacts_inputs = {
        data: [query: string],
        validate: "strict"
      }

      /exe tool:w @sendEmail(recipient, cc, subject, body) = "sent"
      /exe tool:r @lookupContact(query) = "Ada"

      /var tools @tools = {
        send_email: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w", "update:w", "exfil:send", "comm:w"],
          description: "Send an outbound email",
          instructions: "Prefer update_draft for in-progress composition."
        },
        search_contacts_by_name: {
          mlld: @lookupContact,
          inputs: @search_contacts_inputs,
          labels: ["resolve:r", "comm:r"],
          description: "Search contacts by name"
        }
      }

      /var @docs = @toolDocs(@tools)
    `);

    try {
      const docs = await readVarData(env, 'docs') as string;
      expect(docs).toContain('Write tools (require authorization):');
      expect(docs).toContain('### send_email');
      expect(docs).toContain('Routing: execute (write)');
      expect(docs).toContain('Risk: exfil (send)');
      expect(docs).toContain('Domain: update (write), communication (write)');
      expect(docs).toContain('Description: Send an outbound email');
      expect(docs).toContain('Instructions: Prefer update_draft for in-progress composition.');
      expect(docs).toContain('Facts:');
      expect(docs).toContain('- `recipient` (string)');
      expect(docs).toContain('- `cc` (string, optional)');
      expect(docs).toContain('Trusted payload:');
      expect(docs).toContain('- `subject` (string)');
      expect(docs).toContain('Untrusted payload:');
      expect(docs).toContain('- `body` (string, optional)');
      expect(docs).toContain('Exact:');
      expect(docs).toContain('Update:');
      expect(docs).toContain('Allowlist:');
      expect(docs).toContain('- `recipient` -> @approvedRecipients');
      expect(docs).toContain('Blocklist:');
      expect(docs).toContain('- `recipient` -> ["blocked-recipient"]');
      expect(docs).toContain('Optional benign:');
      expect(docs).toContain('Read tools:');
      expect(docs).toContain('### search_contacts_by_name');
      expect(docs).toContain('Routing: resolve (read)');
      expect(docs).toContain('Domain: communication (read)');
      expect(docs).toContain('Description: Search contacts by name');
      expect(docs).toContain('Untrusted payload:');
      expect(docs).toContain('- `query` (string)');
    } finally {
      env.cleanup();
    }
  });

  it('shapes output-field docs from the active display role and output record metadata', async () => {
    const env = await interpretWithEnv(`
      /record @contact = {
        facts: [email: string],
        data: [name: string, notes: string],
        display: {
          role:planner: [name, { ref: "email" }],
          role:worker: [{ mask: "email" }, name, notes]
        }
      }

      /exe tool:r @searchContacts(query) = "Ada" => contact

      /var tools @tools = {
        search_contacts: {
          mlld: @searchContacts,
          expose: ["query"]
        }
      }
    `);

    try {
      env.setScopedEnvironmentConfig({
        display: 'role:planner',
        tools: env.getVariable('tools')?.internal?.toolCollection as any
      } as any);

      const plannerDocs = await evaluateFyiTools(env.getVariable('tools')?.value, env);
      expect(plannerDocs.text).toContain('Returns:');
      expect(plannerDocs.text).toContain('- `name` (value, data)');
      expect(plannerDocs.text).toContain('- `email` (value + handle, fact)');
      expect(plannerDocs.text).not.toContain('notes');

      env.setScopedEnvironmentConfig({
        display: 'role:worker',
        tools: env.getVariable('tools')?.internal?.toolCollection as any
      } as any);

      const workerDocs = await evaluateFyiTools(env.getVariable('tools')?.value, env);
      expect(workerDocs.text).toContain('- `email` (preview + handle, fact)');
      expect(workerDocs.text).toContain('- `name` (value, data)');
      expect(workerDocs.text).toContain('- `notes` (value, data)');
    } finally {
      env.cleanup();
    }
  });

  it('appends the auth intent shape only when explicitly requested', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @sendEmail(recipient, subject, body) = "sent" with {
        controlArgs: ["recipient"]
      }

      /var tools @tools = {
        send_email: {
          mlld: @sendEmail,
          expose: ["recipient", "subject", "body"],
          optional: ["body"],
          description: "Send an outbound email"
        }
      }

      /var @docs = @toolDocs(@tools, { includeAuthIntentShape: true })
    `);

    try {
      const docs = await readVarData(env, 'docs') as string;
      expect(docs).toContain('Write tools (require authorization):');
      expect(docs).toContain('### send_email');
      expect(docs).toContain('- `recipient` (string, **control arg**)');
      expect(docs).toContain('- `subject` (string)');
      expect(docs).toContain('- `body` (string)');
      expect(docs).toContain('Authorization intent shape:');
      expect(docs).toContain('resolved: { tool: { arg: "<handle>" } }');
      expect(docs).toContain('known: { tool: { arg: "<value>" } }');
      expect(docs).toContain('allow: { tool: true }');
    } finally {
      env.cleanup();
    }
  });

  it('keeps updateArgs and exactPayloadArgs in JSON output while text stays canonical', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @updateDraft(id, subject, body) = "ok" with {
        controlArgs: ["id"],
        updateArgs: ["subject", "body"],
        exactPayloadArgs: ["subject"]
      }

      /var tools @tools = {
        update_draft: {
          mlld: @updateDraft,
          expose: ["id", "subject", "body"]
        }
      }

      /var @jsonDocs = @toolDocs(@tools, { format: "json" })
    `);

    try {
      const textDocs = await evaluateFyiTools(env.getVariable('tools')?.value, env);
      expect(textDocs.text).toContain('### update_draft');
      expect(textDocs.text).toContain('- `id` (string, **control arg**)');
      expect(textDocs.text).toContain('- `subject` (string)');
      expect(textDocs.text).toContain('- `body` (string)');

      const jsonDocs = await readVarData(env, 'jsonDocs') as {
        tools: Array<Record<string, unknown>>;
      };
      expect(jsonDocs.tools).toEqual([
        expect.objectContaining({
          name: 'update_draft',
          controlArgs: ['id'],
          updateArgs: ['subject', 'body'],
          exactPayloadArgs: ['subject'],
          dataArgs: []
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('renders source args in text and JSON output for read tools', async () => {
    const env = await interpretWithEnv(`
      /exe tool:r @extractDocument(source, question) = "Answer" with {
        sourceArgs: ["source"]
      }

      /var tools @tools = {
        extract_document: {
          mlld: @extractDocument,
          expose: ["source", "question"]
        }
      }

      /var @jsonDocs = @toolDocs(@tools, { format: "json" })
    `);

    try {
      const textDocs = await evaluateFyiTools(env.getVariable('tools')?.value, env);
      expect(textDocs.text).toContain('Read tools:');
      expect(textDocs.text).toContain('### extract_document');
      expect(textDocs.text).toContain('- `source` (string, **source arg**)');
      expect(textDocs.text).toContain('- `question` (string)');

      const jsonDocs = await readVarData(env, 'jsonDocs') as {
        helpers: { fyi_known: { available: boolean; reason: string } };
        tools: Array<Record<string, unknown>>;
      };
      expect(jsonDocs.helpers.fyi_known).toEqual({
        available: true,
        reason: 'write_tools_with_control_args_present'
      });
      expect(jsonDocs.tools).toEqual([
        expect.objectContaining({
          name: 'extract_document',
          kind: 'read',
          sourceArgs: ['source'],
          dataArgs: ['question'],
          discoveryCall: '@fyi.known("extract_document")'
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('includes output-field shapes in JSON tool docs when an output record is available', async () => {
    const env = await interpretWithEnv(`
      /record @contact = {
        facts: [email: string],
        data: [name: string],
        display: {
          role:planner: [name, { ref: "email" }]
        }
      }

      /exe tool:r @searchContacts(query) = "Ada" => contact

      /var tools @tools = {
        search_contacts: {
          mlld: @searchContacts,
          expose: ["query"]
        }
      }
    `);

    try {
      env.setScopedEnvironmentConfig({
        display: 'role:planner',
        tools: env.getVariable('tools')?.internal?.toolCollection as any
      } as any);

      const docs = await evaluateFyiTools(env.getVariable('tools')?.value, env, { format: 'json' });
      expect(docs.data).toMatchObject({
        tools: [
          expect.objectContaining({
            name: 'search_contacts',
            output: [
              { field: 'email', classification: 'fact', shape: 'value+handle' },
              { field: 'name', classification: 'data', shape: 'value' }
            ]
          })
        ]
      });
    } finally {
      env.cleanup();
    }
  });

  it('renders read-only tool sets instead of collapsing to empty output', async () => {
    const env = await interpretWithEnv(`
      /exe tool:r @lookupContact(query) = "Ada"

      /var tools @tools = {
        search_contacts_by_name: {
          mlld: @lookupContact,
          expose: ["query"],
          description: "Search contacts by name"
        }
      }
    `);

    try {
      const docs = await evaluateFyiTools(env.getVariable('tools')?.value, env);
      expect(docs.text).not.toContain('Write tools (require authorization):');
      expect(docs.text).toContain('Read tools:');
      expect(docs.text).toContain('### search_contacts_by_name');
      expect(docs.text).toContain('- `query` (string)');
    } finally {
      env.cleanup();
    }
  });

  it('uses stored collection metadata for imported tool collections without importing executables', async () => {
    const env = await interpretWithEnv(
      `
        /import { @writeTools } from "/tool-module.mld"
        /var @docs = @fyi.tools(@writeTools, { format: "json" })
      `,
      {
        '/tool-module.mld': `
          /exe tool:w @sendEmail(recipient, subject, body) = js { return subject; } with {
            controlArgs: ["recipient"]
          }

          /var tools @writeTools = {
            sendEmail: {
              mlld: @sendEmail,
              expose: ["recipient", "subject", "body"],
              description: "Send a message"
            }
          }

          /export { @writeTools }
        `
      }
    );

    try {
      expect(env.getVariable('sendEmail')).toBeUndefined();
      const docs = await readVarData(env, 'docs') as {
        tools: Array<Record<string, unknown>>;
      };
      expect(docs.tools).toEqual([
        expect.objectContaining({
          name: 'sendEmail',
          kind: 'write',
          description: 'Send a message',
          controlArgs: ['recipient'],
          dataArgs: ['subject', 'body'],
          discoveryCall: '@fyi.known("sendEmail")'
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('renders authorization notes as a separate injected block with bridge guidance', async () => {
    const env = await interpretWithEnv(`
      /record @send_email_inputs = {
        facts: [recipient: string],
        data: [subject: string, body: string],
        validate: "strict"
      }

      /exe tool:w @sendEmail(recipient, subject, body) = "sent"

      /var tools @tools = {
        send_email: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w", "exfil:send", "comm:w"]
        }
      }
    `);

    try {
      env.setPolicySummary(
        normalizePolicyConfig({
          authorizations: {
            can_authorize: {
              'role:planner': ['send_email']
            }
          } as any
        })!
      );
      env.setExeLabels(['llm', 'role:planner']);
      env.setScopedEnvironmentConfig({
        ...(env.getScopedEnvironmentConfig() ?? {}),
        tools: env.getVariable('tools')?.internal?.toolCollection as any
      } as any);
      const entry = resolveNamedOperationMetadata(env, 'send_email');
      expect(entry).toBeDefined();

      const notes = renderInjectedAuthorizationNotes({
        env,
        entries: [entry!]
      });

      expect(notes).toContain('<authorization_notes>');
      expect(notes).toContain('Tools you can authorize workers to use (you cannot call these directly):');
      expect(notes).toContain('See <tool_notes> for tools you can call directly.');
      expect(notes).toContain('### send_email');
      expect(notes).toContain('Facts:');
      expect(notes).toContain('- `recipient` (string)');
      expect(notes).toContain('To authorize, pass authorization intent to your worker tool:');
      expect(notes).toContain('{ resolved: { tool_name: { control_arg: handle } } }');
      expect(notes).toContain('</authorization_notes>');
    } finally {
      env.cleanup();
    }
  });

  it('includes record-based sections and instructions in JSON tool docs', async () => {
    const env = await interpretWithEnv(`
      /var @approvedRecipients = ["ada-recipient"]

      /record @send_email_inputs = {
        facts: [recipient: string, cc: string?],
        data: {
          trusted: [subject: string],
          untrusted: [body: string?]
        },
        exact: [subject],
        update: [body],
        allowlist: { recipient: @approvedRecipients },
        blocklist: { recipient: ["blocked-recipient"] },
        optional_benign: [cc],
        validate: "strict"
      }

      /exe tool:w @sendEmail(recipient, cc, subject, body) = "sent"

      /var tools @tools = {
        send_email: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w", "update:w", "exfil:send", "comm:w"],
          description: "Send an outbound email",
          instructions: "Prefer update_draft for in-progress composition."
        }
      }

      /var @jsonDocs = @toolDocs(@tools, { format: "json" })
    `);

    try {
      const docs = await readVarData(env, 'jsonDocs') as {
        tools: Array<Record<string, unknown>>;
      };
      expect(docs.tools).toEqual([
        expect.objectContaining({
          name: 'send_email',
          inputRecord: 'send_email_inputs',
          description: 'Send an outbound email',
          instructions: 'Prefer update_draft for in-progress composition.',
          controlArgs: ['recipient', 'cc'],
          factArgs: ['recipient', 'cc'],
          trustedDataArgs: ['subject'],
          untrustedDataArgs: ['body'],
          dataArgs: ['subject', 'body'],
          inputPolicy: {
            exact: ['subject'],
            update: ['body'],
            allowlist: {
              recipient: { kind: 'reference', name: 'approvedRecipients' }
            },
            blocklist: {
              recipient: { kind: 'array', values: ['blocked-recipient'] }
            },
            optionalBenign: ['cc']
          },
          discoveryCall: '@fyi.known("send_email")'
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('uses active llm-session metadata for the no-argument form and exposed MCP names', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @sendEmail(recipient, subject, body) = "sent" with {
        controlArgs: ["recipient"]
      }
      /var @toolList = [@sendEmail]
      /exe llm @agent(prompt, config) = @fyi.tools({ format: "json" })
      /var @docs = @agent("List tools", { tools: @toolList })
    `);

    try {
      const docs = await readVarData(env, 'docs') as {
        helpers: { fyi_known: { available: boolean; reason: string } };
        tools: Array<Record<string, unknown>>;
      };
      expect(docs.helpers.fyi_known).toEqual({
        available: true,
        reason: 'write_tools_with_control_args_present'
      });
      expect(docs.tools).toEqual([
        expect.objectContaining({
          name: 'send_email',
          kind: 'write',
          controlArgs: ['recipient'],
          dataArgs: ['subject', 'body'],
          discoveryCall: '@fyi.known("send_email")'
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('uses scoped executable arrays for no-argument tool docs with explicit auth intent shape', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @sendEmail(recipient, subject, body) = "sent" with {
        controlArgs: ["recipient"]
      }
    `);

    try {
      env.setScopedEnvironmentConfig({
        display: 'planner',
        tools: [env.getVariable('sendEmail') as any]
      } as any);

      const docs = await evaluateFyiTools({ includeAuthIntentShape: true }, env);
      expect(docs.text).toContain('Write tools (require authorization):');
      expect(docs.text).toContain('### send_email');
      expect(docs.text).toContain('- `recipient` (string, **control arg**)');
      expect(docs.text).toContain('- `subject` (string)');
      expect(docs.text).toContain('- `body` (string)');
      expect(docs.text).toContain('Authorization intent shape:');
    } finally {
      env.cleanup();
    }
  });

  it('classifies tools with no control args as read when policy does not mark them authorization-relevant', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createFile(filename, content) = "ok" with {
        controlArgs: []
      }

      /var tools @writeTools = {
        create_file: {
          mlld: @createFile,
          expose: ["filename", "content"],
          controlArgs: []
        }
      }
    `);

    try {
      const docs = await evaluateFyiTools(env.getVariable('writeTools')?.value, env);
      expect(docs.text).toContain('Read tools:');
      expect(docs.text).toContain('### create_file');
      expect(docs.text).toContain('- `filename` (string)');
      expect(docs.text).toContain('- `content` (string)');
      expect(docs.text).not.toContain('@fyi.known("create_file")');
      expect(docs.text).not.toContain('**control arg**');
    } finally {
      env.cleanup();
    }
  });
});
