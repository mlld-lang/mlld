import { describe, expect, it } from 'vitest';
import { sha256 } from '@disreguard/sig';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { SigService } from './sig-service';

const PROJECT_ROOT = '/project';

describe('SigService', () => {
  it('initializes sig storage on the injected filesystem', async () => {
    const fileSystem = new MemoryFileSystem();
    const service = new SigService(PROJECT_ROOT, fileSystem);

    await service.init();

    expect(await fileSystem.isDirectory('/project/.sig')).toBe(true);
    expect(await fileSystem.isDirectory('/project/.sig/sigs')).toBe(true);
    expect(JSON.parse(await fileSystem.readFile('/project/.sig/config.json'))).toMatchObject({
      version: 1
    });
  });

  it('signs and verifies files with metadata via the injected filesystem', async () => {
    const fileSystem = new MemoryFileSystem();
    const service = new SigService(PROJECT_ROOT, fileSystem);
    await fileSystem.writeFile('/project/note.txt', 'hello');

    await service.sign('/project/note.txt', 'agent:writer', {
      taint: ['untrusted']
    });

    const result = await service.verify('/project/note.txt');
    expect(result).toMatchObject({
      path: '/project/note.txt',
      relativePath: 'note.txt',
      status: 'verified',
      verified: true,
      signer: 'agent:writer',
      hash: 'sha256:' + sha256('hello'),
      expectedHash: 'sha256:' + sha256('hello'),
      metadata: {
        taint: ['untrusted']
      }
    });
  });

  it('reports modified files via verify() and check()', async () => {
    const fileSystem = new MemoryFileSystem();
    const service = new SigService(PROJECT_ROOT, fileSystem);
    await fileSystem.writeFile('/project/data.txt', 'alpha');

    await service.sign('/project/data.txt', 'agent:writer');
    await fileSystem.writeFile('/project/data.txt', 'beta');

    await expect(service.verify('/project/data.txt')).resolves.toMatchObject({
      status: 'modified',
      verified: false,
      signer: 'agent:writer',
      hash: 'sha256:' + sha256('beta'),
      expectedHash: 'sha256:' + sha256('alpha')
    });

    await expect(service.check('/project/data.txt')).resolves.toMatchObject({
      status: 'modified',
      verified: false,
      signer: 'agent:writer',
      expectedHash: 'sha256:' + sha256('alpha')
    });
  });

  it('verifies caller-provided hashes and invalidates same-hash cache entries after re-signing', async () => {
    const fileSystem = new MemoryFileSystem();
    const service = new SigService(PROJECT_ROOT, fileSystem);
    await fileSystem.writeFile('/project/cache.txt', 'stable');

    await service.sign('/project/cache.txt', 'agent:first');
    const first = await service.verifyHash('/project/cache.txt', sha256('stable'));
    expect(first).toMatchObject({
      status: 'verified',
      verified: true,
      signer: 'agent:first'
    });

    await service.sign('/project/cache.txt', 'agent:second');

    const second = await service.verifyHash('/project/cache.txt', sha256('stable'));
    expect(second).toMatchObject({
      status: 'verified',
      verified: true,
      signer: 'agent:second'
    });

    const mismatch = await service.verifyHash('/project/cache.txt', sha256('different'));
    expect(mismatch).toMatchObject({
      status: 'modified',
      verified: false,
      signer: 'agent:second',
      hash: 'sha256:' + sha256('different'),
      expectedHash: 'sha256:' + sha256('stable')
    });
  });
});
