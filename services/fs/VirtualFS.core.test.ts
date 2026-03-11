import { beforeEach, describe, expect, it } from 'vitest';
import { VirtualFS } from './VirtualFS';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('VirtualFS core semantics', () => {
  let backing: MemoryFileSystem;
  let vfs: VirtualFS;

  beforeEach(async () => {
    backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    await backing.mkdir('/project/src', { recursive: true });
    await backing.writeFile('/project/src/existing.txt', 'backing');
    await backing.writeFile('/project/src/keep.txt', 'keep');
    await backing.mkdir('/project/src/deep', { recursive: true });
    await backing.writeFile('/project/src/deep/file.txt', 'deep');
    vfs = VirtualFS.over(backing);
  });

  it('reads from backing, then prefers shadow writes without mutating backing', async () => {
    expect(await vfs.readFile('/project/src/existing.txt')).toBe('backing');

    await vfs.writeFile('/project/src/existing.txt', 'shadow');

    expect(await vfs.readFile('/project/src/existing.txt')).toBe('shadow');
    expect(await backing.readFile('/project/src/existing.txt')).toBe('backing');
  });

  it('supports append semantics on shadow files', async () => {
    await vfs.appendFile('/project/src/existing.txt', ' + append');
    expect(await vfs.readFile('/project/src/existing.txt')).toBe('backing + append');
    expect(await backing.readFile('/project/src/existing.txt')).toBe('backing');
  });

  it('creates parent directories on write and normalizes paths', async () => {
    await vfs.writeFile('project\\generated\\new.txt', 'hello');
    expect(await vfs.exists('/project/generated/new.txt')).toBe(true);
    expect(await vfs.isDirectory('/project/generated')).toBe(true);
    expect(await vfs.readFile('/project/generated/new.txt')).toBe('hello');
  });

  it('merges virtual and backing directories for readdir', async () => {
    await vfs.mkdir('/project/src/virtual-dir', { recursive: true });
    await vfs.writeFile('/project/src/virtual-file.txt', 'v');

    const entries = await vfs.readdir('/project/src');
    expect(entries).toEqual([
      'deep',
      'existing.txt',
      'keep.txt',
      'virtual-dir',
      'virtual-file.txt'
    ]);
  });

  it('reports exists/isDirectory/stat for files and directories', async () => {
    await vfs.mkdir('/project/newdir', { recursive: true });
    await vfs.writeFile('/project/newdir/file.txt', 'abc');

    expect(await vfs.exists('/project/newdir')).toBe(true);
    expect(await vfs.isDirectory('/project/newdir')).toBe(true);
    expect(await vfs.exists('/project/newdir/file.txt')).toBe(true);
    expect(await vfs.isDirectory('/project/newdir/file.txt')).toBe(false);

    const fileStat = await vfs.stat('/project/newdir/file.txt');
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.size).toBe(3);

    const dirStat = await vfs.stat('/project/newdir');
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('supports rm/unlink and delete masking behavior', async () => {
    await vfs.unlink('/project/src/existing.txt');
    expect(await vfs.exists('/project/src/existing.txt')).toBe(false);
    expect(await backing.exists('/project/src/existing.txt')).toBe(true);

    await expect(vfs.readFile('/project/src/existing.txt')).rejects.toMatchObject({
      code: 'ENOENT',
      path: '/project/src/existing.txt'
    });

    await vfs.rm('/project/src/deep', { recursive: true });
    expect(await vfs.exists('/project/src/deep')).toBe(false);

    const entries = await vfs.readdir('/project/src');
    expect(entries).not.toContain('deep');
  });

  it('supports access() with ENOENT shape', async () => {
    await expect(vfs.access('/project/nope.txt')).rejects.toMatchObject({
      code: 'ENOENT',
      path: '/project/nope.txt'
    });

    await expect(vfs.access('/project/src/keep.txt')).resolves.toBeUndefined();
  });

  it('returns isVirtual() true', () => {
    expect(vfs.isVirtual()).toBe(true);
  });

  it('supports empty backing mode for virtual-only writes', async () => {
    const empty = VirtualFS.empty();
    await empty.writeFile('/virtual-only.txt', 'content');
    expect(await empty.readFile('/virtual-only.txt')).toBe('content');
    expect(await empty.exists('/virtual-only.txt')).toBe(true);
  });
});
