import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const pathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

describe('/sign evaluation', () => {
  it('stores template content and signature metadata', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/var @prompt = ::Evaluate @input::
/sign @prompt by "alice" with sha256
`.trim();

    await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    const sigPath = '/project/.mlld/sec/sigs/prompt.sig';
    const contentPath = '/project/.mlld/sec/sigs/prompt.content';
    const signature = JSON.parse(await fileSystem.readFile(sigPath));
    const content = await fileSystem.readFile(contentPath);

    expect(content).toBe('Evaluate @input');
    expect(signature.method).toBe('sha256');
    expect(signature.signedby).toBe('alice');
    expect(signature.hash.startsWith('sha256:')).toBe(true);
  });
});
