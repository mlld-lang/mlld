import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

const pathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

describe('filesystem integrity Phase 1 startup', () => {
  it('initializes .sig when a policy directive is present', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    await interpret('/policy @p = { defaults: {} }\n/show "ok"', {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(await fileSystem.isDirectory('/project/.sig')).toBe(true);
    expect(await fileSystem.isDirectory('/project/.sig/sigs')).toBe(true);
    expect(JSON.parse(await fileSystem.readFile('/project/.sig/config.json'))).toMatchObject({
      version: 1
    });
  });
});
