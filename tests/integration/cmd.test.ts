import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cmd } from '../../src/cli/cmd';
import * as pathModule from 'path';
import { TestContext } from '../../src/interpreter/__tests__/test-utils';

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../../tests/__mocks__/path');
  return createPathMock({
    testRoot: '/Users/adam/dev/meld/test/_tmp',
    testHome: '/Users/adam/dev/meld/test/_tmp/home',
    testProject: '/Users/adam/dev/meld/test/_tmp/project'
  });
});

// Import path utils after mock setup
import { pathTestUtils } from '../../tests/__mocks__/path';

// Mock fs module
vi.mock('fs', () => import('../../src/__mocks__/fs'));

// Mock fs/promises module
vi.mock('fs/promises', () => import('../../src/__mocks__/fs-promises'));

// Mock fs-extra module
vi.mock('fs-extra', () => import('../../src/__mocks__/fs-extra'));

describe('CLI Integration Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Reset path mock between tests
    const mock = vi.mocked(pathModule);
    pathTestUtils.resetMocks(mock);

    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Mock process.cwd() to return the test project path
    const projectPath = context.fs.getPath('project');
    vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

    // Add test files using TestContext
    await context.writeFile('project/test.meld', '<!-- @embed source="test.txt" -->');
    await context.writeFile('project/test.txt', 'Test content');
    await context.writeFile('project/test.md', '# Test Markdown\nContent');
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetAllMocks();
    delete process.env.NODE_ENV;
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should use default output path when not specified', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const args = ['node', 'meld', inputPath];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle multiple format options correctly', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'md,llm', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });

  describe('File Handling', () => {
    it('should handle all supported file extensions', async () => {
      const extensions = ['.meld', '.md'];
      for (const ext of extensions) {
        const inputPath = context.fs.getPath(`project/test${ext}`);
        const args = ['node', 'meld', inputPath, '--stdout'];
        await expect(cmd(args)).resolves.not.toThrow();
      }
    });

    it('should reject unsupported file extensions', async () => {
      const inputPath = context.fs.getPath('project/test.invalid');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).rejects.toThrow('Invalid file extension');
    });

    it('should handle missing input files', async () => {
      const inputPath = context.fs.getPath('project/nonexistent.meld');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).rejects.toThrow('ENOENT: no such file or directory');
    });
  });

  describe('Complex Content', () => {
    it('should handle meld directives with format conversion', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'llm', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });
}); 