import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import { fileURLToPath } from 'url';
import { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { normalizePolicyConfig } from '@core/policy/union';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import type { ExecutableVariable, VariableSource } from '@core/types/variable';
import { mlldNameToMCPName } from '@core/mcp/names';
import { createFunctionMcpBridge } from './function-mcp-bridge';

const fakeServerPath = fileURLToPath(
  new URL('../../../tests/support/mcp/fake-server.cjs', import.meta.url)
);

const SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'code',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new NodeFileSystem(), new PathService(), process.cwd());
}

async function createInterpretedEnv(source: string): Promise<Environment> {
  let environment: Environment | undefined;
  await interpret(source.trim(), {
    fileSystem: new NodeFileSystem(),
    pathService: new PathService(),
    pathContext: {
      projectRoot: process.cwd(),
      fileDirectory: process.cwd(),
      executionDirectory: process.cwd(),
      invocationDirectory: process.cwd(),
      filePath: '/bridge-test.mld'
    },
    filePath: '/bridge-test.mld',
    format: 'markdown',
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

function createFunctionTool(name: string, command = 'printf hello'): ExecutableVariable {
  return {
    type: 'executable',
    name,
    value: {
      type: 'command',
      template: command,
      language: 'sh'
    },
    paramNames: [],
    mx: {},
    internal: {}
  } as ExecutableVariable;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sendJsonRpc(
  socketPath: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await sendJsonRpcMaybeResponse(socketPath, payload);
  if (!response) {
    throw new Error('Empty JSON-RPC response');
  }
  return response;
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

describe('createFunctionMcpBridge', () => {
  it('exposes function tools and executes tool calls over MCP socket', async () => {
    const env = createEnv();
    const functionTool = createFunctionTool('sayHi');
    const mcpName = mlldNameToMCPName(functionTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([[mcpName, functionTool]])
    });

    try {
      expect(bridge.mcpConfigPath).not.toBe('');
      expect(bridge.socketPath).not.toBe('');
      expect(await fileExists(bridge.mcpConfigPath)).toBe(true);

      const listed = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });
      const names = ((listed.result as any)?.tools ?? []).map((tool: any) => tool.name);
      expect(names).toContain(mcpName);

      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: mcpName,
          arguments: {}
        }
      });
      expect((called.result as any)?.isError).not.toBe(true);
      const content = (called.result as any)?.content ?? [];
      expect(Array.isArray(content)).toBe(true);
      expect(content[0]?.type).toBe('text');
    } finally {
      const configPath = bridge.mcpConfigPath;
      await bridge.cleanup();
      expect(await fileExists(configPath)).toBe(false);
      env.cleanup();
    }
  });

  it('returns an empty config when no functions are provided', async () => {
    const env = createEnv();
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map()
    });

    try {
      expect(bridge.socketPath).toBe('');
      expect(await fileExists(bridge.mcpConfigPath)).toBe(true);
      const configRaw = await fs.readFile(bridge.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as { mcpServers?: Record<string, unknown> };
      expect(config.mcpServers).toEqual({});
    } finally {
      const configPath = bridge.mcpConfigPath;
      await bridge.cleanup();
      expect(await fileExists(configPath)).toBe(false);
      env.cleanup();
    }
  });

  it('preserves provided tool definitions in schemas and appends per-tool notes', async () => {
    const env = await createInterpretedEnv(`
      /exe tool:w @sendEmail(owner, recipient, subject, body) = \`sent:@subject\` with {
        controlArgs: ["owner", "recipient"]
      }
    `);
    const functionTool = env.getVariable('sendEmail') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['outbound_email', functionTool]]),
      toolDefinitions: new Map([[
        'outbound_email',
        {
          mlld: 'sendEmail',
          bind: { owner: 'mlld' },
          expose: ['recipient', 'subject', 'body'],
          optional: ['body'],
          controlArgs: ['recipient'],
          description: 'Send an outbound email'
        }
      ]]),
      sessionId: 'test-session'
    });

    try {
      const listed = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 99,
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
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('does not respond to notifications', async () => {
    const env = createEnv();
    const functionTool = createFunctionTool('sayHi');
    const mcpName = mlldNameToMCPName(functionTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([[mcpName, functionTool]])
    });

    try {
      const response = await sendJsonRpcMaybeResponse(bridge.socketPath, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      });

      expect(response).toBeNull();
    } finally {
      const configPath = bridge.mcpConfigPath;
      await bridge.cleanup();
      expect(await fileExists(configPath)).toBe(false);
      env.cleanup();
    }
  });

  it('preserves exposed tool names for policy.authorizations on the bridge path', async () => {
    const env = await createInterpretedEnv(`
      /exe tool:w @sendMoney(recipient, amount) = \`sent:@amount\` with { controlArgs: ["recipient"] }
    `);
    env.setPolicySummary(normalizePolicyConfig({
      authorizations: {
        allow: {
          send_money_alias: {
            args: {
              recipient: 'acct-1'
            }
          }
        }
      }
    })!);

    const functionTool = env.getVariable('sendMoney') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['send_money_alias', functionTool]])
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'send_money_alias',
          arguments: {
            recipient: 'acct-1',
            amount: 25
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toBe('sent:25');
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('rejects unconstrained policy.authorizations on the bridge path when exe controlArgs are declared', async () => {
    const env = await createInterpretedEnv(`
      /exe tool:w @sendMoney(recipient, amount) = \`sent:@amount\` with { controlArgs: ["recipient"] }
    `);
    env.setPolicySummary(normalizePolicyConfig({
      authorizations: {
        allow: {
          send_money: true
        }
      }
    })!);

    const functionTool = env.getVariable('sendMoney') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['send_money', functionTool]])
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'send_money',
          arguments: {
            recipient: 'acct-1',
            amount: 25
          }
        }
      });

      expect((called.result as any)?.isError).toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toMatch(/cannot use true in policy\.authorizations/i);
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('enforces scoped no-send-to-unknown policies for MCP-backed wrapper exes on the bridge path', async () => {
    const env = await createInterpretedEnv([
      `/import tools from mcp "${process.execPath} ${fakeServerPath}" as @mcp`,
      '/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = [',
      '  => @mcp.sendEmail([@recipient], @subject, @body, [], [], [])',
      '] with { controlArgs: ["recipient"] }'
    ].join('\n'));

    const scopedEnv = env.createChild();
    scopedEnv.setPolicySummary(normalizePolicyConfig({
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w'] }
    })!);

    const functionTool = scopedEnv.getVariable('sendEmail') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env: scopedEnv,
      functions: new Map([['send_email', functionTool]])
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: 'evil@example.com',
            subject: 'hi',
            body: 'test'
          }
        }
      });

      expect((called.result as any)?.isError).toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toMatch(/destination must carry 'known'/i);
    } finally {
      await bridge.cleanup();
      scopedEnv.cleanup();
      env.cleanup();
    }
  });
});
