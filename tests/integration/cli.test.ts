import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from '../../cli/index.js';
import { TestContext } from '@tests/utils/index.js';

describe('CLI Integration Tests', () => {
  let context: TestContext;
  let originalArgv: string[];

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    originalArgv = process.argv;
  });

  afterEach(async () => {
    await context.cleanup();
    process.argv = originalArgv;
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should process a simple meld file', async () => {
      // Set up test file
      await context.fs.writeFile('test.meld', '@text greeting = "Hello"');
      
      // Set process.argv
      process.argv = ['node', 'meld', 'test.meld', '--stdout'];
      
      // Run CLI
      await expect(main()).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      await context.fs.writeFile('test.meld', '@text greeting = "Hello"');
      process.argv = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(main()).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      await context.fs.writeFile('test.meld', '# Heading\n@text greeting = "Hello"');
      process.argv = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(main()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing input files', async () => {
      process.argv = ['node', 'meld', 'nonexistent.meld', '--stdout'];
      await expect(main()).rejects.toThrow('Failed to read file');
    });

    it('should handle invalid file extensions', async () => {
      await context.fs.writeFile('test.invalid', '@text greeting = "Hello"');
      process.argv = ['node', 'meld', 'test.invalid', '--stdout'];
      await expect(main()).rejects.toThrow('Invalid file extension');
    });
  });
}); 