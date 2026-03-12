import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { executeWrite } from '@interpreter/eval/write-executor';

function createEnvironment() {
  return new Environment(new MemoryFileSystem(), new PathService(), '/project');
}

describe('filesystem integrity policy', () => {
  it('blocks writes to immutable paths', async () => {
    const env = createEnvironment();
    env.setSignerIdentity('agent:writer');
    env.recordPolicyConfig('policy', {
      filesystem_integrity: {
        '@base/config/**': {
          mutable: false
        }
      }
    });

    await expect(
      executeWrite({
        env,
        targetPath: '/project/config/settings.json',
        content: '{}'
      })
    ).rejects.toThrow('Filesystem write denied by integrity policy');
  });

  it('enforces authorized identities at the write call site', async () => {
    const env = createEnvironment();
    env.recordPolicyConfig('policy', {
      filesystem_integrity: {
        '@base/releases/**': {
          authorizedIdentities: ['user:*']
        }
      }
    });

    env.setSignerIdentity('agent:writer');
    await expect(
      executeWrite({
        env,
        targetPath: '/project/releases/out.txt',
        content: 'blocked'
      })
    ).rejects.toThrow('Filesystem write denied by integrity policy');

    env.setSignerIdentity('user:alice');
    await expect(
      executeWrite({
        env,
        targetPath: '/project/releases/out.txt',
        content: 'allowed'
      })
    ).resolves.toBeUndefined();
  });

  it('still honors allow.filesystem before filesystem_integrity rules', async () => {
    const env = createEnvironment();
    env.setSignerIdentity('user:alice');
    env.recordPolicyConfig('policy', {
      allow: {
        filesystem: {
          write: ['@base/other/**']
        }
      },
      filesystem_integrity: {
        '@base/config/**': {
          authorizedIdentities: ['user:*']
        }
      }
    });

    await expect(
      executeWrite({
        env,
        targetPath: '/project/config/settings.json',
        content: '{}'
      })
    ).rejects.toThrow('Filesystem write denied by policy');
  });
});
