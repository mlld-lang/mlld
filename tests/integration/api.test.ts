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
      expect(result).toContain('TextDirective');
      expect(result).toContain('"kind": "text"');
      expect(result).toContain('"identifier": "greeting"');
      expect(result).toContain('"value": "Hello"');
    });

    it('should preserve markdown when format is md', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      const result = await main(testFilePath, { format: 'markdown', fs: context.fs });
      expect(result).toBe('### text Directive\n{\n  "kind": "text",\n  "identifier": "greeting",\n  "source": "literal",\n  "value": "Hello"\n}\n\n');
    });

    it('should handle complex meld content with directives', async () => {
      const content = [
        '@text greeting = "Hello"',
        '@text config = "value"',
        '@text projectRoot = "src"'
      ].join('\n');
      
      await context.fs.writeFile(testFilePath, content);
      const result = await main(testFilePath, { fs: context.fs });
      
      // Verify each directive is present and properly formatted
      expect(result).toContain('"identifier": "greeting"');
      expect(result).toContain('"value": "Hello"');
      expect(result).toContain('"identifier": "config"');
      expect(result).toContain('"value": "value"');
      expect(result).toContain('"identifier": "projectRoot"');
      expect(result).toContain('"value": "src"');
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      const result = await main(testFilePath, { fs: context.fs });
      
      // Verify the complete pipeline worked by checking structure and content
      expect(result).toContain('TextDirective');
      expect(result).toContain('"kind": "text"');
      expect(result).toContain('"identifier": "greeting"');
      expect(result).toContain('"value": "Hello"');
    });

    it('should preserve state and directive information', async () => {
      const content = [
        '@text first = "First"',
        '@text second = "Second"',
        '@text combined = "${first} ${second}"'
      ].join('\n');
      
      await context.fs.writeFile(testFilePath, content);
      const result = await main(testFilePath, { fs: context.fs });
      
      // Verify each directive is preserved with its full information
      expect(result).toContain('"identifier": "first"');
      expect(result).toContain('"value": "First"');
      expect(result).toContain('"identifier": "second"');
      expect(result).toContain('"value": "Second"');
      expect(result).toContain('"identifier": "combined"');
      expect(result).toContain('"value": "${first} ${second}"');
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      await context.fs.writeFile(testFilePath, '@invalid not_a_valid_directive');
      await expect(main(testFilePath, { fs: context.fs }))
        .rejects
        .toThrow(/Parse error/);
    });

    it('should handle missing files correctly', async () => {
      await expect(main('missing.meld', { fs: context.fs }))
        .rejects
        .toThrow(/File not found/);
    });

    it('should handle empty files', async () => {
      await context.fs.writeFile(testFilePath, '');
      const result = await main(testFilePath, { fs: context.fs });
      expect(result).toBe(''); // Empty input should produce empty output
    });
  });

  describe('Edge Cases', () => {
    it.todo('should handle large files efficiently');
    it.todo('should handle deeply nested imports');
  });
}); 