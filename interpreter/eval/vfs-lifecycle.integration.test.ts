import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { PathContext } from '@core/services/PathContextService';

const pathContext: PathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

describe('VirtualFS lifecycle integration for output/append', () => {
  it('keeps output/append writes in shadow state until flush and supports export/apply', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    const vfs = VirtualFS.over(backing);
    const pathService = new PathService();

    const result = await interpret(
      [
        '/output "alpha" to "/project/out.txt"',
        '/append "beta" to "/project/out.txt"',
        '/show "done"'
      ].join('\n'),
      {
        fileSystem: vfs,
        pathService,
        pathContext
      }
    );

    expect(String(result).trim()).toBe('done');
    expect(await backing.exists('/project/out.txt')).toBe(false);
    expect(await vfs.readFile('/project/out.txt')).toContain('alpha');
    expect(await vfs.readFile('/project/out.txt')).toContain('beta');

    const patch = vfs.export();
    const replay = VirtualFS.over(backing);
    replay.apply(patch);

    expect(await backing.exists('/project/out.txt')).toBe(false);
    await replay.flush();
    const persisted = await backing.readFile('/project/out.txt');
    expect(persisted).toContain('alpha');
    expect(persisted).toContain('beta');
  });

  it('preserves backing content until a scoped flush for append', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    await backing.writeFile('/project/log.txt', 'start\n');

    const vfs = VirtualFS.over(backing);
    const pathService = new PathService();
    await interpret('/append "next" to "/project/log.txt"', {
      fileSystem: vfs,
      pathService,
      pathContext
    });

    expect(await backing.readFile('/project/log.txt')).toBe('start\n');
    expect(await vfs.readFile('/project/log.txt')).toBe('start\nnext\n');

    await vfs.flush('/project/log.txt');
    expect(await backing.readFile('/project/log.txt')).toBe('start\nnext\n');
  });
});
