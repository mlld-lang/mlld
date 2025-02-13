import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { PathService } from './PathService';
import { FileSystemService } from '../FileSystemService/FileSystemService';
import { PathValidationError, PathErrorCode } from '../../core/errors/PathValidationError';

describe('PathService', () => {
  let pathService: PathService;
  let fileSystem: FileSystemService;
  
  beforeEach(() => {
    fileSystem = new FileSystemService();
    fileSystem.enableTestMode();
    
    pathService = new PathService();
    pathService.initialize(fileSystem);
  });
  
  describe('Path resolution', () => {
    it('should resolve relative paths', async () => {
      const baseDir = '/base/dir';
      fileSystem.mockDir(baseDir);
      fileSystem.mockFile('/base/dir/file.txt', 'content');
      
      const resolved = await pathService.resolvePath('file.txt', { baseDir });
      expect(resolved).toBe(path.resolve(baseDir, 'file.txt'));
    });
    
    it('should resolve absolute paths', async () => {
      const filePath = '/absolute/path/file.txt';
      fileSystem.mockFile(filePath, 'content');
      
      const resolved = await pathService.resolvePath(filePath, { allowOutsideBaseDir: true });
      expect(resolved).toBe(filePath);
    });
    
    it('should resolve multiple paths', async () => {
      const baseDir = '/base/dir';
      fileSystem.mockDir(baseDir);
      fileSystem.mockFile('/base/dir/file1.txt', 'content1');
      fileSystem.mockFile('/base/dir/file2.txt', 'content2');
      
      const resolved = await pathService.resolvePaths(['file1.txt', 'file2.txt'], { baseDir });
      expect(resolved).toEqual([
        path.resolve(baseDir, 'file1.txt'),
        path.resolve(baseDir, 'file2.txt')
      ]);
    });
  });
  
  describe('Path validation', () => {
    it('should throw on empty path', async () => {
      await expect(pathService.resolvePath('')).rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('')).rejects.toMatchObject({
        code: PathErrorCode.INVALID_PATH
      });
    });
    
    it('should throw on null bytes', async () => {
      await expect(pathService.resolvePath('file\0.txt')).rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('file\0.txt')).rejects.toMatchObject({
        code: PathErrorCode.NULL_BYTE
      });
    });
    
    it('should throw when path is outside base directory', async () => {
      const baseDir = '/base/dir';
      await expect(pathService.resolvePath('../outside.txt', { baseDir }))
        .rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('../outside.txt', { baseDir }))
        .rejects.toMatchObject({
          code: PathErrorCode.OUTSIDE_BASE_DIR
        });
    });
    
    it('should allow paths outside base directory when configured', async () => {
      const baseDir = '/base/dir';
      const filePath = '/other/dir/file.txt';
      fileSystem.mockFile(filePath, 'content');
      
      const resolved = await pathService.resolvePath(filePath, {
        baseDir,
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe(filePath);
    });
    
    it('should throw when path does not exist', async () => {
      await expect(pathService.resolvePath('nonexistent.txt'))
        .rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('nonexistent.txt'))
        .rejects.toMatchObject({
          code: PathErrorCode.PATH_NOT_FOUND
        });
    });
    
    it('should not check existence when configured', async () => {
      const resolved = await pathService.resolvePath('nonexistent.txt', { mustExist: false });
      expect(resolved).toBe(path.resolve(process.cwd(), 'nonexistent.txt'));
    });
    
    it('should validate file type', async () => {
      fileSystem.mockDir('/test/dir');
      fileSystem.mockFile('/test/file.txt', 'content');
      
      await expect(pathService.resolvePath('/test/dir', { mustBeFile: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_FILE
        });
      
      await expect(pathService.resolvePath('/test/file.txt', { mustBeDirectory: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_DIRECTORY
        });
    });
  });
  
  describe('Path variables', () => {
    it('should expand path variables', async () => {
      fileSystem.mockFile('/home/user/file.txt', 'content');
      pathService.setPathVariable('HOME', '/home/user');
      
      const resolved = await pathService.resolvePath('$HOME/file.txt', {
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe('/home/user/file.txt');
    });
    
    it('should expand variables with braces', async () => {
      fileSystem.mockFile('/home/user/file.txt', 'content');
      pathService.setPathVariable('HOME', '/home/user');
      
      const resolved = await pathService.resolvePath('${HOME}/file.txt', {
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe('/home/user/file.txt');
    });
    
    it('should handle multiple variables in one path', async () => {
      fileSystem.mockFile('/home/user/project/src/file.txt', 'content');
      pathService.setPathVariable('HOME', '/home/user');
      pathService.setPathVariable('PROJECT', 'project');
      
      const expanded = pathService.expandPathVariables('$HOME/$PROJECT/src/file.txt');
      expect(expanded).toBe('/home/user/project/src/file.txt');
    });
    
    it('should throw on invalid variable names', () => {
      expect(() => pathService.setPathVariable('', '/value'))
        .toThrow(PathValidationError);
      expect(() => pathService.setPathVariable('name', ''))
        .toThrow(PathValidationError);
    });
    
    it('should clear and reinitialize variables', () => {
      pathService.setPathVariable('CUSTOM', 'value');
      expect(pathService.getPathVariable('CUSTOM')).toBe('value');
      
      pathService.clearPathVariables();
      expect(pathService.getPathVariable('CUSTOM')).toBeUndefined();
      expect(pathService.getPathVariable('HOME')).toBeDefined();
      expect(pathService.getPathVariable('PROJECTPATH')).toBeDefined();
    });
  });
  
  describe('Path validation helpers', () => {
    it('should check if path is valid', async () => {
      fileSystem.mockFile('/test/valid.txt', 'content');
      
      expect(await pathService.isValidPath('/test/valid.txt', { allowOutsideBaseDir: true }))
        .toBe(true);
      expect(await pathService.isValidPath('/test/invalid.txt'))
        .toBe(false);
    });
  });
}); 