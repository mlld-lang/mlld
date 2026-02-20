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

describe('Import runtime validation', () => {
  it('rejects imports when module needs are unmet', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile(
      '/project/needs.mld',
      '/needs { cmd: ["__missing_cmd__"] }\n/var @value = "hello"'
    );

    const source = '/import { value } from "./needs.mld"\n/show @value';

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/requires capabilities not available/i);
  });

  it('rejects imports when requested export is missing', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/project/empty.mld', '/var @something = "value"\n');

    const source = '/import { missing } from "./empty.mld"\n/show @missing';

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/does not export 'missing'|Import 'missing' not found/i);
  });

  it('keeps package availability enforcement behavior for selected imports', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile(
      '/project/needs-mixed.mld',
      '/needs { node: [__missing_pkg__] }\n/var @value = "hello"\n/export { value }'
    );

    const source = '/import { value } from "./needs-mixed.mld"\n/show @value';

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/Missing packages: __missing_pkg__/i);
  });

  it('keeps package availability enforcement behavior for namespace imports', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile(
      '/project/needs-mixed.mld',
      '/needs { node: [__missing_pkg__] }\n/var @value = "hello"'
    );

    const source = '/import "./needs-mixed.mld" as @needs\n/show @needs.value';

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/Missing packages: __missing_pkg__/i);
  });
});
