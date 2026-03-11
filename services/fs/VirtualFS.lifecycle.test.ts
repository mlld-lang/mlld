import { beforeEach, describe, expect, it } from 'vitest';
import { VirtualFS } from './VirtualFS';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('VirtualFS lifecycle APIs', () => {
  let backing: MemoryFileSystem;
  let vfs: VirtualFS;

  beforeEach(async () => {
    backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    await backing.writeFile('/project/a.txt', 'A');
    await backing.writeFile('/project/b.txt', 'B');
    await backing.mkdir('/project/dir', { recursive: true });
    await backing.writeFile('/project/dir/old.txt', 'OLD');
    vfs = VirtualFS.over(backing);
  });

  it('reports created/modified/deleted changes with deterministic ordering', async () => {
    await vfs.writeFile('/project/a.txt', 'A*');
    await vfs.writeFile('/project/new.txt', 'NEW');
    await vfs.rm('/project/b.txt');
    await vfs.mkdir('/project/newdir', { recursive: true });

    const changes = await vfs.changes();
    expect(changes).toEqual([
      { path: '/project/a.txt', type: 'modified', entity: 'file' },
      { path: '/project/b.txt', type: 'deleted', entity: 'file' },
      { path: '/project/new.txt', type: 'created', entity: 'file' },
      { path: '/project/newdir', type: 'created', entity: 'directory' }
    ]);

    expect(await vfs.diff()).toEqual(changes);
  });

  it('discards path-scoped shadow and delete state', async () => {
    await vfs.writeFile('/project/dir/new.txt', 'shadow');
    await vfs.writeFile('/project/keep.txt', 'keep');
    await vfs.rm('/project/b.txt');

    vfs.discard('/project/dir');
    vfs.discard('/project/b.txt');

    const changes = await vfs.changes();
    expect(changes).toEqual([
      { path: '/project/keep.txt', type: 'created', entity: 'file' }
    ]);
  });

  it('resets all lifecycle state', async () => {
    await vfs.writeFile('/project/new.txt', 'x');
    await vfs.rm('/project/b.txt');
    expect((await vfs.changes()).length).toBeGreaterThan(0);

    vfs.reset();

    expect(await vfs.changes()).toEqual([]);
    expect(await vfs.readFile('/project/a.txt')).toBe('A');
    expect(await vfs.exists('/project/b.txt')).toBe(true);
  });

  it('exports deterministic patches and applies them to another VirtualFS', async () => {
    await vfs.mkdir('/project/newdir', { recursive: true });
    await vfs.writeFile('/project/newdir/new.txt', 'hello');
    await vfs.writeFile('/project/a.txt', 'A2');
    await vfs.rm('/project/b.txt');

    const patch = vfs.export();
    expect(patch.version).toBe(1);
    expect(patch.entries.map(entry => `${entry.op}:${entry.path}`)).toEqual([
      'write:/project/a.txt',
      'delete:/project/b.txt',
      'mkdir:/project/newdir',
      'write:/project/newdir/new.txt'
    ]);

    const target = VirtualFS.over(backing);
    target.apply(patch);
    const targetChanges = await target.changes();
    expect(targetChanges).toEqual(await vfs.changes());
  });

  it('supports path-scoped and global flush semantics', async () => {
    await vfs.writeFile('/project/a.txt', 'A1');
    await vfs.writeFile('/project/new.txt', 'N');
    await vfs.rm('/project/b.txt');

    await vfs.flush('/project/a.txt');
    expect(await backing.readFile('/project/a.txt')).toBe('A1');
    expect(await backing.exists('/project/new.txt')).toBe(false);
    expect(await backing.exists('/project/b.txt')).toBe(true);

    await vfs.flush();
    expect(await backing.readFile('/project/new.txt')).toBe('N');
    expect(await backing.exists('/project/b.txt')).toBe(false);
    expect(await vfs.changes()).toEqual([]);
  });

  it('fails flush without a backing filesystem', async () => {
    const empty = VirtualFS.empty();
    await empty.writeFile('/v.txt', 'x');
    await expect(empty.flush()).rejects.toMatchObject({ code: 'ENOTSUP' });
  });
});
