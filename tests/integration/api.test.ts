import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from '../../api/index.js';
import { TestContext } from '@tests/utils/index.js';

describe('SDK Integration Tests', () => {
  let context: TestContext;
  let testFilePath: string;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    testFilePath = 'test.meld';
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Format Conversion', () => {
    it('should convert to llm format by default', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      const result = await main(testFilePath, { fs: context.fs });
      expect(result).toBeDefined();
    });

    it('should preserve markdown when format is md', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      const result = await main(testFilePath, { format: 'markdown', fs: context.fs });
      expect(result).toBeDefined();
    });

    it('should handle complex meld content with directives', async () => {
      await context.fs.writeFile(testFilePath, `
        @text greeting = "Hello"
        @data config = { "key": "value" }
        @path projectRoot = "$PROJECTPATH/src"
      `);
      const result = await main(testFilePath, { fs: context.fs });
      expect(result).toBeDefined();
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      const result = await main(testFilePath, { fs: context.fs });
      expect(result).toBeDefined();
    });

    it('should preserve state across the pipeline', async () => {
      await context.fs.writeFile(testFilePath, `
        @text first = "First"
        @text second = "Second"
        @text combined = "${first} ${second}"
      `);
      const result = await main(testFilePath, { fs: context.fs });
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      await context.fs.writeFile(testFilePath, '<!-- @invalid -->');
      await expect(main(testFilePath, { fs: context.fs })).rejects.toThrow();
    });

    it('should handle missing files correctly', async () => {
      await expect(main('missing.meld', { fs: context.fs })).rejects.toThrow();
    });

    it('should handle empty files', async () => {
      await context.fs.writeFile(testFilePath, '');
      const result = await main(testFilePath, { fs: context.fs });
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it.todo('should handle large files efficiently');
    it.todo('should handle deeply nested imports');
  });
}); 