import { describe, expect, it } from 'vitest';
import { VirtualFS } from './VirtualFS';
import { VirtualFSAdapter } from './VirtualFSAdapter';

describe('VirtualFSAdapter', () => {
  describe('readFile / writeFile', () => {
    it('reads and writes through VirtualFS shadow state', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/test.txt', 'hello world');
      const content = await adapter.readFile('/test.txt');
      expect(content).toBe('hello world');

      // Confirm it's in VirtualFS shadow state
      expect(await vfs.readFile('/test.txt')).toBe('hello world');
    });

    it('handles Uint8Array content', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      const bytes = new TextEncoder().encode('binary content');
      await adapter.writeFile('/bin.txt', bytes);
      expect(await adapter.readFile('/bin.txt')).toBe('binary content');
    });

    it('throws ENOENT for missing files', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await expect(adapter.readFile('/missing.txt')).rejects.toThrow(/ENOENT/);
    });
  });

  describe('readFileBuffer', () => {
    it('returns UTF-8 bytes', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await vfs.writeFile('/data.txt', 'test');
      const buf = await adapter.readFileBuffer('/data.txt');
      expect(buf).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(buf)).toBe('test');
    });
  });

  describe('appendFile', () => {
    it('appends to existing file', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/log.txt', 'line1\n');
      await adapter.appendFile('/log.txt', 'line2\n');
      expect(await adapter.readFile('/log.txt')).toBe('line1\nline2\n');
    });
  });

  describe('exists / stat', () => {
    it('reports existence correctly', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      expect(await adapter.exists('/nope')).toBe(false);
      await adapter.writeFile('/yes.txt', 'hi');
      expect(await adapter.exists('/yes.txt')).toBe(true);
    });

    it('stat returns file info', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/file.txt', 'content');
      const s = await adapter.stat('/file.txt');
      expect(s.isFile).toBe(true);
      expect(s.isDirectory).toBe(false);
      expect(s.size).toBeGreaterThan(0);
    });

    it('stat returns directory info', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.mkdir('/mydir');
      const s = await adapter.stat('/mydir');
      expect(s.isFile).toBe(false);
      expect(s.isDirectory).toBe(true);
    });
  });

  describe('mkdir / readdir', () => {
    it('creates and lists directories', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.mkdir('/project', { recursive: true });
      await adapter.writeFile('/project/a.txt', 'a');
      await adapter.writeFile('/project/b.txt', 'b');

      const entries = await adapter.readdir('/project');
      expect(entries).toEqual(['a.txt', 'b.txt']);
    });

    it('readdirWithFileTypes returns typed entries', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.mkdir('/root/sub', { recursive: true });
      await adapter.writeFile('/root/file.txt', 'hi');

      const entries = await adapter.readdirWithFileTypes('/root');
      const fileEntry = entries.find((e) => e.name === 'file.txt');
      const dirEntry = entries.find((e) => e.name === 'sub');

      expect(fileEntry?.isFile).toBe(true);
      expect(fileEntry?.isDirectory).toBe(false);
      expect(dirEntry?.isFile).toBe(false);
      expect(dirEntry?.isDirectory).toBe(true);
    });
  });

  describe('rm', () => {
    it('removes files', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/delete-me.txt', 'gone');
      await adapter.rm('/delete-me.txt');
      expect(await adapter.exists('/delete-me.txt')).toBe(false);
    });

    it('removes directories recursively', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.mkdir('/dir/sub', { recursive: true });
      await adapter.writeFile('/dir/sub/file.txt', 'hi');
      await adapter.rm('/dir', { recursive: true });
      expect(await adapter.exists('/dir')).toBe(false);
    });
  });

  describe('cp / mv', () => {
    it('copies a file', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/src.txt', 'data');
      await adapter.cp('/src.txt', '/dst.txt');
      expect(await adapter.readFile('/dst.txt')).toBe('data');
      expect(await adapter.readFile('/src.txt')).toBe('data'); // original preserved
    });

    it('copies directory recursively', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.mkdir('/src/nested', { recursive: true });
      await adapter.writeFile('/src/a.txt', 'a');
      await adapter.writeFile('/src/nested/b.txt', 'b');
      await adapter.cp('/src', '/dst', { recursive: true });

      expect(await adapter.readFile('/dst/a.txt')).toBe('a');
      expect(await adapter.readFile('/dst/nested/b.txt')).toBe('b');
    });

    it('moves a file', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/old.txt', 'moved');
      await adapter.mv('/old.txt', '/new.txt');
      expect(await adapter.readFile('/new.txt')).toBe('moved');
      expect(await adapter.exists('/old.txt')).toBe(false);
    });
  });

  describe('path utilities', () => {
    it('resolvePath joins and normalizes', () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      expect(adapter.resolvePath('/home/user', 'docs/file.txt')).toBe(
        '/home/user/docs/file.txt'
      );
      expect(adapter.resolvePath('/home/user', '../root')).toBe('/home/root');
      expect(adapter.resolvePath('/a', '/absolute')).toBe('/absolute');
    });

    it('getAllPaths returns shadow entries', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.mkdir('/dir', { recursive: true });
      await adapter.writeFile('/dir/file.txt', 'hi');

      const paths = adapter.getAllPaths();
      expect(paths).toContain('/dir');
      expect(paths).toContain('/dir/file.txt');
    });
  });

  describe('symlink stubs', () => {
    it('symlink throws ENOSYS', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await expect(adapter.symlink('/target', '/link')).rejects.toThrow(
        /ENOSYS/
      );
    });

    it('readlink throws ENOSYS', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await expect(adapter.readlink('/link')).rejects.toThrow(/ENOSYS/);
    });

    it('link copies content as hard-link approximation', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/original.txt', 'shared');
      await adapter.link('/original.txt', '/linked.txt');
      expect(await adapter.readFile('/linked.txt')).toBe('shared');
    });
  });

  describe('realpath', () => {
    it('returns normalized path for existing file', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/a/b/c.txt', 'hi');
      expect(await adapter.realpath('/a/b/../b/c.txt')).toBe('/a/b/c.txt');
    });

    it('throws ENOENT for missing path', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await expect(adapter.realpath('/missing')).rejects.toThrow(/ENOENT/);
    });
  });

  describe('no-op methods', () => {
    it('chmod does not throw', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/f.txt', 'x');
      await expect(adapter.chmod('/f.txt', 0o755)).resolves.toBeUndefined();
    });

    it('utimes does not throw', async () => {
      const vfs = VirtualFS.empty();
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/f.txt', 'x');
      await expect(
        adapter.utimes('/f.txt', new Date(), new Date())
      ).resolves.toBeUndefined();
    });
  });

  describe('backing filesystem passthrough', () => {
    it('reads from backing when shadow has no entry', async () => {
      const { MemoryFileSystem } = await import(
        '../../tests/utils/MemoryFileSystem'
      );
      const backing = new MemoryFileSystem();
      await backing.mkdir('/data', { recursive: true });
      await backing.writeFile('/data/existing.txt', 'from backing');

      const vfs = VirtualFS.over(backing);
      const adapter = new VirtualFSAdapter(vfs);

      expect(await adapter.readFile('/data/existing.txt')).toBe('from backing');
    });

    it('shadow writes override backing reads', async () => {
      const { MemoryFileSystem } = await import(
        '../../tests/utils/MemoryFileSystem'
      );
      const backing = new MemoryFileSystem();
      await backing.mkdir('/data', { recursive: true });
      await backing.writeFile('/data/file.txt', 'original');

      const vfs = VirtualFS.over(backing);
      const adapter = new VirtualFSAdapter(vfs);

      await adapter.writeFile('/data/file.txt', 'overridden');
      expect(await adapter.readFile('/data/file.txt')).toBe('overridden');

      // Backing unchanged
      expect(await backing.readFile('/data/file.txt')).toBe('original');
    });
  });
});
