import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
import * as path from 'path';

describe('MemfsTestFileSystem', () => {
  let fs: MemfsTestFileSystem;

  beforeEach(async () => {
    fs = new MemfsTestFileSystem();
    fs.initialize();
    // Ensure project directory exists
    await fs.mkdir('/project');
  });

  afterEach(async () => {
    await fs.cleanup();
  });

  describe('basic file operations', () => {
    it('writes and reads a file', async () => {
      const filePath = '/project/test.txt';
      const content = 'Hello, World!';
      
      await fs.writeFile(filePath, content);
      const result = await fs.readFile(filePath);
      expect(result).toBe(content);
    });

    it('checks file existence', async () => {
      const filePath = '/project/test.txt';
      
      expect(await fs.exists(filePath)).toBe(false);
      await fs.writeFile(filePath, 'content');
      expect(await fs.exists(filePath)).toBe(true);
    });

    it('removes files', async () => {
      const filePath = '/project/test.txt';
      
      await fs.writeFile(filePath, 'content');
      expect(await fs.exists(filePath)).toBe(true);
      
      await fs.remove(filePath);
      expect(await fs.exists(filePath)).toBe(false);
    });
  });

  describe('directory operations', () => {
    it('creates directories', async () => {
      const dirPath = '/project/test/nested';
      
      await fs.mkdir(dirPath);
      expect(await fs.exists(dirPath)).toBe(true);
      expect(await fs.isDirectory(dirPath)).toBe(true);
    });

    it('lists directory contents', async () => {
      const dirPath = '/project/test';
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(dirPath, 'file2.txt'), 'content2');

      const contents = await fs.readDir(dirPath);
      expect(contents).toContain('file1.txt');
      expect(contents).toContain('file2.txt');
    });

    it('removes directories recursively', async () => {
      const dirPath = '/project/test';
      const filePath = path.join(dirPath, 'file.txt');
      
      await fs.mkdir(dirPath);
      await fs.writeFile(filePath, 'content');
      
      await fs.remove(dirPath);
      expect(await fs.exists(dirPath)).toBe(false);
      expect(await fs.exists(filePath)).toBe(false);
    });
  });

  describe('path handling', () => {
    it('creates parent directories when writing files', async () => {
      const filePath = '/project/deep/nested/test.txt';
      
      await fs.writeFile(filePath, 'content');
      expect(await fs.exists('/project/deep')).toBe(true);
      expect(await fs.exists('/project/deep/nested')).toBe(true);
      expect(await fs.exists(filePath)).toBe(true);
    });

    it('converts relative paths to absolute', () => {
      const relativePath = 'test/file.txt';
      const absolutePath = fs.getPath(relativePath);
      
      expect(absolutePath).toBe('/project/test/file.txt');
    });
  });

  describe('file type checks', () => {
    it('identifies files correctly', async () => {
      const filePath = '/project/test.txt';
      const dirPath = '/project/dir';
      
      await fs.writeFile(filePath, 'content');
      await fs.mkdir(dirPath);
      
      expect(await fs.isFile(filePath)).toBe(true);
      expect(await fs.isFile(dirPath)).toBe(false);
    });

    it('identifies directories correctly', async () => {
      const filePath = '/project/test.txt';
      const dirPath = '/project/dir';
      
      await fs.writeFile(filePath, 'content');
      await fs.mkdir(dirPath);
      
      expect(await fs.isDirectory(dirPath)).toBe(true);
      expect(await fs.isDirectory(filePath)).toBe(false);
    });
  });

  describe('initialization and cleanup', () => {
    it('creates project root on initialization', async () => {
      expect(await fs.exists('/project')).toBe(true);
      expect(await fs.isDirectory('/project')).toBe(true);
    });

    it('cleans up all files on cleanup', async () => {
      await fs.writeFile('/project/test.txt', 'content');
      await fs.mkdir('/project/dir');
      
      fs.cleanup();
      
      expect(await fs.exists('/project/test.txt')).toBe(false);
      expect(await fs.exists('/project/dir')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('throws when reading non-existent file', async () => {
      await expect(fs.readFile('/project/nonexistent.txt')).rejects.toThrow();
    });

    it('throws when getting stats of non-existent path', async () => {
      await expect(fs.stat('/project/nonexistent')).rejects.toThrow();
    });
  });
}); 