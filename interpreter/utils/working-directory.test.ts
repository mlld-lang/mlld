import { describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { VirtualFS } from '@services/fs/VirtualFS';
import { createObjectVariable, createSimpleTextVariable } from '@core/types/variable';
import {
  executeInWorkingDirectory,
  resolveWorkingDirectory,
  type WorkingDirectoryResult
} from './working-directory';

const VARIABLE_SOURCE = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function createEnvironment(basePath = '/project'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

function createWorkspace() {
  return {
    type: 'workspace' as const,
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
}

function workspaceRef(name: string) {
  return [{ type: 'VariableReference', identifier: name }] as any;
}

describe('working directory resolution', () => {
  it('returns none when no working directory is provided', async () => {
    const env = createEnvironment();
    const result = await resolveWorkingDirectory(undefined, env);
    expect(result).toEqual<WorkingDirectoryResult>({ type: 'none', workspacePushed: false });
  });

  it('resolves path working directories without pushing a workspace', async () => {
    const env = createEnvironment('/project');
    const fs = env.getFileSystemService();
    await fs.mkdir('/tmp/wd-path', { recursive: true });

    env.setVariable(
      'cwd',
      createSimpleTextVariable('cwd', '/tmp/wd-path', false, VARIABLE_SOURCE)
    );

    const result = await resolveWorkingDirectory(workspaceRef('cwd'), env);
    expect(result).toEqual<WorkingDirectoryResult>({
      type: 'path',
      path: '/tmp/wd-path',
      workspacePushed: false
    });
    expect(env.getActiveWorkspace()).toBeUndefined();
  });

  it('detects workspace variables before interpolation and pushes active workspace', async () => {
    const env = createEnvironment('/project');
    const workspace = createWorkspace();
    env.setVariable('ws', createObjectVariable('ws', workspace as any, false, VARIABLE_SOURCE));

    const result = await resolveWorkingDirectory(workspaceRef('ws'), env);
    expect(result).toEqual<WorkingDirectoryResult>({ type: 'workspace', workspacePushed: true });
    expect(env.getActiveWorkspace()).toBe(workspace);
    env.popActiveWorkspace();
  });

  it('resolves resolver-backed workspace variables asynchronously', async () => {
    const env = createEnvironment('/project');
    const workspace = createWorkspace();
    const resolverVar = createObjectVariable('ws', workspace as any, false, VARIABLE_SOURCE);
    vi.spyOn(env, 'getResolverVariable').mockResolvedValueOnce(resolverVar as any);

    const result = await resolveWorkingDirectory(workspaceRef('ws'), env);
    expect(result).toEqual<WorkingDirectoryResult>({ type: 'workspace', workspacePushed: true });
    expect(env.getActiveWorkspace()).toBe(workspace);
    env.popActiveWorkspace();
  });

  it('executeInWorkingDirectory always pops workspace context', async () => {
    const env = createEnvironment('/project');
    const workspace = createWorkspace();
    env.setVariable('ws', createObjectVariable('ws', workspace as any, false, VARIABLE_SOURCE));

    await expect(
      executeInWorkingDirectory(workspaceRef('ws'), env, async () => {
        expect(env.getActiveWorkspace()).toBe(workspace);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(env.getActiveWorkspace()).toBeUndefined();
  });
});
