import { describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { resolveIdentity, resolveUserIdentity } from './identity';

describe('identity resolution', () => {
  it('prefers .sig/config.json identity over git and env fallbacks', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile(
      '/project/.sig/config.json',
      JSON.stringify({
        version: 1,
        sign: { identity: 'configured-user' }
      })
    );

    await expect(
      resolveUserIdentity({
        projectRoot: '/project',
        fileSystem,
        gitUserResolver: () => 'Git User',
        env: { USER: 'env-user' }
      })
    ).resolves.toBe('user:configured-user');
  });

  it('falls back from git user.name to USER env', async () => {
    const fileSystem = new MemoryFileSystem();

    await expect(
      resolveUserIdentity({
        projectRoot: '/project',
        fileSystem,
        gitUserResolver: () => 'Git User',
        env: {}
      })
    ).resolves.toBe('user:Git User');

    await expect(
      resolveUserIdentity({
        projectRoot: '/project',
        fileSystem,
        gitUserResolver: () => undefined,
        env: { USER: 'env-user' }
      })
    ).resolves.toBe('user:env-user');
  });

  it('derives agent and system identities from execution context', async () => {
    await expect(
      resolveIdentity({
        tier: 'agent',
        projectRoot: '/project',
        scriptPath: '/project/scripts/analyze.mld.md'
      })
    ).resolves.toBe('agent:analyze');

    await expect(
      resolveIdentity({
        tier: 'system',
        projectRoot: '/project'
      })
    ).resolves.toBe('system:mlld');
  });
});
