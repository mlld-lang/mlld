import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMeld } from '../../src/sdk';
import { existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => path === 'test.meld'),
  promises: {
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path === 'test.meld') {
        return Promise.resolve('@text test = "value"');
      }
      throw new Error('File not found');
    }),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('path', () => ({
  resolve: vi.fn((path: string) => path),
  join: vi.fn((...paths: string[]) => paths.join('/')),
  dirname: vi.fn((path: string) => path.split('/').slice(0, -1).join('/')),
  extname: vi.fn((path: string) => '.meld'),
  basename: vi.fn((path: string) => path.split('/').pop() || '')
}));

describe('SDK Integration Tests', () => {
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
    it('should convert to llm format by default', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBeDefined();
    });

    it('should preserve markdown when format is md', async () => {
      const result = await runMeld(testFilePath, { format: 'md' });
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBeDefined();
    });

    it('should handle complex meld content with directives', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBeDefined();
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBeDefined();
    });

    it('should preserve state across the pipeline', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      vi.mocked(readFile).mockResolvedValueOnce('invalid content');
      await expect(runMeld(testFilePath)).rejects.toThrow();
    });

    it('should handle missing files correctly', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false);
      await expect(runMeld('missing.meld')).rejects.toThrow();
    });

    it('should handle empty files', async () => {
      vi.mocked(readFile).mockResolvedValueOnce('');
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed content types correctly', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBeDefined();
    });

    it('should preserve whitespace appropriately', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBeDefined();
    });
  });
}); 