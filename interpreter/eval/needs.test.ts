import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

describe('/needs evaluation', () => {
  it('rejects missing commands declared in /needs', async () => {
    const fileSystem = new MemoryFileSystem();

    await expect(
      interpret('/needs { cmd: ["__missing_cmd__"] }', {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/__missing_cmd__/i);
  });
});
