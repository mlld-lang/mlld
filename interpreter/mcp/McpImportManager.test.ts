import { describe, expect, it } from 'vitest';
import { McpImportManager } from '@interpreter/mcp/McpImportManager';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';

const fakeServerPath = fileURLToPath(
  new URL('../../tests/fixtures/mcp/fake-server.cjs', import.meta.url)
);

function createEnvironment(): Environment {
  return new Environment(new NodeFileSystem(), new PathService(), '/');
}

describe('McpImportManager', () => {
  it('closes idle servers and restarts on next call', async () => {
    const previousIdle = process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS;
    process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS = '30';

    const env = createEnvironment();
    const manager = new McpImportManager(env);
    const spec = `${process.execPath} ${fakeServerPath}`;

    try {
      const first = await manager.callTool(spec, 'echo', { text: 'hello' });
      expect(first).toBe('hello');

      await new Promise(resolve => setTimeout(resolve, 60));

      const server = (manager as any).servers.get(spec);
      expect(server?.isClosed()).toBe(true);

      const second = await manager.callTool(spec, 'echo', { text: 'again' });
      expect(second).toBe('again');
    } finally {
      manager.closeAll();
      if (previousIdle === undefined) {
        delete process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS;
      } else {
        process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS = previousIdle;
      }
    }
  });

  it('enforces max concurrent servers', async () => {
    const previousMax = process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT;
    process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT = '1';

    const env = createEnvironment();
    const manager = new McpImportManager(env);
    const spec = `${process.execPath} ${fakeServerPath}`;
    const spec2 = `${process.execPath} ${fakeServerPath} --second`;

    try {
      await manager.listTools(spec);
      await expect(manager.listTools(spec2)).rejects.toThrow(/limit exceeded/);
    } finally {
      manager.closeAll();
      if (previousMax === undefined) {
        delete process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT;
      } else {
        process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT = previousMax;
      }
    }
  });
});
