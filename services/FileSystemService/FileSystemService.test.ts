import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { FileSystemService } from './FileSystemService';

describe('FileSystemService', () => {
  let service: FileSystemService;
  const testDir = path.join(process.cwd(), 'test-fs');
  
  beforeEach(async () => {
    service = new FileSystemService();
    await fs.ensureDir(testDir);
  });
  
  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('Real mode operations', () => {
    describe('File operations', () => {
      it('should write and read a file', async () => {
        const filePath = path.join(testDir, 'test.txt');
        const content = 'Hello, World!';
        
        await service.writeFile(filePath, content);
        const result = await service.readFile(filePath);
        
        expect(result).toBe(content);
      });

      it('should check if a file exists', async () => {
        const filePath = path.join(testDir, 'exists.txt');
        
        expect(await service.exists(filePath)).toBe(false);
        await service.writeFile(filePath, 'content');
        expect(await service.exists(filePath)).toBe(true);
      });

      it('should get file stats', async () => {
        const filePath = path.join(testDir, 'stats.txt');
        await service.writeFile(filePath, 'content');
        
        const stats = await service.stat(filePath);
        expect(stats.isFile()).toBe(true);
        expect(stats.isDirectory()).toBe(false);
      });

      it('should throw when reading non-existent file', async () => {
        const filePath = path.join(testDir, 'nonexistent.txt');
        await expect(service.readFile(filePath)).rejects.toThrow();
      });
    });

    describe('Directory operations', () => {
      it('should create and read directory', async () => {
        const dirPath = path.join(testDir, 'subdir');
        await service.ensureDir(dirPath);
        
        const exists = await service.exists(dirPath);
        const isDir = await service.isDirectory(dirPath);
        
        expect(exists).toBe(true);
        expect(isDir).toBe(true);
      });

      it('should list directory contents', async () => {
        const dirPath = path.join(testDir, 'listdir');
        await service.ensureDir(dirPath);
        await service.writeFile(path.join(dirPath, 'file1.txt'), 'content1');
        await service.writeFile(path.join(dirPath, 'file2.txt'), 'content2');
        
        const files = await service.readDir(dirPath);
        expect(files).toHaveLength(2);
        expect(files).toContain('file1.txt');
        expect(files).toContain('file2.txt');
      });
    });

    describe('Path operations', () => {
      it('should join paths', () => {
        const result = service.join('a', 'b', 'c');
        expect(result).toBe(path.join('a', 'b', 'c'));
      });

      it('should resolve paths', () => {
        const result = service.resolve('a', '../b');
        expect(result).toBe(path.resolve('a', '../b'));
      });

      it('should get dirname', () => {
        expect(service.dirname('/a/b/c.txt')).toBe('/a/b');
      });

      it('should get basename', () => {
        expect(service.basename('/a/b/c.txt')).toBe('c.txt');
      });
    });
  });

  describe('Test mode operations', () => {
    beforeEach(() => {
      service.enableTestMode();
    });

    it('should be in test mode', () => {
      expect(service.isTestMode()).toBe(true);
    });

    it('should mock and read files', async () => {
      const filePath = '/test/file.txt';
      const content = 'Mock content';
      
      service.mockFile(filePath, content);
      const result = await service.readFile(filePath);
      
      expect(result).toBe(content);
    });

    it('should mock directories', async () => {
      const dirPath = '/test/dir';
      service.mockDir(dirPath);
      
      const exists = await service.exists(dirPath);
      const isDir = await service.isDirectory(dirPath);
      
      expect(exists).toBe(true);
      expect(isDir).toBe(true);
    });

    it('should list mock directory contents', async () => {
      const dirPath = '/test/dir';
      service.mockDir(dirPath);
      service.mockFile('/test/dir/file1.txt', 'content1');
      service.mockFile('/test/dir/file2.txt', 'content2');
      
      const files = await service.readDir(dirPath);
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('should clear mocks', async () => {
      service.mockFile('/test/file.txt', 'content');
      service.mockDir('/test/dir');
      
      service.clearMocks();
      
      await expect(service.readFile('/test/file.txt')).rejects.toThrow();
      await expect(service.readDir('/test/dir')).rejects.toThrow();
    });

    it('should automatically create parent directories when mocking files', async () => {
      service.mockFile('/test/nested/deep/file.txt', 'content');
      
      expect(await service.isDirectory('/test')).toBe(true);
      expect(await service.isDirectory('/test/nested')).toBe(true);
      expect(await service.isDirectory('/test/nested/deep')).toBe(true);
    });

    it('should normalize paths', async () => {
      service.mockFile('/test/./nested/../file.txt', 'content');
      
      expect(await service.readFile('/test/file.txt')).toBe('content');
    });

    it('should throw when mocking outside test mode', () => {
      service.disableTestMode();
      expect(() => service.mockFile('/test/file.txt', 'content')).toThrow();
      expect(() => service.mockDir('/test/dir')).toThrow();
    });
  });
}); 