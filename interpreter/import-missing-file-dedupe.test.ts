import { describe, expect, it } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('missing import file errors', () => {
  it('reports file-not-found only once for missing imports', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    let thrown: unknown;
    try {
      await interpret('/import { @helper } from "./missing.mld"\n/show @helper', {
        fileSystem,
        pathService,
        basePath: '/',
        filePath: '/main.mld'
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('File not found: ./missing.mld');
    const occurrences = message.match(/File not found: \.\/missing\.mld/g) ?? [];
    expect(occurrences).toHaveLength(1);

    await expect(
      interpret('/import { @helper } from "./missing.mld"\n/show @helper', {
        fileSystem,
        pathService,
        basePath: '/',
        filePath: '/main.mld'
      })
    ).rejects.toThrow(/File not found: \.\/missing\.mld/);
  });
});
