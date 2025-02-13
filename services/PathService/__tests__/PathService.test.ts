import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { PathService } from '../PathService';
import { PathValidationError, PathErrorCode } from '../../../core/errors/PathValidationError';

describe('PathService', () => {
  let service: PathService;
  let mockFileSystem: any;

  beforeEach(() => {
    mockFileSystem = {
      exists: vi.fn(),
      isDirectory: vi.fn()
    };

    service = new PathService();
    service.initialize(mockFileSystem);
  });

  describe('Path resolution', () => {
    it('should resolve relative paths', async () => {
      const baseDir = '/base/dir';
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.isDirectory.mockResolvedValue(false);

      const resolved = await service.resolvePath('file.txt', { baseDir });
      expect(resolved).toBe('/base/dir/file.txt');
    });

    it('should resolve absolute paths', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.isDirectory.mockResolvedValue(false);

      const resolved = await service.resolvePath('/absolute/path/file.txt', {
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe('/absolute/path/file.txt');
    });

    it('should resolve multiple paths', async () => {
      const baseDir = '/base/dir';
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.isDirectory.mockResolvedValue(false);

      const resolved = await service.resolvePaths(['file1.txt', 'file2.txt'], { baseDir });
      expect(resolved).toEqual([
        '/base/dir/file1.txt',
        '/base/dir/file2.txt'
      ]);
    });
  });

  describe('Path validation', () => {
    it('should throw on empty path', async () => {
      await expect(service.resolvePath('')).rejects.toThrow(PathValidationError);
      await expect(service.resolvePath('')).rejects.toMatchObject({
        code: PathErrorCode.INVALID_PATH
      });
    });

    it('should throw on null bytes', async () => {
      await expect(service.resolvePath('file\0.txt')).rejects.toThrow(PathValidationError);
      await expect(service.resolvePath('file\0.txt')).rejects.toMatchObject({
        code: PathErrorCode.NULL_BYTE
      });
    });

    it('should throw when path is outside base directory', async () => {
      const baseDir = '/base/dir';
      await expect(service.resolvePath('../outside.txt', { baseDir }))
        .rejects.toThrow(PathValidationError);
      await expect(service.resolvePath('../outside.txt', { baseDir }))
        .rejects.toMatchObject({
          code: PathErrorCode.OUTSIDE_BASE_DIR
        });
    });

    it('should allow paths outside base directory when configured', async () => {
      const baseDir = '/base/dir';
      const filePath = '/other/dir/file.txt';
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.isDirectory.mockResolvedValue(false);

      const resolved = await service.resolvePath(filePath, {
        baseDir,
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe(filePath);
    });

    it('should throw when path does not exist', async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      await expect(service.resolvePath('nonexistent.txt'))
        .rejects.toThrow(PathValidationError);
      await expect(service.resolvePath('nonexistent.txt'))
        .rejects.toMatchObject({
          code: PathErrorCode.PATH_NOT_FOUND
        });
    });

    it('should not check existence when configured', async () => {
      const resolved = await service.resolvePath('nonexistent.txt', { mustExist: false });
      expect(resolved).toBe(path.resolve(process.cwd(), 'nonexistent.txt'));
    });

    it('should validate file type', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.isDirectory.mockResolvedValue(true);

      await expect(service.resolvePath('/test/dir', { mustBeFile: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_FILE
        });

      mockFileSystem.isDirectory.mockResolvedValue(false);
      await expect(service.resolvePath('/test/file.txt', { mustBeDirectory: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_DIRECTORY
        });
    });
  });

  describe('Path validation helpers', () => {
    it('should check if path is valid', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.isDirectory.mockResolvedValue(false);

      expect(await service.isValidPath('/test/valid.txt', { allowOutsideBaseDir: true }))
        .toBe(true);

      mockFileSystem.exists.mockResolvedValue(false);
      expect(await service.isValidPath('/test/invalid.txt'))
        .toBe(false);
    });
  });
}); 