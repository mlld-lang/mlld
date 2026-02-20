import { describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import type { MCPToolSchema } from '@interpreter/mcp/McpImportManager';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import {
  deriveNamespaceFromModuleSpec,
  normalizeMcpConfig,
  registerMcpToolsFromConfig
} from './config-spawner';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function buildTool(name: string): MCPToolSchema {
  return {
    name,
    description: `${name} tool`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  };
}

function attachMockManager(
  env: Environment,
  toolsBySpec: Record<string, MCPToolSchema[]>
) {
  const manager = {
    listTools: vi.fn(async (spec: string): Promise<MCPToolSchema[]> => {
      return toolsBySpec[spec] ?? [];
    }),
    callTool: vi.fn(async (spec: string, name: string, args: Record<string, unknown>): Promise<string> => {
      return `called:${spec}:${name}:${JSON.stringify(args)}`;
    })
  };

  const managerSpy = vi.spyOn(env, 'getMcpImportManager').mockReturnValue(manager as any);
  return { manager, managerSpy };
}

describe('config-spawner namespace derivation', () => {
  it.each([
    ['@github/issues', 'github'],
    ['@github', 'github'],
    ['github/issues', 'github'],
    ['@local/echo-server', 'echo'],
    ['local-mcp', 'localMcp'],
    ['./tools/echo-server.mld.md', 'echo']
  ])('derives namespace from %s', (moduleRef, expected) => {
    expect(deriveNamespaceFromModuleSpec(moduleRef)).toBe(expected);
  });
});

describe('registerMcpToolsFromConfig', () => {
  it('registers module-based servers under an inferred namespace and merges servers', async () => {
    const env = createEnvironment();
    const { manager, managerSpy } = attachMockManager(env, {
      '@github/issues': [buildTool('listIssues')],
      '@github/pulls': [buildTool('listPulls')]
    });

    try {
      const config = normalizeMcpConfig({
        servers: [
          { module: '@github/issues', tools: '*' },
          { module: '@github/pulls', tools: '*' }
        ]
      });

      const added = await registerMcpToolsFromConfig(env, config);
      expect(added).toEqual(['github.listIssues', 'github.listPulls']);
      expect(env.hasVariable('listIssues')).toBe(false);

      const githubNamespace = env.getVariable('github');
      const githubValue = githubNamespace?.value as Record<string, any>;
      const listIssues = githubValue.listIssues;
      const listPulls = githubValue.listPulls;

      expect(listIssues).toBeDefined();
      expect(listPulls).toBeDefined();

      const issuesResult = await listIssues.internal.executableDef.fn({ repo: 'mlld' });
      const pullsResult = await listPulls.internal.executableDef.fn();

      expect(issuesResult).toBe('called:@github/issues:listIssues:{"repo":"mlld"}');
      expect(pullsResult).toBe('called:@github/pulls:listPulls:{}');
      expect(manager.callTool).toHaveBeenNthCalledWith(1, '@github/issues', 'listIssues', { repo: 'mlld' });
      expect(manager.callTool).toHaveBeenNthCalledWith(2, '@github/pulls', 'listPulls', {});
    } finally {
      managerSpy.mockRestore();
      env.cleanup();
    }
  });

  it('uses explicit as namespace for non-module sources', async () => {
    const env = createEnvironment();
    const { manager, managerSpy } = attachMockManager(env, {
      'node fake-server': [buildTool('ping')]
    });

    try {
      const config = normalizeMcpConfig({
        servers: [
          { command: 'node', args: ['fake-server'], as: '@github', tools: ['ping'] }
        ]
      });

      const added = await registerMcpToolsFromConfig(env, config);
      expect(added).toEqual(['github.ping']);

      const githubNamespace = env.getVariable('github');
      const githubValue = githubNamespace?.value as Record<string, any>;
      const ping = githubValue.ping;
      const result = await ping.internal.executableDef.fn();

      expect(result).toBe('called:node fake-server:ping:{}');
      expect(manager.callTool).toHaveBeenCalledWith('node fake-server', 'ping', {});
    } finally {
      managerSpy.mockRestore();
      env.cleanup();
    }
  });

  it('rejects duplicate tool aliases when multiple servers share a namespace', async () => {
    const env = createEnvironment();
    const { managerSpy } = attachMockManager(env, {
      '@github/issues': [buildTool('listIssues')],
      '@github/pulls': [buildTool('listIssues')]
    });

    try {
      const config = normalizeMcpConfig({
        servers: [
          { module: '@github/issues', tools: '*' },
          { module: '@github/pulls', tools: '*' }
        ]
      });

      await expect(registerMcpToolsFromConfig(env, config)).rejects.toThrow(
        "mcpConfig tool name collision: '@github.listIssues' appears multiple times"
      );
    } finally {
      managerSpy.mockRestore();
      env.cleanup();
    }
  });
});
