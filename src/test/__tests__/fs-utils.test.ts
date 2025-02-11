import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestFileSystem } from '../fs-utils';
import { pathService } from '../../services/path-service';
import path from 'path';
import fs from 'fs-extra';

describe('TestFileSystem', () => {
  let testFs: TestFileSystem;

  beforeEach(async () => {
    testFs = new TestFileSystem();
    await testFs.initialize();
  });

  afterEach(async () => {
    await testFs.cleanup();
  });

  describe('initialization', () => {
    it('creates test directories', async () => {
      expect(await fs.pathExists(testFs.getHomePath())).toBe(true);
      expect(await fs.pathExists(testFs.getProjectPath())).toBe(true);
    });

    it('configures PathService with test paths', () => {
      expect(pathService.getHomePath()).toBe(testFs.getHomePath());
      expect(pathService.getProjectPath()).toBe(testFs.getProjectPath());
    });
  });

  describe('file operations', () => {
    it('writes and reads files', async () => {
      const content = 'test content';
      await testFs.writeFile('test.txt', content);
      expect(await testFs.readFile('test.txt')).toBe(content);
    });

    it('creates nested directories when writing files', async () => {
      const content = 'nested content';
      await testFs.writeFile('nested/dir/test.txt', content);
      expect(await testFs.readFile('nested/dir/test.txt')).toBe(content);
    });

    it('checks file existence', async () => {
      await testFs.writeFile('exists.txt', 'content');
      expect(await testFs.exists('exists.txt')).toBe(true);
      expect(await testFs.exists('nonexistent.txt')).toBe(false);
    });
  });

  describe('path resolution', () => {
    it('resolves paths relative to test root', () => {
      const relativePath = 'some/path/file.txt';
      const expectedPath = path.join(testFs.getPath(''), relativePath);
      expect(testFs.getPath(relativePath)).toBe(expectedPath);
    });

    it('resolves home paths through PathService', () => {
      const resolved = pathService.resolvePath('$HOMEPATH/test/file.txt');
      expect(resolved).toBe(path.join(testFs.getHomePath(), 'test/file.txt'));
    });

    it('resolves project paths through PathService', () => {
      const resolved = pathService.resolvePath('$PROJECTPATH/test/file.txt');
      expect(resolved).toBe(path.join(testFs.getProjectPath(), 'test/file.txt'));
    });
  });

  describe('cleanup', () => {
    it('removes test directories', async () => {
      await testFs.cleanup();
      expect(await fs.pathExists(testFs.getHomePath())).toBe(false);
      expect(await fs.pathExists(testFs.getProjectPath())).toBe(false);
    });

    it('resets PathService to default paths', async () => {
      const originalHome = pathService.getHomePath();
      const originalProject = pathService.getProjectPath();

      await testFs.cleanup();

      // PathService should be reset to original paths
      expect(pathService.getHomePath()).not.toBe(testFs.getHomePath());
      expect(pathService.getProjectPath()).not.toBe(testFs.getProjectPath());
      expect(pathService.getHomePath()).toBe(originalHome);
      expect(pathService.getProjectPath()).toBe(originalProject);
    });
  });
}); 