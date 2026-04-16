import { describe, expect, it, vi } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import { Environment } from '@interpreter/env/Environment';
import { SigService } from '@core/security';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { WorkspaceValue } from '@core/types/workspace';
import { executeWrite } from './write-executor';

class NonVirtualMemoryFileSystem implements IFileSystemService {
  private readonly inner = new MemoryFileSystem();

  async readFile(filePath: string): Promise<string> {
    return await this.inner.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.inner.writeFile(filePath, content);
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    await this.inner.appendFile(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    return await this.inner.exists(filePath);
  }

  async access(filePath: string): Promise<void> {
    await this.inner.access(filePath);
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await this.inner.mkdir(dirPath, options);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return await this.inner.readdir(dirPath);
  }

  async unlink(filePath: string): Promise<void> {
    await this.inner.unlink(filePath);
  }

  async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await this.inner.rm(filePath, options);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    return await this.inner.isDirectory(filePath);
  }

  async stat(filePath: string): Promise<{ isDirectory(): boolean; isFile(): boolean; size?: number }> {
    return await this.inner.stat(filePath);
  }
}

function createEnvironment(root: string = '/project'): {
  env: Environment;
  fileSystem: NonVirtualMemoryFileSystem;
} {
  const fileSystem = new NonVirtualMemoryFileSystem();
  const env = new Environment(fileSystem, new PathService(), root);
  return { env, fileSystem };
}

function createWorkspace(backing?: IFileSystemService): WorkspaceValue {
  return {
    type: 'workspace',
    fs: backing ? VirtualFS.over(backing) : VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
}

async function readAuditEvents(fileSystem: IFileSystemService): Promise<Record<string, unknown>[]> {
  const auditPath = '/project/.llm/sec/audit.jsonl';
  const exists = await fileSystem.exists(auditPath).catch(() => false);
  if (!exists) {
    return [];
  }
  const content = await fileSystem.readFile(auditPath);
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

async function readAuditWrites(fileSystem: IFileSystemService): Promise<Record<string, unknown>[]> {
  return (await readAuditEvents(fileSystem)).filter(event => event.event === 'write');
}

async function readSignature(fileSystem: IFileSystemService, relativePath: string): Promise<Record<string, unknown>> {
  const signaturePath = `/project/.sig/sigs/${relativePath}.sig.json`;
  return JSON.parse(await fileSystem.readFile(signaturePath)) as Record<string, unknown>;
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

  it('signs direct writes on non-virtual filesystems and records taint metadata', async () => {
    const { env, fileSystem } = createEnvironment();
    env.setSigService(new SigService('/project', fileSystem));
    env.setSignerIdentity('agent:writer');

    await executeWrite({
      env,
      targetPath: '/project/out.txt',
      content: 'alpha',
      descriptor: makeSecurityDescriptor({ labels: ['untrusted'] })
    });

    const signature = await readSignature(fileSystem, 'out.txt');
    expect(signature).toMatchObject({
      file: 'out.txt',
      signedBy: 'agent:writer',
      metadata: {
        taint: ['untrusted']
      }
    });
  });

  it('does not sign excluded paths', async () => {
    const { env, fileSystem } = createEnvironment();
    env.setSigService(new SigService('/project', fileSystem));
    env.setSignerIdentity('agent:writer');

    await executeWrite({
      env,
      targetPath: '/project/.sig/config.json',
      content: '{}'
    });
    await executeWrite({
      env,
      targetPath: '/project/.llm/sec/audit.jsonl',
      content: '[]'
    });

    expect(await fileSystem.exists('/project/.sig/sigs/.sig/config.json.sig.json')).toBe(false);
    expect(await fileSystem.exists('/project/.sig/sigs/.llm/sec/audit.jsonl.sig.json')).toBe(false);
  });

  it('captures signing context for VFS writes and signs on flush', async () => {
    const { env, fileSystem } = createEnvironment();
    env.setSigService(new SigService('/project', fileSystem));
    env.setSignerIdentity('agent:vfs');
    const workspace = createWorkspace(fileSystem);
    env.pushActiveWorkspace(workspace);

    await executeWrite({
      env,
      targetPath: '/project/workspace.txt',
      content: 'shadow-write',
      descriptor: makeSecurityDescriptor({ labels: ['trusted'] })
    });

    expect(await fileSystem.exists('/project/workspace.txt')).toBe(false);
    expect(workspace.fs.getShadowEntry('/project/workspace.txt')).toEqual({
      content: 'shadow-write',
      signingContext: {
        identity: 'agent:vfs',
        taint: ['trusted']
      }
    });

    await workspace.fs.flush('/project/workspace.txt');

    expect(await fileSystem.readFile('/project/workspace.txt')).toBe('shadow-write');
    const signature = await readSignature(fileSystem, 'workspace.txt');
    expect(signature).toMatchObject({
      signedBy: 'agent:vfs',
      metadata: {
        taint: ['trusted']
      }
    });
  });

  it('keeps VFS signing provenance available after execution-time workspace context is gone', async () => {
    const { env, fileSystem } = createEnvironment();
    env.setSigService(new SigService('/project', fileSystem));
    env.setSignerIdentity('agent:later');
    const workspace = createWorkspace(fileSystem);
    env.pushActiveWorkspace(workspace);

    await executeWrite({
      env,
      targetPath: '/project/later.txt',
      content: 'persist-me'
    });

    env.popActiveWorkspace();
    env.setSignerIdentity('agent:changed');
    await workspace.fs.flush('/project/later.txt');

    const signature = await readSignature(fileSystem, 'later.txt');
    expect(signature).toMatchObject({
      signedBy: 'agent:later'
    });
  });

  it('leaves the write in place and emits audit when signing fails', async () => {
    const { env, fileSystem } = createEnvironment();
    const sigService = new SigService('/project', fileSystem);
    env.setSigService(sigService);
    env.setSignerIdentity('agent:error');
    vi.spyOn(sigService, 'sign').mockRejectedValueOnce(new Error('boom'));

    await executeWrite({
      env,
      targetPath: '/project/error.txt',
      content: 'still-written'
    });

    expect(await fileSystem.readFile('/project/error.txt')).toBe('still-written');
    expect(await fileSystem.exists('/project/.sig/sigs/error.txt.sig.json')).toBe(false);

    const events = await readAuditEvents(fileSystem);
    expect(events.some((event) => event.event === 'sign-error' && event.path === '/project/error.txt')).toBe(true);
  });
});
