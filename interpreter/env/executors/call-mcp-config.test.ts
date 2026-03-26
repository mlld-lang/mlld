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

describe('createCallMcpConfig', () => {
  it('returns no config for string tools outside a box', async () => {
    const env = createEnv();
    const result = await createCallMcpConfig({
      tools: ['Read', 'Write'],
      env
    });

    try {
      expect(result.inBox).toBe(false);
      expect(result.mcpConfigPath).toBe('');
      expect(result.toolsCsv).toBe('Read,Write');
    } finally {
      await result.cleanup();
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

  it('serves @fyi.facts through the generated function MCP bridge', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = { facts: [email: string] }',
        '/exe @emitContact() = js { return { email: "ada@example.com" }; } => contact',
        '/var @contact = @emitContact()',
        '/var @toolList = [@fyi.facts]'
      ].join('\n')
    );

    const scopedConfig = env.getScopedEnvironmentConfig() ?? {};
    const contact = env.getVariable('contact');
    env.setScopedEnvironmentConfig({
      ...scopedConfig,
      fyi: { facts: [contact] }
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
      expect(result.toolsCsv).toBe('facts');

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
      expect(tools.map(tool => tool.name)).toContain('facts');
      const factsSchema = tools.find(tool => tool.name === 'facts')?.inputSchema;
      expect(Object.keys(factsSchema?.properties ?? {})).toEqual(['query']);

      const called = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'facts',
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
          name: 'facts',
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

  it('discovers auto fact roots from prior native tool results in the same MCP session', async () => {
    const env = await createInterpretedEnv(
      [
        '/record @contact = { facts: [email: string, name: string] }',
        '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
        '/var @toolList = [@search_contacts, @fyi.facts]'
      ].join('\n')
    );

    const scopedConfig = env.getScopedEnvironmentConfig() ?? {};
    env.setScopedEnvironmentConfig({
      ...scopedConfig,
      fyi: { autoFacts: true }
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

      const facts = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'facts',
          arguments: {}
        }
      });

      expect((facts.result as any)?.isError).not.toBe(true);
      const text = String((facts.result as any)?.content?.[0]?.text ?? '');
      const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
      expect(parsed).toEqual([
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'Mark Davies',
          field: 'email',
          fact: 'fact:@contact.email'
        },
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'name value',
          field: 'name',
          fact: 'fact:@contact.name'
        }
      ]);
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
