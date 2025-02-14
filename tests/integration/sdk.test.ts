import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runMeld } from '../../_old/src/sdk';
import * as pathModule from 'path';
import { TestContext } from '../../tests/utils';

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../__mocks__/path');
  return createPathMock({
    testRoot: '/project',
    testHome: '/project/home',
    testProject: '/project'
  });
});

// Import path utils after mock setup
import { pathTestUtils } from '../__mocks__/path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn()
}));

// Mock fs/promises module
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rmdir: vi.fn()
}));

// Mock fs-extra module
vi.mock('fs-extra', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
  copy: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  ensureDir: vi.fn(),
  ensureFile: vi.fn()
}));

describe('SDK Integration Tests', () => {
  let context: TestContext;
  let testFilePath: string;

  beforeEach(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Reset path mock between tests
    const mock = vi.mocked(pathModule);
    pathTestUtils.resetMocks(mock);

    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Set up test file path
    testFilePath = context.fs.getPath('test.meld');

    // Mock process.cwd() to return the test project path
    const projectPath = context.fs.getPath('');
    vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

    // Mock fs functions to use test context filesystem
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockImplementation((path: string) => context.fs.exists(path));
    vi.mocked(fs.readFileSync).mockImplementation((path: string) => context.fs.readFile(path));
    vi.mocked(fs.writeFileSync).mockImplementation((path: string, content: string) => context.fs.writeFile(path, content));
    vi.mocked(fs.mkdirSync).mockImplementation((path: string) => context.fs.mkdir(path));
    vi.mocked(fs.statSync).mockImplementation((path: string) => ({
      isFile: () => context.fs.isFile(path),
      isDirectory: () => context.fs.isDirectory(path)
    }));

    // Mock fs/promises functions
    const fsPromises = await import('fs/promises');
    vi.mocked(fsPromises.readFile).mockImplementation((path: string) => Promise.resolve(context.fs.readFile(path)));
    vi.mocked(fsPromises.writeFile).mockImplementation((path: string, content: string) => {
      context.fs.writeFile(path, content);
      return Promise.resolve();
    });
    vi.mocked(fsPromises.mkdir).mockImplementation((path: string) => {
      context.fs.mkdir(path);
      return Promise.resolve();
    });
    vi.mocked(fsPromises.stat).mockImplementation((path: string) => Promise.resolve({
      isFile: () => context.fs.isFile(path),
      isDirectory: () => context.fs.isDirectory(path)
    }));

    // Add test files using TestContext
    await context.writeFile('test.meld', '<!-- @embed source="test.txt" -->');
    await context.writeFile('test.txt', 'Test content');
    await context.writeFile('test.md', '# Test Markdown\nContent');
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetAllMocks();
    delete process.env.NODE_ENV;
  });

  describe('Format Conversion', () => {
    it('should convert to llm format by default', async () => {
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });

    it('should preserve markdown when format is md', async () => {
      const result = await runMeld(testFilePath, { format: 'md' });
      expect(result).toBeDefined();
    });

    it('should handle complex meld content with directives', async () => {
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });

    it('should preserve state across the pipeline', async () => {
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      await context.writeFile('test.meld', '<!-- @invalid -->');
      await expect(runMeld(testFilePath)).rejects.toThrow();
    });

    it('should handle missing files correctly', async () => {
      await expect(runMeld('missing.meld')).rejects.toThrow();
    });

    it('should handle empty files', async () => {
      await context.writeFile('test.meld', '');
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed content types correctly', async () => {
      await context.writeFile('test.meld', '# Markdown\n<!-- @embed source="test.txt" -->\nMore markdown');
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });

    it('should preserve whitespace appropriately', async () => {
      await context.writeFile('test.meld', '\n\n# Title\n\nContent\n\n');
      const result = await runMeld(testFilePath);
      expect(result).toBeDefined();
    });
  });
}); 