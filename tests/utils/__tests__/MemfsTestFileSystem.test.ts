import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
import * as path from 'path';

describe('MemfsTestFileSystem', () => {
  let fs: MemfsTestFileSystem;

  beforeEach(() => {
    fs = new MemfsTestFileSystem();
    fs.initialize();
  });

  afterEach(() => {
    fs.cleanup();
  });

  describe('basic file operations', () => {
    it('writes and reads a file', () => {
      const filePath = '/project/test.txt';
      const content = 'Hello, World!';
      
      fs.writeFile(filePath, content);
      expect(fs.readFile(filePath)).toBe(content);
    });

    it('checks file existence', () => {
      const filePath = '/project/test.txt';
      
      expect(fs.exists(filePath)).toBe(false);
      fs.writeFile(filePath, 'content');
      expect(fs.exists(filePath)).toBe(true);
    });

    it('removes files', () => {
      const filePath = '/project/test.txt';
      
      fs.writeFile(filePath, 'content');
      expect(fs.exists(filePath)).toBe(true);
      
      fs.remove(filePath);
      expect(fs.exists(filePath)).toBe(false);
    });
  });

  describe('directory operations', () => {
    it('creates directories', () => {
      const dirPath = '/project/test/nested';
      
      fs.mkdir(dirPath);
      expect(fs.exists(dirPath)).toBe(true);
      expect(fs.isDirectory(dirPath)).toBe(true);
    });

    it('lists directory contents', () => {
      const dirPath = '/project/test';
      fs.mkdir(dirPath);
      fs.writeFile(path.join(dirPath, 'file1.txt'), 'content1');
      fs.writeFile(path.join(dirPath, 'file2.txt'), 'content2');

      const contents = fs.readdir(dirPath);
      expect(contents).toContain('file1.txt');
      expect(contents).toContain('file2.txt');
    });

    it('removes directories recursively', () => {
      const dirPath = '/project/test';
      const filePath = path.join(dirPath, 'file.txt');
      
      fs.mkdir(dirPath);
      fs.writeFile(filePath, 'content');
      
      fs.remove(dirPath);
      expect(fs.exists(dirPath)).toBe(false);
      expect(fs.exists(filePath)).toBe(false);
    });
  });

  describe('path handling', () => {
    it('creates parent directories when writing files', () => {
      const filePath = '/project/deep/nested/test.txt';
      
      fs.writeFile(filePath, 'content');
      expect(fs.exists('/project/deep')).toBe(true);
      expect(fs.exists('/project/deep/nested')).toBe(true);
      expect(fs.exists(filePath)).toBe(true);
    });

    it('converts relative paths to absolute', () => {
      const relativePath = 'test/file.txt';
      const absolutePath = fs.getPath(relativePath);
      
      expect(absolutePath).toBe('/project/test/file.txt');
    });
  });

  describe('file type checks', () => {
    it('identifies files correctly', () => {
      const filePath = '/project/test.txt';
      const dirPath = '/project/dir';
      
      fs.writeFile(filePath, 'content');
      fs.mkdir(dirPath);
      
      expect(fs.isFile(filePath)).toBe(true);
      expect(fs.isFile(dirPath)).toBe(false);
    });

    it('identifies directories correctly', () => {
      const filePath = '/project/test.txt';
      const dirPath = '/project/dir';
      
      fs.writeFile(filePath, 'content');
      fs.mkdir(dirPath);
      
      expect(fs.isDirectory(dirPath)).toBe(true);
      expect(fs.isDirectory(filePath)).toBe(false);
    });
  });

  describe('initialization and cleanup', () => {
    it('creates project root on initialization', () => {
      expect(fs.exists('/project')).toBe(true);
      expect(fs.isDirectory('/project')).toBe(true);
    });

    it('cleans up all files on cleanup', () => {
      fs.writeFile('/project/test.txt', 'content');
      fs.mkdir('/project/dir');
      
      fs.cleanup();
      
      expect(fs.exists('/project/test.txt')).toBe(false);
      expect(fs.exists('/project/dir')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('throws when reading non-existent file', () => {
      expect(() => fs.readFile('/project/nonexistent.txt')).toThrow();
    });

    it('throws when getting stats of non-existent path', () => {
      expect(() => fs.stat('/project/nonexistent')).toThrow();
    });
  });
}); 