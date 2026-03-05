import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable, VariableSource } from '@core/types/variable';

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

function getToolbridgeFn(env: Environment): (tools?: unknown, cwd?: unknown) => Promise<any> {
  const toolbridgeVar = env.getVariable('toolbridge') as any;
  if (!toolbridgeVar?.internal?.executableDef?.fn) {
    throw new Error('toolbridge builtin is not registered');
  }
  return toolbridgeVar.internal.executableDef.fn;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('@toolbridge builtin', () => {
  it('throws when called outside exec invocation scope', async () => {
    const env = createEnv();
    const toolbridgeFn = getToolbridgeFn(env);

    try {
      await expect(toolbridgeFn(['Read'])).rejects.toThrow(
        /@toolbridge can only be called inside an exec invocation/
      );
    } finally {
      env.cleanup();
    }
  });

  it('returns plain tools fallback data when no MCP config is needed', async () => {
    const env = createEnv();
    const toolbridgeFn = getToolbridgeFn(env);

    try {
      const result = await env.withExecutionContext(
        'exec-invocation',
        { allowToolbridge: true },
        async () => toolbridgeFn(['Read', 'Write'])
      );
      expect(result).toEqual({
        config: '',
        tools: 'Read,Write',
        inBox: false,
        mcpAllowedTools: ''
      });
    } finally {
      env.cleanup();
    }
  });

  it('registers scope cleanup when per-call MCP config is created', async () => {
    const env = createEnv();
    const toolbridgeFn = getToolbridgeFn(env);
    const functionTool = createFunctionTool('sayHi');
    const registerCleanupSpy = vi.spyOn(env, 'registerScopeCleanup');

    try {
      const result = await env.withExecutionContext(
        'exec-invocation',
        { allowToolbridge: true },
        async () => toolbridgeFn([functionTool])
      );

      expect(result.inBox).toBe(false);
      expect(result.tools).toBe('sayHi');
      expect(result.config).not.toBe('');
      expect(await fileExists(result.config)).toBe(true);
      expect(registerCleanupSpy).toHaveBeenCalledTimes(1);

      await env.runScopeCleanups();
      expect(await fileExists(result.config)).toBe(false);
    } finally {
      env.cleanup();
    }
  });
});
