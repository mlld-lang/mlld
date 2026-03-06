import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { WorkspaceValue } from '@core/types/workspace';
import {
  createWorkspaceMcpBridge,
  selectWorkspaceBridgeTools,
  type WorkspaceBridgeToolName
} from './workspace-mcp-bridge';

function createWorkspace(): WorkspaceValue {
  return {
    type: 'workspace',
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
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

describe('workspace mcp bridge', () => {
  it('selects allowed bridge tools from box tool policy', () => {
    const tools = selectWorkspaceBridgeTools((tool: WorkspaceBridgeToolName) =>
      tool === 'Read' || tool === 'Glob'
    );

    expect(tools).toEqual(['Read', 'Glob']);
  });

  it('exposes only allowed tools and serves VFS read/write over MCP socket', async () => {
    const workspace = createWorkspace();
    const bridge = await createWorkspaceMcpBridge({
      workspace,
      getShellSession: async () => {
        throw new Error('Bash should not be invoked in this test');
      },
      isToolAllowed: tool => tool === 'Read' || tool === 'Write'
    });

    try {
      const configRaw = await fs.readFile(bridge.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_vfs: {
            env: { MLLD_VFS_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_vfs.env.MLLD_VFS_MCP_SOCKET;

      const init = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }
      });
      expect(init.error).toBeUndefined();

      const toolsList = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      });
      const names = ((toolsList.result as any)?.tools ?? []).map((tool: any) => tool.name);
      expect(names).toEqual(['Read', 'Write']);

      const writeResult = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'Write',
          arguments: {
            file_path: '/notes/todo.txt',
            content: 'bridge-write-ok'
          }
        }
      });
      expect((writeResult.result as any)?.isError).toBeUndefined();

      const readResult = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'Read',
          arguments: {
            file_path: '/notes/todo.txt'
          }
        }
      });

      const text = ((readResult.result as any)?.content ?? [])[0]?.text;
      expect(text).toBe('bridge-write-ok');
      expect(await workspace.fs.readFile('/notes/todo.txt')).toBe('bridge-write-ok');
    } finally {
      await bridge.cleanup();
    }
  });

  it('does not respond to notifications', async () => {
    const workspace = createWorkspace();
    const bridge = await createWorkspaceMcpBridge({
      workspace,
      getShellSession: async () => {
        throw new Error('Bash should not be invoked in this test');
      }
    });

    try {
      const configRaw = await fs.readFile(bridge.mcpConfigPath, 'utf8');
      const config = JSON.parse(configRaw) as {
        mcpServers: {
          mlld_vfs: {
            env: { MLLD_VFS_MCP_SOCKET: string };
          };
        };
      };
      const socketPath = config.mcpServers.mlld_vfs.env.MLLD_VFS_MCP_SOCKET;

      const response = await sendJsonRpcMaybeResponse(socketPath, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      });

      expect(response).toBeNull();
    } finally {
      await bridge.cleanup();
    }
  });
});
