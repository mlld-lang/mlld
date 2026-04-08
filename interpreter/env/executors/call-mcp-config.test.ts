import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import { fileURLToPath } from 'node:url';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import { normalizePolicyConfig } from '@core/policy/union';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable, VariableSource } from '@core/types/variable';
import { createCallMcpConfig, normalizeToolsArg } from './call-mcp-config';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { accessField } from '@interpreter/utils/field-access';
import { normalizeScopedShelfConfig } from '@interpreter/shelf/runtime';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

const SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'code',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new NodeFileSystem(), new PathService(), process.cwd());
}

const fakeServerPath = fileURLToPath(
  new URL('../../../tests/support/mcp/fake-server.cjs', import.meta.url)
);

function createFunctionTool(name: string, command = 'printf hello'): ExecutableVariable {
  return createExecutableVariable(name, 'command', command, [], 'sh', SOURCE);
}

async function createInterpretedEnv(
  source: string,
  options: { mcpServers?: Record<string, string> } = {}
): Promise<Environment> {
  let environment: Environment | undefined;
  await interpret(source.trim(), {
    fileSystem: new NodeFileSystem(),
    pathService: new PathService(),
    pathContext: {
      projectRoot: process.cwd(),
      fileDirectory: process.cwd(),
      executionDirectory: process.cwd(),
      invocationDirectory: process.cwd(),
      filePath: '/call-config-test.mld'
    },
    filePath: '/call-config-test.mld',
    format: 'markdown',
    mcpServers: options.mcpServers,
    captureEnvironment: env => {
      environment = env;
    }
  } as any);

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sendJsonRpcMaybeResponse(
  socketPath: string,
  payload: Record<string, unknown>,
  timeoutMs = 150
): Promise<Record<string, unknown> | null> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';
    const timeout = setTimeout(() => {
      socket.end();
      resolve(null);
    }, timeoutMs);

    socket.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }
      clearTimeout(timeout);
      const line = buffer.slice(0, newlineIndex).trim();
      socket.end();
      if (!line) {
        reject(new Error('Empty JSON-RPC response'));
        return;
      }
      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });

    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
  });
}

async function sendJsonRpc(
  socketPath: string,
  payload: Record<string, unknown>,
  timeoutMs = 150
): Promise<Record<string, unknown>> {
  const response = await sendJsonRpcMaybeResponse(socketPath, payload, timeoutMs);
  if (!response) {
    throw new Error('Empty JSON-RPC response');
  }
  return response;
}

async function getFunctionBridgeSocketPath(mcpConfigPath: string): Promise<string> {
  const configRaw = await fs.readFile(mcpConfigPath, 'utf8');
  const config = JSON.parse(configRaw) as {
    mcpServers: {
      mlld_tools: {
        env: { MLLD_FUNCTION_MCP_SOCKET: string };
      };
    };
  };
  return config.mcpServers.mlld_tools.env.MLLD_FUNCTION_MCP_SOCKET;
}

function getToolResultText(response: Record<string, unknown>): string {
  return String((response.result as any)?.content?.[0]?.text ?? '');
}

