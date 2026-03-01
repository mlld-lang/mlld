import { describe, expect, it } from 'vitest';
import { VirtualFS } from './VirtualFS';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('VirtualFS stress and hardening regressions', () => {
  it('handles deep directory merges with many files and delete masks', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/repo/a', { recursive: true });
    await backing.mkdir('/repo/b', { recursive: true });

    for (let i = 0; i < 60; i++) {
      await backing.writeFile(`/repo/a/file-${i}.txt`, `base-${i}`);
    }

    const vfs = VirtualFS.over(backing);
    const deletedIndexes = new Set<number>();

    for (let i = 0; i < 60; i++) {
      if (i % 3 === 0) {
        await vfs.rm(`/repo/a/file-${i}.txt`);
        deletedIndexes.add(i);
      } else {
        await vfs.writeFile(`/repo/a/file-${i}.txt`, `shadow-${i}`);
      }
      await vfs.writeFile(`/repo/b/new-${i}.txt`, `new-${i}`);
    }

    await vfs.mkdir('/repo/deep/l1/l2/l3/l4/l5', { recursive: true });
    await vfs.writeFile('/repo/deep/l1/l2/l3/l4/l5/final.txt', 'ok');

    const entriesA = await vfs.readdir('/repo/a');
    for (const index of deletedIndexes) {
      expect(entriesA).not.toContain(`file-${index}.txt`);
    }

    const entriesB = await vfs.readdir('/repo/b');
    expect(entriesB).toContain('new-0.txt');
    expect(entriesB).toContain('new-59.txt');

    const changes = await vfs.changes();
    expect(changes.length).toBeGreaterThan(100);

    const patch = vfs.export();
    const replay = VirtualFS.over(backing);
    replay.apply(patch);
    await replay.flush();

    for (let i = 0; i < 60; i++) {
      if (deletedIndexes.has(i)) {
        expect(await backing.exists(`/repo/a/file-${i}.txt`)).toBe(false);
      } else {
        expect(await backing.readFile(`/repo/a/file-${i}.txt`)).toBe(`shadow-${i}`);
      }
      expect(await backing.readFile(`/repo/b/new-${i}.txt`)).toBe(`new-${i}`);
    }
    expect(await backing.readFile('/repo/deep/l1/l2/l3/l4/l5/final.txt')).toBe('ok');
  });

  it('stays stable across repeated flush/discard cycles', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/repo', { recursive: true });
    await backing.writeFile('/repo/state.txt', '0');

    const vfs = VirtualFS.over(backing);
    for (let i = 1; i <= 40; i++) {
      const tempPath = `/repo/cycles/file-${i}.txt`;
      await vfs.writeFile(tempPath, `v-${i}`);

      if (i % 4 === 0) {
        vfs.discard(tempPath);
      } else if (i % 3 === 0) {
        await vfs.flush(tempPath);
      }

      await vfs.writeFile('/repo/state.txt', String(i));
      if (i % 5 === 0) {
        await vfs.flush('/repo/state.txt');
      }
    }

    await vfs.flush();
    expect(await vfs.changes()).toEqual([]);
    expect(await backing.readFile('/repo/state.txt')).toBe('40');

    for (let i = 1; i <= 40; i++) {
      const exists = await backing.exists(`/repo/cycles/file-${i}.txt`);
      if (i % 4 === 0) {
        expect(exists).toBe(false);
      } else {
        expect(exists).toBe(true);
      }
    }
  });
});
