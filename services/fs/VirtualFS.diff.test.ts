import { beforeEach, describe, expect, it } from 'vitest';
import { VirtualFS } from './VirtualFS';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('VirtualFS fileDiff and inspection compatibility', () => {
  let backing: MemoryFileSystem;
  let vfs: VirtualFS;

  beforeEach(async () => {
    backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    await backing.writeFile('/project/mod.txt', 'one\ntwo\n');
    await backing.writeFile('/project/delete.txt', 'gone\n');
    await backing.writeFile('/project/unchanged.txt', 'same\n');
    vfs = VirtualFS.over(backing);
  });

  it('returns unified diff for created files', async () => {
    await vfs.writeFile('/project/new.txt', 'alpha\nbeta\n');
    const diff = await vfs.fileDiff('/project/new.txt');

    expect(diff).toContain('--- /dev/null');
    expect(diff).toContain('+++ b/project/new.txt');
    expect(diff).toContain('+alpha');
    expect(diff).toContain('+beta');
  });

  it('returns unified diff for modified files', async () => {
    await vfs.writeFile('/project/mod.txt', 'one\nTWO\nthree\n');
    const diff = await vfs.fileDiff('/project/mod.txt');

    expect(diff).toContain('--- a/project/mod.txt');
    expect(diff).toContain('+++ b/project/mod.txt');
    expect(diff).toContain('-two');
    expect(diff).toContain('+TWO');
    expect(diff).toContain('+three');
  });

  it('returns unified diff for deleted files', async () => {
    await vfs.rm('/project/delete.txt');
    const diff = await vfs.fileDiff('/project/delete.txt');

    expect(diff).toContain('--- a/project/delete.txt');
    expect(diff).toContain('+++ /dev/null');
    expect(diff).toContain('-gone');
  });

  it('returns empty string for unchanged files', async () => {
    const diff = await vfs.fileDiff('/project/unchanged.txt');
    expect(diff).toBe('');
  });

  it('keeps changes() canonical while diff() remains an alias', async () => {
    await vfs.writeFile('/project/new.txt', 'x');
    await vfs.rm('/project/delete.txt');

    const canonical = await vfs.changes();
    const alias = await vfs.diff();

    expect(alias).toEqual(canonical);
    expect(canonical).toEqual([
      { path: '/project/delete.txt', type: 'deleted', entity: 'file' },
      { path: '/project/new.txt', type: 'created', entity: 'file' }
    ]);
  });
});
