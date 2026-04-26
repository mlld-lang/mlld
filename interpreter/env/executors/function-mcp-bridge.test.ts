import { describe, expect, it } from 'vitest';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
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

async function sendJsonRpcBatch(
  socketPath: string,
  payloads: Array<Record<string, unknown>>,
  timeoutMs = 1000
): Promise<Array<Record<string, unknown>>> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const responses: Array<Record<string, unknown>> = [];
    let buffer = '';
    const timeout = setTimeout(() => {
      socket.end();
      reject(new Error('Timed out waiting for JSON-RPC batch responses'));
    }, timeoutMs);

    const finish = (error?: unknown) => {
      clearTimeout(timeout);
      socket.end();
      if (error) {
        reject(error);
        return;
      }
      resolve(responses);
    };

    socket.once('error', error => {
      finish(error);
    });
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            responses.push(JSON.parse(line) as Record<string, unknown>);
          } catch (error) {
            finish(error);
            return;
          }
        }
        if (responses.length === payloads.length) {
          finish();
          return;
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });

    socket.once('connect', () => {
      for (const payload of payloads) {
        socket.write(`${JSON.stringify(payload)}\n`);
      }
    });
  });
}

async function sendJsonRpcAndClose(
  socketPath: string,
  payload: Record<string, unknown>,
  closeAfterMs = 20
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let closeTimer: NodeJS.Timeout | undefined;

    const finish = (error?: unknown) => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = undefined;
      }
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    socket.once('error', error => {
      finish(error);
    });
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`, error => {
        if (error) {
          finish(error);
          return;
        }
        closeTimer = setTimeout(() => finish(), closeAfterMs);
      });
    });
  });
}

async function sendJsonRpcViaProxy(
  proxyPath: string,
  socketPath: string,
  payload: Record<string, unknown>,
  timeoutMs = 300
): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const child = child_process.spawn(process.execPath, [proxyPath], {
      env: {
        ...process.env,
        MLLD_FUNCTION_MCP_SOCKET: socketPath
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error('Timed out waiting for proxy response'));
      }
    }, timeoutMs);

    const finish = (error?: Error, response?: Record<string, unknown>) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(response ?? {});
    };

    const parseBufferedResponse = (): Record<string, unknown> | null => {
      const newlineIndex = stdout.indexOf('\n');
      const line = (newlineIndex === -1 ? stdout : stdout.slice(0, newlineIndex)).trim();
      if (!line) {
        return null;
      }
      return JSON.parse(line) as Record<string, unknown>;
    };

    child.once('error', error => {
      finish(error);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      try {
        const response = parseBufferedResponse();
        if (!response) {
          return;
        }
        child.stdin.end();
        finish(undefined, response);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.once('close', code => {
      if (settled) {
        return;
      }
      try {
        const response = parseBufferedResponse();
        if (response) {
          finish(undefined, response);
          return;
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      const detail = stderr.trim() || `Proxy exited with code ${code ?? 'unknown'}`;
      finish(new Error(detail));
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 400,
  intervalMs = 10
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
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

  it('emits verbose runtime traces for bridge request timing', async () => {
    const env = createEnv();
    env.setRuntimeTrace('verbose');
    const functionTool = createFunctionTool('sayHi');
    const mcpName = mlldNameToMCPName(functionTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([[mcpName, functionTool]]),
      sessionId: 'trace-session'
    });

    try {
      await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });
      await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: mcpName,
          arguments: {}
        }
      });

      const events = env.getRuntimeTraceEvents();
      const callStart = events.find((event: any) =>
        event.event === 'mcp.request' && event.data.method === 'tools/call'
      );
      expect(callStart).toBeDefined();
      if (!callStart) {
        throw new Error('Missing mcp.request trace event');
      }
      expect(callStart.data).toMatchObject({
        phase: 'start',
        bridge: 'function',
        sessionId: 'trace-session',
        jsonrpcId: 2,
        method: 'tools/call',
        tool: mcpName,
        argBytes: 2
      });
      expect(callStart.data.args).toEqual(expect.objectContaining({
        kind: 'object',
        size: 0,
        bytes: 2
      }));

      const callFinish = events.find((event: any) =>
        event.event === 'mcp.response' && event.data.requestId === callStart.data.requestId
      );
      expect(callFinish).toBeDefined();
      if (!callFinish) {
        throw new Error('Missing mcp.response trace event');
      }
      expect(callFinish.data).toMatchObject({
        phase: 'finish',
        bridge: 'function',
        sessionId: 'trace-session',
        jsonrpcId: 2,
        method: 'tools/call',
        tool: mcpName,
        ok: true,
        clientClosed: false
      });
      expect(callFinish.data.durationMs).toEqual(expect.any(Number));
      expect(callFinish.data.responseBytes).toEqual(expect.any(Number));
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('serializes function tool calls for one bridge session', async () => {
    const env = await createInterpretedEnv([
      '/exe @slowTool() = js {',
      '  await new Promise(resolve => setTimeout(resolve, 120));',
      '  return "slow";',
      '}',
      '/exe @fastTool() = js { return "fast"; }'
    ].join('\n'));
    const slowTool = env.getVariable('slowTool') as ExecutableVariable;
    const fastTool = env.getVariable('fastTool') as ExecutableVariable;
    const slowName = mlldNameToMCPName(slowTool.name);
    const fastName = mlldNameToMCPName(fastTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([
        [slowName, slowTool],
        [fastName, fastTool]
      ])
    });

    try {
      const responses = await sendJsonRpcBatch(bridge.socketPath, [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: slowName,
            arguments: {}
          }
        },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: fastName,
            arguments: {}
          }
        }
      ]);

      expect(responses.map(response => response.id)).toEqual([1, 2]);
      expect((responses[0].result as any)?.content?.[0]?.text).toBe('slow');
      expect((responses[1].result as any)?.content?.[0]?.text).toBe('fast');
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('cancels an in-flight function tool call when the client socket closes', async () => {
    const markerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-bridge-cancel-'));
    const markerPath = path.join(markerDir, 'finished.txt');
    const env = await createInterpretedEnv([
      '/exe @slowTool() = node {',
      "  const fs = require('fs');",
      '  await new Promise(resolve => setTimeout(resolve, 200));',
      `  fs.writeFileSync(${JSON.stringify(markerPath)}, 'done');`,
      '  return "done";',
      '}'
    ].join('\n'));
    env.setRuntimeTrace('verbose');
    const slowTool = env.getVariable('slowTool') as ExecutableVariable;
    const slowName = mlldNameToMCPName(slowTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([[slowName, slowTool]]),
      sessionId: 'cancel-session'
    });

    try {
      await sendJsonRpcAndClose(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: slowName,
          arguments: {}
        }
      });

      await waitFor(async () => env.getRuntimeTraceEvents().some((event: any) =>
        event.event === 'mcp.response' &&
        event.data.sessionId === 'cancel-session' &&
        event.data.method === 'tools/call' &&
        event.data.clientClosed === true
      ), 1000);
      await new Promise(resolve => setTimeout(resolve, 250));

      expect(await fileExists(markerPath)).toBe(false);
    } finally {
      await bridge.cleanup();
      env.cleanup();
      await fs.rm(markerDir, { recursive: true, force: true });
    }
  });

  it('does not dispatch queued function tool calls after the client socket closes', async () => {
    const markerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-bridge-queue-cancel-'));
    const markerPath = path.join(markerDir, 'queued.txt');
    const env = await createInterpretedEnv([
      '/exe @slowTool() = node {',
      '  await new Promise(resolve => setTimeout(resolve, 200));',
      '  return "slow";',
      '}',
      '/exe @fastTool() = node {',
      "  const fs = require('fs');",
      `  fs.writeFileSync(${JSON.stringify(markerPath)}, 'fast');`,
      '  return "fast";',
      '}'
    ].join('\n'));
    env.setRuntimeTrace('verbose');
    const slowTool = env.getVariable('slowTool') as ExecutableVariable;
    const fastTool = env.getVariable('fastTool') as ExecutableVariable;
    const slowName = mlldNameToMCPName(slowTool.name);
    const fastName = mlldNameToMCPName(fastTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([
        [slowName, slowTool],
        [fastName, fastTool]
      ]),
      sessionId: 'queue-cancel-session'
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(bridge.socketPath);
        const finish = (error?: unknown) => {
          socket.destroy();
          if (error) {
            reject(error);
            return;
          }
          resolve();
        };
        socket.once('error', finish);
        socket.once('connect', () => {
          socket.write(`${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: slowName, arguments: {} }
          })}\n`);
          socket.write(`${JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: fastName, arguments: {} }
          })}\n`, error => {
            if (error) {
              finish(error);
              return;
            }
            setTimeout(() => finish(), 20);
          });
        });
      });

      await waitFor(async () => env.getRuntimeTraceEvents().filter((event: any) =>
        event.event === 'mcp.response' &&
        event.data.sessionId === 'queue-cancel-session' &&
        event.data.method === 'tools/call' &&
        event.data.clientClosed === true
      ).length >= 2, 1000);
      await new Promise(resolve => setTimeout(resolve, 250));

      expect(await fileExists(markerPath)).toBe(false);
    } finally {
      await bridge.cleanup();
      env.cleanup();
      await fs.rm(markerDir, { recursive: true, force: true });
    }
  });

  it('marks bridge tool errors in runtime trace responses', async () => {
    const env = createEnv();
    env.setRuntimeTrace('verbose');
    const functionTool = createFunctionTool('sayHi');
    const mcpName = mlldNameToMCPName(functionTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([[mcpName, functionTool]]),
      sessionId: 'trace-errors'
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'missing_tool',
          arguments: {}
        }
      });

      expect((called.result as any)?.isError).toBe(true);
      const finish = env.getRuntimeTraceEvents().find((event: any) =>
        event.event === 'mcp.response' && event.data.tool === 'missing_tool'
      );
      expect(finish).toBeDefined();
      if (!finish) {
        throw new Error('Missing mcp.response error trace event');
      }
      expect(finish.data).toMatchObject({
        phase: 'finish',
        bridge: 'function',
        sessionId: 'trace-errors',
        method: 'tools/call',
        tool: 'missing_tool',
        ok: false,
        isError: true
      });
      expect(finish.data.error).toContain("Tool 'missing_tool' not available");
    } finally {
      await bridge.cleanup();
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

  it('accepts direct object-input tool calls on the bridge path', async () => {
    const env = await createInterpretedEnv([
      '/record @resolve_inputs = { data: [tool: string, args: object?, purpose: string?], validate: "strict" }',
      '/exe @plannerResolveTool(input) = [',
      '  => @input.tool',
      ']'
    ].join('\n'));
    const functionTool = env.getVariable('plannerResolveTool') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['resolve', functionTool]]),
      toolDefinitions: new Map([[
        'resolve',
        {
          mlld: 'plannerResolveTool',
          inputs: '@resolve_inputs',
          direct: true,
          description: 'Resolve records'
        }
      ]]),
      sessionId: 'test-session'
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 100,
        method: 'tools/call',
        params: {
          name: 'resolve',
          arguments: {
            tool: 'get_current_datetime',
            args: {},
            purpose: 'Get current time'
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toBe('get_current_datetime');
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('infers direct object-input bridge calls from inputs records when direct is omitted', async () => {
    const env = await createInterpretedEnv([
      '/record @resolve_inputs = { data: [tool: string, args: object?, purpose: string?], validate: "strict" }',
      '/exe @plannerResolveTool(input) = [',
      '  => @input.tool',
      ']'
    ].join('\n'));
    const functionTool = env.getVariable('plannerResolveTool') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['resolve', functionTool]]),
      toolDefinitions: new Map([[
        'resolve',
        {
          mlld: 'plannerResolveTool',
          inputs: '@resolve_inputs',
          description: 'Resolve records'
        }
      ]]),
      sessionId: 'test-session'
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 1001,
        method: 'tools/call',
        params: {
          name: 'resolve',
          arguments: {
            tool: 'get_current_datetime',
            args: {},
            purpose: 'Get current time'
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toBe('get_current_datetime');
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('preserves top-level array fields for direct object-input tool calls on the bridge path', async () => {
    const env = await createInterpretedEnv([
      '/record @derive_inputs = { data: [sources: array, goal: string, name: string, purpose: string?], validate: "strict" }',
      '/exe @plannerDeriveTool(input) = [',
      '  => `count=@input.sources.length first=@input.sources[0].record second=@input.sources[1].field goal=@input.goal name=@input.name`',
      ']'
    ].join('\n'));
    const functionTool = env.getVariable('plannerDeriveTool') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['derive', functionTool]]),
      toolDefinitions: new Map([[
        'derive',
        {
          mlld: 'plannerDeriveTool',
          inputs: '@derive_inputs',
          direct: true,
          description: 'Derive a result'
        }
      ]]),
      sessionId: 'test-session'
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 101,
        method: 'tools/call',
        params: {
          name: 'derive',
          arguments: {
            sources: [
              {
                source: 'resolved',
                record: 'datetime_context',
                handle: 'r_datetime_context_2026-04-18 08:00',
                field: 'value'
              },
              {
                source: 'resolved',
                record: 'calendar_evt',
                handle: 'r_calendar_evt_9',
                field: 'start_time'
              }
            ],
            goal: 'Calculate the time difference',
            name: 'time_until_lunch',
            purpose: 'Determine how much time remains until lunch'
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toBe(
        'count=2 first=datetime_context second=start_time goal=Calculate the time difference name=time_until_lunch'
      );
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('preserves top-level object fields for direct object-input tool calls on the bridge path', async () => {
    const env = await createInterpretedEnv([
      '/record @extract_inputs = { data: [tool: string?, args: object?, source: object?, schema_name: string?, schema: object?, name: string, purpose: string?], validate: "strict" }',
      '/exe @plannerExtractTool(input) = [',
      '  => `source=@input.source.record handle=@input.source.handle schema=@input.schema_name name=@input.name`',
      ']'
    ].join('\n'));
    const functionTool = env.getVariable('plannerExtractTool') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['extract', functionTool]]),
      toolDefinitions: new Map([[
        'extract',
        {
          mlld: 'plannerExtractTool',
          inputs: '@extract_inputs',
          direct: true,
          description: 'Extract a result'
        }
      ]]),
      sessionId: 'test-session'
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 102,
        method: 'tools/call',
        params: {
          name: 'extract',
          arguments: {
            source: {
              source: 'resolved',
              record: 'calendar_evt',
              handle: 'r_calendar_evt_9'
            },
            schema_name: 'text',
            name: 'lunch_start_time',
            purpose: 'Extract lunch start time for calculation'
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toBe(
        'source=calendar_evt handle=r_calendar_evt_9 schema=text name=lunch_start_time'
      );
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

  it('ignores capability allowlist default-deny for toolbridge wrappers around MCP-backed write tools', async () => {
    const env = await createInterpretedEnv([
      `/import tools from mcp "${process.execPath} ${fakeServerPath}" as @mcp`,
      '/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = [',
      '  => @mcp.sendEmail([@recipient], @subject, @body, [], [], [])',
      '] with { controlArgs: ["recipient"] }'
    ].join('\n'));
    env.setPolicySummary(normalizePolicyConfig({
      capabilities: { allow: ['cmd:git:*'] },
      authorizations: {
        allow: {
          send_email: {
            args: {
              recipient: { eq: 'approved@example.com', attestations: ['known'] }
            }
          }
        }
      }
    })!);

    const functionTool = env.getVariable('sendEmail') as ExecutableVariable;
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([['send_email', functionTool]])
    });

    try {
      const called = await sendJsonRpc(bridge.socketPath, {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: {
            recipient: 'approved@example.com',
            subject: 'hi',
            body: 'test'
          }
        }
      });

      expect((called.result as any)?.isError).not.toBe(true);
      expect((called.result as any)?.content?.[0]?.text).toContain('recipients=["approved@example.com"]');
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });

  it('keeps the proxy restartable during the cleanup grace window', async () => {
    const env = createEnv();
    const functionTool = createFunctionTool('sayHi');
    const mcpName = mlldNameToMCPName(functionTool.name);
    const bridge = await createFunctionMcpBridge({
      env,
      functions: new Map([[mcpName, functionTool]]),
      cleanupGraceMs: 200
    });

    try {
      const configRaw = await fs.readFile(bridge.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_tools: {
            args: string[];
            env: { MLLD_FUNCTION_MCP_SOCKET: string };
          };
        };
      };
      const proxyPath = config.mcpServers.mlld_tools.args[0];

      const beforeCleanup = await sendJsonRpcViaProxy(proxyPath, bridge.socketPath, {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: mcpName,
          arguments: {}
        }
      });
      expect((beforeCleanup.result as any)?.isError).not.toBe(true);

      const configPath = bridge.mcpConfigPath;
      await bridge.cleanup();

      expect(await fileExists(configPath)).toBe(false);
      expect(await fileExists(proxyPath)).toBe(true);

      const restarted = await sendJsonRpcViaProxy(proxyPath, bridge.socketPath, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: mcpName,
          arguments: {}
        }
      });
      expect((restarted.result as any)?.isError).not.toBe(true);

      await waitFor(async () => !(await fileExists(proxyPath)), 1000);
      await waitFor(async () => {
        try {
          await sendJsonRpc(bridge.socketPath, {
            jsonrpc: '2.0',
            id: 8,
            method: 'tools/list',
            params: {}
          });
          return false;
        } catch {
          return true;
        }
      }, 1000);
    } finally {
      await bridge.cleanup();
      env.cleanup();
    }
  });
});