describe('createCallMcpConfig', () => {
  it('creates an empty strict MCP config for string tools outside a box', async () => {
    const env = createEnv();
    const result = await createCallMcpConfig({
      tools: ['Read', 'Write'],
      env
    });

    try {
      expect(result.inBox).toBe(false);
      expect(result.mcpConfigPath).not.toBe('');
      expect(result.toolsCsv).toBe('Read,Write');
      expect(result.availableTools).toEqual([{ name: 'Read' }, { name: 'Write' }]);
      expect(await fileExists(result.mcpConfigPath)).toBe(true);

      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers?: Record<string, unknown>;
      };
      expect(config.mcpServers).toEqual({});
    } finally {
      const configPath = result.mcpConfigPath;
      await result.cleanup();
      expect(await fileExists(configPath)).toBe(false);
      env.cleanup();
    }
  });

  it('creates an empty strict MCP config for explicit empty tool lists', async () => {
    const env = createEnv();
    const result = await createCallMcpConfig({
      tools: [],
      env
    });

    try {
      expect(result.inBox).toBe(false);
      expect(result.mcpConfigPath).not.toBe('');
      expect(result.toolsCsv).toBe('');
      expect(result.availableTools).toEqual([]);
      expect(result.nativeAllowedTools).toBe('');
      expect(result.unifiedAllowedTools).toBe('');
      expect(await fileExists(result.mcpConfigPath)).toBe(true);

      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers?: Record<string, unknown>;
      };
      expect(config.mcpServers).toEqual({});
    } finally {
      const configPath = result.mcpConfigPath;
      await result.cleanup();
      expect(await fileExists(configPath)).toBe(false);
      env.cleanup();
    }
  });

  it('creates a function MCP config outside a box for mixed tools', async () => {
    const env = createEnv();
    const functionTool = createFunctionTool('sayHi');
    const result = await createCallMcpConfig({
      tools: ['Read', functionTool],
      env
    });

    try {
      expect(result.inBox).toBe(false);
      expect(result.mcpConfigPath).not.toBe('');
      expect(result.toolsCsv).toBe('Read,sayHi');
      expect(result.availableTools).toEqual([{ name: 'Read' }, { name: 'say_hi' }]);
      expect(await fileExists(result.mcpConfigPath)).toBe(true);

      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers?: Record<string, unknown>;
      };
      expect(Object.keys(config.mcpServers ?? {})).toEqual(['mlld_tools']);
    } finally {
      const configPath = result.mcpConfigPath;
      await result.cleanup();
      if (configPath) {
        expect(await fileExists(configPath)).toBe(false);
      }
      env.cleanup();
    }
  });

  it('auto-provisions shelve for writable shelf scopes and constrains slot aliases', async () => {
    const env = await createInterpretedEnv([
      '/record @contact = {',
      '  key: id,',
      '  data: [id: string, email: string, name: string]',
      '}',
      '/shelf @outreach = {',
      '  recipients: contact[]',
      '}'
    ].join('\n'));

    const outreach = env.getVariable('outreach');
    if (!outreach) {
      env.cleanup();
      throw new Error('Expected @outreach to be defined');
    }

    const recipientsRef = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
    const scopedEnv = env.createChild();
    const scope = await normalizeScopedShelfConfig({
      write: [{ alias: 'things', value: recipientsRef }]
    }, env);
    scopedEnv.setScopedEnvironmentConfig({ shelf: scope });

    const result = await createCallMcpConfig({
      tools: [createFunctionTool('ping')],
      env: scopedEnv
    });

    try {
      expect(result.availableTools).toEqual([
        { name: 'ping' },
        { name: 'shelve' }
      ]);

      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);
      const listed = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/list',
        params: {}
      });
      const tools = ((listed.result as any)?.tools ?? []) as Array<{
        name?: string;
        description?: string;
        inputSchema?: {
          properties?: Record<string, { enum?: string[] }>;
          required?: string[];
        };
      }>;
      expect(tools.map(tool => tool.name)).toEqual(['ping', 'shelve']);

      const shelve = tools.find(tool => tool.name === 'shelve');
      expect(shelve?.description).toContain('Writable aliases: things');
      expect(shelve?.description).not.toContain('@outreach.recipients');
      expect(shelve?.description).not.toContain('->');
      expect(shelve?.inputSchema?.properties?.slot_alias?.enum).toEqual(['things']);
      expect(shelve?.inputSchema?.required ?? []).toEqual(['slot_alias', 'value']);

      const called = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'shelve',
          arguments: {
            slot_alias: 'things',
            value: {
              id: 'c_1',
              email: 'ada@example.com',
              name: 'Ada'
            }
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      const stored = env.readShelfSlot('outreach', 'recipients');
      const storedItems = Array.isArray(stored) ? stored : asData<any[]>(stored);
      expect(storedItems).toHaveLength(1);
      const firstStored = isStructuredValue(storedItems[0])
        ? asData<Record<string, any>>(storedItems[0])
        : storedItems[0] as Record<string, any>;
      expect(asData(firstStored.id)).toBe('c_1');

      const denied = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'shelve',
          arguments: {
            slot_alias: 'nope',
            value: {
              id: 'c_2',
              email: 'bob@example.com',
              name: 'Bob'
            }
          }
        }
      });

      expect((denied.result as any)?.isError).toBe(true);
      expect(getToolResultText(denied)).toContain("Unknown writable slot alias 'nope'");
    } finally {
      await result.cleanup();
      scopedEnv.cleanup();
      env.cleanup();
    }
  });

  it('accepts tool collections and carries shaped schemas plus injected tool notes', async () => {
    const env = await createInterpretedEnv([
      '/exe tool:w @sendEmail(owner, recipient, subject, body) = "sent" with {',
      '  controlArgs: ["owner", "recipient"]',
      '}',
      '/exe tool:r @searchContactsByName(query) = "Ada"',
      '',
      '/var tools @writeTools = {',
      '  outboundEmail: {',
      '    mlld: @sendEmail,',
      '    bind: { owner: "mlld" },',
      '    expose: ["recipient", "subject", "body"],',
      '    optional: ["body"],',
      '    controlArgs: ["recipient"],',
      '    description: "Send an outbound email"',
      '  },',
      '  searchContactsByName: {',
      '    mlld: @searchContactsByName,',
      '    expose: ["query"],',
      '    description: "Search contacts by name"',
      '  }',
      '}'
    ].join('\n'));

    let toolCollection = await extractVariableValue(env.getVariable('writeTools') as any, env);
    if (isStructuredValue(toolCollection)) {
      toolCollection = asData(toolCollection);
    }

    const result = await createCallMcpConfig({
      tools: toolCollection,
      env
    });

    try {
      expect(result.toolsCsv).toBe('outboundEmail,searchContactsByName,known');
      expect(result.availableTools).toEqual([
        { name: 'outbound_email' },
        { name: 'search_contacts_by_name' },
        { name: 'known' }
      ]);
      expect(result.toolNotes).toContain('<tool_notes>');
      expect(result.toolNotes).toContain('| Tool | Control Args | Discover Targets |');
      expect(result.toolNotes).toContain('| outbound_email | recipient | @fyi.known("outbound_email") |');
      expect(result.toolNotes).toContain('Use @fyi.known("toolName") to discover approved handle-bearing targets for control args.');
      expect(result.toolNotes).toContain('Read tools: search_contacts_by_name');
      expect(result.toolNotes).toContain('Denied: (none)');
      expect(result.toolNotes).not.toContain('Send an outbound email');
      expect(result.toolNotes).not.toContain('| Tool | Description |');
      expect(result.toolNotes).not.toContain('Search contacts by name');

      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);
      const listed = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/list',
        params: {}
      });
      const tools = ((listed.result as any)?.tools ?? []) as Array<{
        name?: string;
        description?: string;
        inputSchema?: {
          properties?: Record<string, unknown>;
          required?: string[];
        };
      }>;
      const outbound = tools.find(tool => tool.name === 'outbound_email');
      expect(outbound).toBeDefined();
      expect(Object.keys(outbound?.inputSchema?.properties ?? {})).toEqual(['recipient', 'subject', 'body']);
      expect(outbound?.inputSchema?.required ?? []).toEqual(['recipient', 'subject']);
      expect(outbound?.description).toContain('Send an outbound email [CONTROL: recipient]');
      expect(outbound?.description).not.toContain('@fyi.known("outbound_email")');
      expect(outbound?.description).not.toContain('DATA args (payload)');
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('serves @fyi.known through the generated function MCP bridge', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = { facts: [email: string] }',
        '/exe @emitContact() = js { return { email: "ada@example.com" }; } => contact',
        '/var @contact = @emitContact()',
        '/var @toolList = [@fyi.known]'
      ].join('\n')
    );

    const contact = env.getVariable('contact');
    if (!contact) {
      throw new Error('Expected @contact to be defined');
    }
    const email = await accessField(contact.value, { type: 'field', value: 'email' } as any, { env });
    env.issueHandle(email, {
      preview: 'a***@example.com',
      metadata: { field: 'email' }
    });

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      expect(result.inBox).toBe(false);
      expect(result.mcpConfigPath).not.toBe('');
      expect(result.toolsCsv).toBe('known');
      expect(result.availableTools).toEqual([{ name: 'known' }]);

      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_tools: {
            env: { MLLD_FUNCTION_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_tools.env.MLLD_FUNCTION_MCP_SOCKET;

      const listed = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });
      const tools = ((listed.result as any)?.tools ?? []) as Array<{
        name?: string;
        inputSchema?: { properties?: Record<string, unknown> };
      }>;
      expect(tools.map(tool => tool.name)).toContain('known');
      const knownSchema = tools.find(tool => tool.name === 'known')?.inputSchema;
      expect(Object.keys(knownSchema?.properties ?? {})).toEqual(['query']);

      const called = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'known',
          arguments: {
            query: { op: 'op:named:email.send', arg: 'recipient' }
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      const text = String((called.result as any)?.content?.[0]?.text ?? '');
      const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
      expect(parsed).toEqual([
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'a***@example.com',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ]);

      const grouped = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'known',
          arguments: {
            query: 'email.send'
          }
        }
      });

      expect((grouped.result as any)?.isError).not.toBe(true);
      const groupedText = String((grouped.result as any)?.content?.[0]?.text ?? '');
      const groupedParsed = JSON.parse(groupedText) as Record<string, Array<Record<string, unknown>>>;
      expect(Object.keys(groupedParsed).sort()).toEqual(['bcc', 'cc', 'recipient', 'recipients']);
      for (const argName of ['recipient', 'recipients', 'cc', 'bcc']) {
        expect(groupedParsed[argName]).toEqual([
          {
            handle: expect.stringMatching(HANDLE_RE),
            label: 'a***@example.com',
            field: 'email',
            fact: 'fact:@contact.email'
          }
        ]);
      }
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('injects update and exact-payload annotations into bridge tool descriptions', async () => {
    const env = await createInterpretedEnv([
      '/exe tool:w @updateDraft(id, subject, body) = "ok" with {',
      '  controlArgs: ["id"],',
      '  updateArgs: ["subject", "body"],',
      '  exactPayloadArgs: ["subject"]',
      '}',
      '',
      '/var tools @draftTools = {',
      '  updateDraft: {',
      '    mlld: @updateDraft,',
      '    expose: ["id", "subject", "body"],',
      '    description: "Update a draft"',
      '  }',
      '}'
    ].join('\n'));

    let toolCollection = await extractVariableValue(env.getVariable('draftTools') as any, env);
    if (isStructuredValue(toolCollection)) {
      toolCollection = asData(toolCollection);
    }

    const result = await createCallMcpConfig({
      tools: toolCollection,
      env
    });

    try {
      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);
      const listed = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/list',
        params: {}
      });
      const tools = ((listed.result as any)?.tools ?? []) as Array<{
        name?: string;
        description?: string;
      }>;
      const updateDraft = tools.find(tool => tool.name === 'update_draft');
      expect(updateDraft?.description).toContain('Update a draft [CONTROL: id]');
      expect(updateDraft?.description).toContain('[UPDATE: subject, body]');
      expect(updateDraft?.description).toContain('[EXACT PAYLOAD: subject (must appear in user task)]');
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('serializes display-projected record results through the generated function MCP bridge', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = {',
        '  facts: [email: string, name: string],',
        '  data: [notes: string?],',
        '  display: [name, { mask: "email" }]',
        '}',
        '/exe @search_contacts(query) = js {',
        '  return { email: "mark@example.com", name: "Mark Davies", notes: "Met at conference" };',
        '} => contact',
        '/var @toolList = [@search_contacts]'
      ].join('\n')
    );

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_tools: {
            env: { MLLD_FUNCTION_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_tools.env.MLLD_FUNCTION_MCP_SOCKET;

      const response = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: {
          name: 'search_contacts',
          arguments: {
            query: 'Mark'
          }
        }
      });

      expect((response.result as any)?.isError).not.toBe(true);
      const text = String((response.result as any)?.content?.[0]?.text ?? '');
      expect(JSON.parse(text)).toEqual({
        name: 'Mark Davies',
        email: {
          preview: 'm***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
      });
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('implicitly adds @fyi.known for write-tool MCP bridges and discovers prior projected handles', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = {',
        '  facts: [email: string, name: string],',
        '  display: [name, { mask: "email" }]',
        '}',
        '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
        '/var @toolList = [@search_contacts, @send_email]'
      ].join('\n')
    );

    env.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { 'exfil:send': ['tool:w'] }
      })!
    );

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      expect(result.availableTools).toEqual([
        { name: 'search_contacts' },
        { name: 'send_email' },
        { name: 'known' }
      ]);

      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_tools: {
            env: { MLLD_FUNCTION_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_tools.env.MLLD_FUNCTION_MCP_SOCKET;

      const search = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'search_contacts',
          arguments: {
            query: 'Mark'
          }
        }
      });

      expect((search.result as any)?.isError).not.toBe(true);

      const known = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'known',
          arguments: {
            query: { op: 'send_email', arg: 'recipient' }
          }
        }
      });

      expect((known.result as any)?.isError).not.toBe(true);
      const text = String((known.result as any)?.content?.[0]?.text ?? '');
      const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
      expect(parsed).toEqual([
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'm***@example.com',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ]);
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('lets a planner reuse projected result handles without a separate facts lookup', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = {',
        '  facts: [email: string, name: string],',
        '  display: [name, { mask: "email" }]',
        '}',
        '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
        '/var @toolList = [@search_contacts, @send_email]'
      ].join('\n')
    );

    env.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { 'exfil:send': ['tool:w'] }
      })!
    );

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);

      const search = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'search_contacts',
          arguments: { query: 'Mark' }
        }
      });

      expect((search.result as any)?.isError).not.toBe(true);
      const searchText = String((search.result as any)?.content?.[0]?.text ?? '');
      const projected = JSON.parse(searchText) as {
        name?: string;
        email?: {
          preview?: string;
          handle?: string;
        };
      };
      expect(projected).toEqual({
        name: 'Mark Davies',
        email: {
          preview: 'm***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
      });

      const send = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: projected.email?.handle,
            subject: 'hi',
            body: 'hello'
          }
        }
      });

      expect((send.result as any)?.isError).not.toBe(true);
      expect(getToolResultText(send)).toBe('sent:mark@example.com:hi');
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('does not authorize masked preview strings for security-relevant tool args without handles', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = {',
        '  facts: [email: string, name: string],',
        '  display: [name, { mask: "email" }]',
        '}',
        '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
        '/var @toolList = [@search_contacts, @send_email]'
      ].join('\n')
    );

    env.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { 'exfil:send': ['tool:w'] }
      })!
    );

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);

      const search = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'search_contacts',
          arguments: { query: 'Mark' }
        }
      });
      expect((search.result as any)?.isError).not.toBe(true);

      const send = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 33,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: 'm***@example.com',
            subject: 'hi',
            body: 'hello'
          }
        }
      });

      expect((send.result as any)?.isError).toBe(true);
      expect(getToolResultText(send)).toMatch(/destination must carry 'known'/i);
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('does not authorize emitted bare literals for security-relevant tool args without handles', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = {',
        '  facts: [email: string, name: string],',
        '  display: [name, email]',
        '}',
        '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
        '/var @toolList = [@search_contacts, @send_email]'
      ].join('\n')
    );

    env.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { 'exfil:send': ['tool:w'] }
      })!
    );

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);

      const search = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 34,
        method: 'tools/call',
        params: {
          name: 'search_contacts',
          arguments: { query: 'Mark' }
        }
      });
      expect((search.result as any)?.isError).not.toBe(true);

      const send = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 35,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: 'mark@example.com',
            subject: 'hi',
            body: 'hello'
          }
        }
      });

      expect((send.result as any)?.isError).toBe(true);
      expect(getToolResultText(send)).toMatch(/destination must carry 'known'/i);
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('fails closed on ambiguous masked previews with policy denial and handle guidance', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = {',
        '  facts: [email: string],',
        '  display: [{ mask: "email" }]',
        '}',
        '/exe @search_contacts(query) = js { return [',
        '  { email: "sarah@company.com" },',
        '  { email: "steve@company.com" }',
        ']; } => contact',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
        '/var @toolList = [@search_contacts, @send_email]'
      ].join('\n')
    );

    env.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { 'exfil:send': ['tool:w'] }
      })!
    );

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);

      const search = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 36,
        method: 'tools/call',
        params: {
          name: 'search_contacts',
          arguments: { query: 's' }
        }
      });
      expect((search.result as any)?.isError).not.toBe(true);

      const send = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 37,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: 's***@company.com',
            subject: 'hi',
            body: 'hello'
          }
        }
      });

      expect((send.result as any)?.isError).toBe(true);
      expect(getToolResultText(send)).toMatch(/destination must carry 'known'/i);
      expect(getToolResultText(send)).toMatch(/projected handle/i);
      expect(getToolResultText(send)).not.toMatch(/ambiguous projected value/i);
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('does not canonicalize literals for handle-only projected fields', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = {',
        '  facts: [email: string],',
        '  display: []',
        '}',
        '/exe @search_contacts(query) = js { return { email: "mark@example.com" }; } => contact',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
        '/var @toolList = [@search_contacts, @send_email]'
      ].join('\n')
    );

    env.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { 'exfil:send': ['tool:w'] }
      })!
    );

    let toolList = await extractVariableValue(env.getVariable('toolList') as any, env);
    if (isStructuredValue(toolList)) {
      toolList = asData(toolList);
    }
    const normalizedToolList = normalizeToolsArg(toolList);
    if (!Array.isArray(normalizedToolList)) {
      env.cleanup();
      throw new Error('Failed to load @toolList');
    }

    const result = await createCallMcpConfig({
      tools: normalizedToolList,
      env
    });

    try {
      const socketPath = await getFunctionBridgeSocketPath(result.mcpConfigPath);

      const search = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 38,
        method: 'tools/call',
        params: {
          name: 'search_contacts',
          arguments: { query: 'Mark' }
        }
      });
      expect((search.result as any)?.isError).not.toBe(true);

      const send = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 39,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: 'mark@example.com',
            subject: 'hi',
            body: 'hello'
          }
        }
      });

      expect((send.result as any)?.isError).toBe(true);
      expect(getToolResultText(send)).toMatch(/destination must carry 'known'/i);
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('throws for unknown VFS tools inside a box', async () => {
    const env = createEnv();
    env.pushBridge({
      mcpConfigPath: '/tmp/mock-vfs-config.json',
      socketPath: '/tmp/mock-vfs.sock',
      cleanup: async () => {}
    });

    try {
      await expect(
        createCallMcpConfig({
          tools: ['NotAVfsTool'],
          env
        })
      ).rejects.toThrow(/Unknown VFS tool/);
    } finally {
      env.popBridge();
      env.cleanup();
    }
  });

  it('throws on MCP name collisions between builtin and function tools', async () => {
    const env = createEnv();
    const functionTool = createFunctionTool('Read');

    try {
      await expect(
        createCallMcpConfig({
          tools: ['read', functionTool],
          env
        })
      ).rejects.toThrow(/Tool name collisions detected/);
    } finally {
      env.cleanup();
    }
  });

  it('does not respond to notifications on the filtered VFS bridge', async () => {
    const env = createEnv();
    env.pushBridge({
      mcpConfigPath: '/tmp/mock-vfs-config.json',
      socketPath: '/tmp/mock-vfs.sock',
      cleanup: async () => {}
    });

    const result = await createCallMcpConfig({
      tools: ['Read'],
      env
    });

    try {
      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_vfs: {
            env: { MLLD_FILTERED_VFS_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_vfs.env.MLLD_FILTERED_VFS_MCP_SOCKET;

      const response = await sendJsonRpcMaybeResponse(socketPath, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      });

      expect(response).toBeNull();
    } finally {
      await result.cleanup();
      env.popBridge();
      env.cleanup();
    }
  });

  it('applies scoped policies to imported MCP-backed wrapper tools on the generated call config path', async () => {
    const env = await createInterpretedEnv(
      [
        '/import tools from mcp "tools" as @mcp',
        '',
        '/exe known @get_recipient() = [',
        '  => @mcp.echo("legit@example.com")',
        ']',
        '',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = [',
        '  => @mcp.sendEmail([@recipient], @subject, @body, [], [], [])',
        '] with { controlArgs: ["recipient"] }'
      ].join('\n'),
      {
        mcpServers: {
          tools: `${process.execPath} ${fakeServerPath}`
        }
      }
    );

    const scopedEnv = env.createChild();
    scopedEnv.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-send-to-unknown'] },
        operations: { destructive: ['tool:w'] }
      })!
    );

    const getRecipient = env.getVariable('get_recipient') as ExecutableVariable | undefined;
    const sendEmail = env.getVariable('send_email') as ExecutableVariable | undefined;

    if (!getRecipient || !sendEmail) {
      env.cleanup();
      throw new Error('Failed to load imported MCP-backed wrappers');
    }

    const result = await createCallMcpConfig({
      tools: [getRecipient, sendEmail],
      env: scopedEnv
    });

    try {
      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_tools: {
            env: { MLLD_FUNCTION_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_tools.env.MLLD_FUNCTION_MCP_SOCKET;

      const listed = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });
      const tools = ((listed.result as any)?.tools ?? []) as Array<{ name?: string }>;
      const getRecipientTool = tools.find(tool => tool.name === 'get_recipient')?.name;
      const sendEmailTool = tools.find(tool => tool.name === 'send_email')?.name;

      expect(getRecipientTool).toBeDefined();
      expect(sendEmailTool).toBeDefined();

      const trustedLookup = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: getRecipientTool,
          arguments: {}
        }
      });
      expect((trustedLookup.result as any)?.isError).not.toBe(true);

      const deniedSend = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: sendEmailTool,
          arguments: {
            recipient: 'evil@example.com',
            subject: 'hi',
            body: 'body'
          }
        }
      });

      expect((deniedSend.result as any)?.isError).toBe(true);
      expect(((deniedSend.result as any)?.content?.[0]?.text ?? '')).toMatch(/no-send-to-unknown|must carry 'known'/i);
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });

  it('applies no-untrusted-destructive after MCP-backed wrapper reads on the generated call config path', async () => {
    const env = await createInterpretedEnv(
      [
        '/import tools from mcp "tools" as @mcp',
        '',
        '/exe untrusted @read_file(path) = [',
        '  => @mcp.echo("ATTACKER-CONTROLLED")',
        ']',
        '',
        '/exe exfil:send, tool:w @send_email(recipient, subject, body) = [',
        '  => @mcp.sendEmail([@recipient], @subject, @body, [], [], [])',
        '] with { controlArgs: ["recipient"] }'
      ].join('\n'),
      {
        mcpServers: {
          tools: `${process.execPath} ${fakeServerPath}`
        }
      }
    );

    const scopedEnv = env.createChild();
    scopedEnv.setPolicySummary(
      normalizePolicyConfig({
        defaults: { rules: ['no-untrusted-destructive'] },
        operations: { destructive: ['tool:w'] }
      })!
    );

    const readFile = env.getVariable('read_file') as ExecutableVariable | undefined;
    const sendEmail = env.getVariable('send_email') as ExecutableVariable | undefined;

    if (!readFile || !sendEmail) {
      env.cleanup();
      throw new Error('Failed to load imported MCP-backed wrappers');
    }

    const result = await createCallMcpConfig({
      tools: [readFile, sendEmail],
      env: scopedEnv
    });

    try {
      const configRaw = await fs.readFile(result.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_tools: {
            env: { MLLD_FUNCTION_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_tools.env.MLLD_FUNCTION_MCP_SOCKET;

      const taintedRead = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'read_file',
          arguments: { path: '/tmp/prompt.txt' }
        }
      });
      expect((taintedRead.result as any)?.isError).not.toBe(true);

      const deniedSend = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: 'victim@example.com',
            subject: 'hi',
            body: 'body'
          }
        }
      });

      expect((deniedSend.result as any)?.isError).toBe(true);
      expect(((deniedSend.result as any)?.content?.[0]?.text ?? '')).toMatch(/no-untrusted-destructive|untrusted/i);
    } finally {
      await result.cleanup();
      env.cleanup();
    }
  });
});
