import { describe, expect, it } from 'vitest';
import { MemoryFileSystem } from './MemoryFileSystem';
import { VirtualFS } from '@services/fs/VirtualFS';

describe('MemoryFileSystem parity', () => {
  it('keeps root-directory semantics', async () => {
    const fs = new MemoryFileSystem();
    expect(await fs.exists('/')).toBe(true);
    expect(await fs.isDirectory('/')).toBe(true);
  });

  it('supports write/read/append path behavior with normalization', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('project\\a.txt', 'A');
    await fs.appendFile('/project/a.txt', 'B');

    expect(await fs.readFile('/project/a.txt')).toBe('AB');
    expect(await fs.exists('/project/a.txt')).toBe(true);
  });

  it('supports mkdir/readdir/stat parity', async () => {
    const fs = new MemoryFileSystem();
    await fs.mkdir('/project/src', { recursive: true });
    await fs.writeFile('/project/src/main.mld', '/show "ok"');
    await fs.writeFile('/project/src/utils.mld', '/show "u"');

    const entries = await fs.readdir('/project/src');
    expect(entries).toEqual(['main.mld', 'utils.mld']);

    const fileStat = await fs.stat('/project/src/main.mld');
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.isDirectory()).toBe(false);

    const dirStat = await fs.stat('/project/src');
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('supports rm/unlink/access with ENOENT shape', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/tmp/file.txt', 'x');
    await fs.unlink('/tmp/file.txt');

    await expect(fs.readFile('/tmp/file.txt')).rejects.toMatchObject({
      code: 'ENOENT',
      path: '/tmp/file.txt'
    });

    await expect(fs.access('/tmp/missing.txt')).rejects.toMatchObject({
      code: 'ENOENT',
      path: '/tmp/missing.txt'
    });

    await fs.rm('/tmp/missing.txt', { force: true });
  });

  it('preserves isVirtual and execute helper behavior', async () => {
    const fs = new MemoryFileSystem();
    expect(fs.isVirtual()).toBe(true);

    const result = await fs.execute('echo test');
    expect(result).toEqual({
      stdout: 'Mock output for: echo test',
      stderr: '',
      exitCode: 0
    });
  });

  it('exposes the underlying VirtualFS for advanced assertions', () => {
    const fs = new MemoryFileSystem();
    expect(fs.getVirtualFS()).toBeInstanceOf(VirtualFS);
  });
});
