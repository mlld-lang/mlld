import { describe, expect, it } from 'vitest';
import { VirtualFS } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('SDK docs VirtualFS examples', () => {
  it('covers empty/over + changes/fileDiff/flush/discard', async () => {
    const empty = VirtualFS.empty();
    await empty.writeFile('/scratch/demo.txt', 'demo');
    expect(await empty.readFile('/scratch/demo.txt')).toBe('demo');

    const backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    await backing.writeFile('/project/existing.txt', 'base');

    const vfs = VirtualFS.over(backing);
    await vfs.writeFile('/project/existing.txt', 'base-updated');
    await vfs.writeFile('/project/new.txt', 'new');

    const changes = await vfs.changes();
    expect(changes.map(change => change.path)).toEqual([
      '/project/existing.txt',
      '/project/new.txt'
    ]);

    const unified = await vfs.fileDiff('/project/existing.txt');
    expect(unified).toContain('--- a/project/existing.txt');
    expect(unified).toContain('+++ b/project/existing.txt');

    vfs.discard('/project/new.txt');
    await vfs.flush('/project/existing.txt');

    expect(await backing.readFile('/project/existing.txt')).toBe('base-updated');
    expect(await backing.exists('/project/new.txt')).toBe(false);
  });

  it('covers export/apply patch replay example', async () => {
    const backingA = new MemoryFileSystem();
    await backingA.mkdir('/project', { recursive: true });
    await backingA.writeFile('/project/data.txt', 'v1');

    const vfs = VirtualFS.over(backingA);
    await vfs.writeFile('/project/data.txt', 'v2');
    const patch = vfs.export();

    const backingB = new MemoryFileSystem();
    await backingB.mkdir('/project', { recursive: true });
    await backingB.writeFile('/project/data.txt', 'v1');

    const replay = VirtualFS.over(backingB);
    replay.apply(patch);
    await replay.flush();

    expect(await backingB.readFile('/project/data.txt')).toBe('v2');
  });
});
