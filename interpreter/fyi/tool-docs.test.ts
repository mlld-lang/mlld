import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { evaluateFyiTools } from '@interpreter/fyi/tool-docs';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { Environment } from '@interpreter/env/Environment';

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

  it('renders shaped tool collections with exposed names, visible params, and discovery calls', async () => {
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
      expect(docs.text).toContain('Write tools and control args:');
      expect(docs.text).toContain('| Tool | Description | Control Args | Discover Targets |');
      expect(docs.text).toContain('| outreach |  | recipient | @fyi.known("outreach") |');
      expect(docs.text).toContain('Use @fyi.known("toolName") to discover approved handle-bearing targets for control args.');
      expect(docs.text).toContain('Denied: (none)');
      expect(docs.text).not.toContain('owner');
      expect(docs.text).not.toContain('subject, body');
    } finally {
      env.cleanup();
    }
  });

  it('only renders same-source correlation guidance when correlateControlArgs is enabled', async () => {
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
      expect(docs.text).toContain('| update_scheduled_transaction |  | id, recipient (same source) | @fyi.known("update_scheduled_transaction") |');
      expect(docs.text).toContain('| send_email |  | recipients, cc, bcc | @fyi.known("send_email") |');
      expect(docs.text).not.toContain('recipients, cc, bcc (same source)');
    } finally {
      env.cleanup();
    }
  });

  it('renders descriptions for explicit @toolDocs() calls outside MCP context', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @sendEmail(recipient, subject) = "sent" with {
        controlArgs: ["recipient"]
      }
      /exe tool:r @lookupContact(query) = "Ada"

      /var tools @tools = {
        send_email: {
          mlld: @sendEmail,
          expose: ["recipient", "subject"],
          description: "Send an outbound email"
        },
        search_contacts_by_name: {
          mlld: @lookupContact,
          expose: ["query"],
          description: "Search contacts by name"
        }
      }

      /var @docs = @toolDocs(@tools)
    `);

    try {
      const docs = await readVarData(env, 'docs') as string;
      expect(docs).toContain('| Tool | Description | Control Args | Discover Targets |');
      expect(docs).toContain('| send_email | Send an outbound email | recipient | @fyi.known("send_email") |');
      expect(docs).toContain('Read tools:');
      expect(docs).toContain('| Tool | Description |');
      expect(docs).toContain('| search_contacts_by_name | Search contacts by name |');
      expect(docs).toContain('Denied: (none)');
      expect(docs).not.toContain('[CONTROL:');
    } finally {
      env.cleanup();
    }
  });

  it('renders full planner argument contracts for explicit non-MCP @toolDocs() calls', async () => {
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

      /var @docs = @toolDocs(@tools, { audience: "planner" })
    `);

    try {
      const docs = await readVarData(env, 'docs') as string;
      expect(docs).toContain('Write tools and argument contracts:');
      expect(docs).toContain('send_email');
      expect(docs).toContain('description: Send an outbound email');
      expect(docs).toContain('args: recipient, subject, body');
      expect(docs).toContain('control_args: recipient');
      expect(docs).toContain('payload_args: subject, body');
      expect(docs).toContain('optional_args: body');
      expect(docs).toContain('required_args: recipient, subject');
      expect(docs).toContain('Authorization intent:');
      expect(docs).not.toContain('| Tool | Description | Control Args |');
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
      expect(docs.text).not.toContain('Write tools and control args:');
      expect(docs.text).toContain('Read tools:');
      expect(docs.text).toContain('| search_contacts_by_name | Search contacts by name |');
      expect(docs.text).toContain('Denied: (none)');
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

  it('uses scoped executable arrays for no-argument planner tool docs outside MCP contexts', async () => {
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

      const docs = await evaluateFyiTools({ audience: 'planner' }, env);
      expect(docs.text).toContain('Write tools and argument contracts:');
      expect(docs.text).toContain('send_email');
      expect(docs.text).toContain('control_args: recipient');
      expect(docs.text).toContain('required_args: recipient, subject, body');
      expect(docs.text).toContain('Authorization intent:');
    } finally {
      env.cleanup();
    }
  });

  it('omits helper guidance when write tools have no control args', async () => {
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
      expect(docs.text).toContain('| create_file |  | (none) |  |');
      expect(docs.text).toContain('Denied: (none)');
      expect(docs.text).not.toContain('@fyi.known("create_file")');
      expect(docs.text).not.toContain('Use @fyi.known("toolName")');
    } finally {
      env.cleanup();
    }
  });
});
