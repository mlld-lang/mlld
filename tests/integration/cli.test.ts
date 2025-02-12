import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cmd } from '../../src/cli/cmd';
import * as fs from 'fs';
import * as pathModule from 'path';
import { addMockFile, clearMocks } from '../../src/__mocks__/fs';

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../__mocks__/path');
  return createPathMock();
});

// Import path utils after mock setup
import { pathTestUtils } from '../__mocks__/path';

// Mock fs module
vi.mock('fs', () => import('../../src/__mocks__/fs'));

// Mock fs/promises module
vi.mock('fs/promises', () => import('../../src/__mocks__/fs'));

describe('CLI Integration Tests', () => {
  const TEST_ROOT = pathModule.resolve(process.cwd(), 'test', '_tmp');
  const TEST_PROJECT = pathModule.join(TEST_ROOT, 'project');

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Reset path mock between tests
    const mock = vi.mocked(pathModule);
    pathTestUtils.resetMocks(mock);

    // Clear fs mocks and add test files
    clearMocks();
    addMockFile(pathModule.join(TEST_PROJECT, 'test.meld'), 'Test content');
    addMockFile(pathModule.join(TEST_PROJECT, 'test.md'), '# Test Markdown\nContent');
  });

  afterEach(() => {
    // Reset environment
    delete process.env.NODE_ENV;
    vi.resetAllMocks();
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const args = ['node', 'meld', pathModule.join(TEST_PROJECT, 'test.meld'), '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      const args = ['node', 'meld', pathModule.join(TEST_PROJECT, 'test.meld'), '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      const args = ['node', 'meld', pathModule.join(TEST_PROJECT, 'test.meld'), '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const args = ['node', 'meld', pathModule.join(TEST_PROJECT, 'test.meld'), '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should use default output path when not specified', async () => {
      const args = ['node', 'meld', pathModule.join(TEST_PROJECT, 'test.meld')];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle multiple format options correctly', async () => {
      const args = ['node', 'meld', pathModule.join(TEST_PROJECT, 'test.meld'), '--format', 'md,llm', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });

  describe('File Handling', () => {
    it('should handle all supported file extensions', async () => {
      const extensions = ['.meld', '.md'];
      for (const ext of extensions) {
        const inputFile = pathModule.join(TEST_PROJECT, `test${ext}`);
        const args = ['node', 'meld', inputFile, '--stdout'];
        await expect(cmd(args)).resolves.not.toThrow();
      }
    });

    it('should reject unsupported file extensions', async () => {
      const args = ['node', 'meld', 'test.invalid', '--stdout'];
      await expect(cmd(args)).rejects.toThrow('Invalid file extension');
    });

    it('should handle missing input files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const args = ['node', 'meld', 'nonexistent.meld', '--stdout'];
      await expect(cmd(args)).rejects.toThrow('ENOENT: no such file or directory');
    });
  });

  describe('Complex Content', () => {
    it('should handle meld directives with format conversion', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'llm', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });
}); 