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

async function readAuditWrites(fileSystem: MemoryFileSystem): Promise<Record<string, unknown>[]> {
  const auditPath = '/project/.mlld/sec/audit.jsonl';
  const exists = await fileSystem.exists(auditPath).catch(() => false);
  if (!exists) {
    return [];
  }
  const content = await fileSystem.readFile(auditPath);
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>)
    .filter(event => event.event === 'write');
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

  it('records write audit change types and directive writer metadata', async () => {
    const { env, fileSystem } = createEnvironment();

    await executeWrite({
      env,
      targetPath: '/project/out.txt',
      content: 'alpha',
      metadata: {
        directive: 'file'
      }
    });
    await executeWrite({
      env,
      targetPath: '/project/out.txt',
      content: '\nbeta',
      mode: 'append',
      metadata: {
        directive: 'append'
      }
    });

    const writes = await readAuditWrites(fileSystem);
    expect(writes.length).toBe(2);
    expect(writes[0]).toMatchObject({
      path: '/project/out.txt',
      changeType: 'created',
      writer: 'directive:file'
    });
    expect(writes[1]).toMatchObject({
      path: '/project/out.txt',
      changeType: 'modified',
      writer: 'directive:append'
    });
  });
});
