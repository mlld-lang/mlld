import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable, VariableSource } from '@core/types/variable';
import { mlldNameToMCPName } from '@core/mcp/names';
import { createFunctionMcpBridge } from './function-mcp-bridge';

const SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'code',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new NodeFileSystem(), new PathService(), process.cwd());
}

function createFunctionTool(name: string, command = 'printf hello'): ExecutableVariable {
  return createExecutableVariable(name, 'command', command, [], 'sh', SOURCE);
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
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';

    socket.once('error', reject);
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }
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
});
