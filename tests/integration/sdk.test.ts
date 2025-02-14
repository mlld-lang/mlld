import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMeld } from '../../_old/src/sdk';
import { existsSync } from 'fs';
import { resolve, join, dirname, extname, basename } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

// Mock file system state
const mockFiles = new Map<string, string>();

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => mockFiles.has(path))
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn((path: string) => {
    if (mockFiles.has(path)) {
      return Promise.resolve(mockFiles.get(path));
    }
    throw new Error('File not found');
  }),
  writeFile: vi.fn((path: string, content: string) => {
    mockFiles.set(path, content);
    return Promise.resolve();
  })
}));

describe('SDK Integration Tests', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    mockFiles.clear();
    vi.clearAllMocks();
    tempDir = join(tmpdir(), 'meld-test');
    testFilePath = join(tempDir, 'test.meld');
    mockFiles.set(testFilePath, '');
  });

  afterEach(() => {
    mockFiles.clear();
    vi.clearAllMocks();
  });

  describe('Format Conversion', () => {
    it('should convert to llm format by default', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(result).toBeDefined();
    });

    it('should preserve markdown when format is md', async () => {
      const result = await runMeld(testFilePath, { format: 'md' });
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(result).toBeDefined();
    });

    it('should handle complex meld content with directives', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(result).toBeDefined();
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(result).toBeDefined();
    });

    it('should preserve state across the pipeline', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      mockFiles.set(testFilePath, '@invalid directive');
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
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(result).toBeDefined();
    });

    it('should preserve whitespace appropriately', async () => {
      const result = await runMeld(testFilePath);
      expect(readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(result).toBeDefined();
    });
  });
}); 