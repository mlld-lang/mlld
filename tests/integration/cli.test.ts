import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cli } from '../../src/cli/cli';
import { existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => path === 'test.meld'),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('test content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('path', () => ({
  resolve: vi.fn((path: string) => path),
  join: vi.fn((...paths: string[]) => paths.join('/')),
  dirname: vi.fn((path: string) => path.split('/').slice(0, -1).join('/')),
}));

describe('CLI Integration Tests', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), 'meld-test');
    testFilePath = join(tempDir, 'test.meld');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const args = ['node', 'meld', testFilePath];
      await cli(args);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should handle format aliases correctly', async () => {
      const args = ['node', 'meld', testFilePath, '--format', 'llm'];
      await cli(args);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should preserve markdown with md format', async () => {
      const args = ['node', 'meld', testFilePath, '--format', 'md'];
      await cli(args);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const args = ['node', 'meld', testFilePath, '--stdout'];
      await cli(args);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should use default output path when not specified', async () => {
      const args = ['node', 'meld', testFilePath];
      await cli(args);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should handle multiple format options correctly', async () => {
      const args = ['node', 'meld', testFilePath, '--format', 'llm', '--format', 'md'];
      await cli(args);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(writeFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('File Handling', () => {
    it('should handle all supported file extensions', async () => {
      const extensions = ['.meld', '.md'];
      for (const ext of extensions) {
        const inputFile = `test${ext}`;
        const args = ['node', 'meld', inputFile, '--stdout'];
        await expect(cli(args)).resolves.not.toThrow();
      }
    });

    it('should reject unsupported file extensions', async () => {
      const args = ['node', 'meld', 'test.txt'];
      await expect(cli(args)).rejects.toThrow(/Invalid file extension/);
    });

    it('should handle missing input files', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false);
      const args = ['node', 'meld', 'missing.meld'];
      await expect(cli(args)).rejects.toThrow(/File not found/);
    });
  });

  describe('Complex Content', () => {
    it('should handle meld directives with format conversion', async () => {
      const args = ['node', 'meld', testFilePath];
      await cli(args);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(writeFile).toHaveBeenCalled();
    });
  });
}); 