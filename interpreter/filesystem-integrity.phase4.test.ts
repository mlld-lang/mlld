import { describe, expect, it } from 'vitest';
import { SigService } from '@core/security';
import { processContentLoader } from '@interpreter/eval/content-loader';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function createEnvironment() {
  const fileSystem = new MemoryFileSystem();
  const env = new Environment(fileSystem, new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  const sigService = new SigService('/project', fileSystem);
  env.setSigService(sigService);
  return { env, fileSystem, sigService };
}

describe('filesystem integrity Phase 4', () => {
  it('populates @mx.sig snapshot entries after file reads', async () => {
    const { env, fileSystem, sigService } = createEnvironment();
    env.recordPolicyConfig('policy', {
      defaults: { unlabeled: 'untrusted' },
      signers: {
        'user:*': ['trusted']
      }
    });

    await fileSystem.writeFile('/project/docs/note.txt', 'hello');
    await sigService.sign('/project/docs/note.txt', 'user:alice');

    await processContentLoader(
      {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/note.txt' }],
          raw: 'docs/note.txt'
        }
      } as any,
      env
    );

    const mx = env.getVariable('mx');
    const sig = (mx?.value as any).sig;

    expect(sig['docs/note.txt']).toMatchObject({
      verified: true,
      signer: 'user:alice',
      status: 'verified',
      labels: ['trusted']
    });
    expect(sig['/project/docs/note.txt']).toMatchObject({
      relativePath: 'docs/note.txt'
    });
  });

  it('verifies files on demand through @mx.sig.files()', async () => {
    const { env, fileSystem, sigService } = createEnvironment();
    env.recordPolicyConfig('policy', {
      defaults: { unlabeled: 'untrusted' },
      signers: {
        'user:*': ['trusted']
      }
    });

    await fileSystem.writeFile('/project/docs/a.txt', 'alpha');
    await fileSystem.writeFile('/project/docs/b.txt', 'beta');
    await fileSystem.writeFile('/project/docs/c.txt', 'gamma');
    await sigService.sign('/project/docs/a.txt', 'user:alice');
    await sigService.sign('/project/docs/b.txt', 'user:alice');

    await processContentLoader(
      {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/a.txt' }],
          raw: 'docs/a.txt'
        }
      } as any,
      env
    );

    const mx = env.getVariable('mx');
    const files = await (mx?.value as any).sig.files('docs/*.txt');

    expect(files).toEqual([
      expect.objectContaining({
        relativePath: 'docs/a.txt',
        status: 'verified',
        labels: ['trusted']
      }),
      expect.objectContaining({
        relativePath: 'docs/b.txt',
        status: 'verified',
        labels: ['trusted']
      }),
      expect.objectContaining({
        relativePath: 'docs/c.txt',
        status: 'unsigned',
        labels: ['untrusted']
      })
    ]);
  });
});
