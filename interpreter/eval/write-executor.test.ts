import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { WorkspaceValue } from '@core/types/workspace';
import { executeWrite } from './write-executor';

function createEnvironment(root: string = '/project'): {
  env: Environment;
  fileSystem: MemoryFileSystem;
} {
  const fileSystem = new MemoryFileSystem();
  const env = new Environment(fileSystem, new PathService(), root);
  return { env, fileSystem };
}

function createWorkspace(): WorkspaceValue {
  return {
    type: 'workspace',
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
}

describe('executeWrite', () => {
  it('writes to the default environment filesystem when no workspace is active', async () => {
    const { env, fileSystem } = createEnvironment();

    await executeWrite({
      env,
      targetPath: '/project/out.txt',
      content: 'alpha',
      mode: 'write'
    });

    expect(await fileSystem.readFile('/project/out.txt')).toBe('alpha');
  });

  it('routes writes to the active workspace filesystem when present', async () => {
    const { env, fileSystem } = createEnvironment();
    const workspace = createWorkspace();
    env.pushActiveWorkspace(workspace);

    await executeWrite({
      env,
      targetPath: '/tmp/workspace.txt',
      content: 'one',
      mode: 'write'
    });
    await executeWrite({
      env,
      targetPath: '/tmp/workspace.txt',
      content: 'two',
      mode: 'append'
    });

    expect(await workspace.fs.readFile('/tmp/workspace.txt')).toBe('onetwo');
    expect(await fileSystem.exists('/tmp/workspace.txt')).toBe(false);
  });

  it('supports explicit filesystem routing for resolver-backed writes', async () => {
    const { env, fileSystem } = createEnvironment();
    const resolverFs = VirtualFS.empty();

    await executeWrite({
      env,
      targetPath: '/resolver/file.txt',
      content: 'resolver-data',
      mode: 'write',
      fileSystem: resolverFs
    });

    expect(await resolverFs.readFile('/resolver/file.txt')).toBe('resolver-data');
    expect(await fileSystem.exists('/resolver/file.txt')).toBe(false);
  });
});
