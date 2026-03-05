import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable, VariableSource } from '@core/types/variable';
import { createCallMcpConfig } from './call-mcp-config';

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
});
