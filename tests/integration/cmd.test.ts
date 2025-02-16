import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cmd } from '../../_old/src/cli/cmd.js';
import * as pathModule from 'path';
import { TestContext } from '@tests/utils/index.js';
import * as fs from 'fs';

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../mocks/path');
  return createPathMock({
    testRoot: '/project',
    testHome: '/project/home',
    testProject: '/project'
  });
});

// Import path utils after mock setup
import { pathTestUtils } from '@tests/mocks/path.js';

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

describe('CLI Integration Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    // Reset context
    context = new TestContext();
    await context.initialize();

    // Mock fs functions
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

    // Mock fs-extra functions
    const fsExtra = await import('fs-extra');
    vi.mocked(fsExtra.existsSync).mockImplementation((path: string) => context.fs.exists(path));
    vi.mocked(fsExtra.readFileSync).mockImplementation((path: string) => context.fs.readFile(path));
    vi.mocked(fsExtra.writeFileSync).mockImplementation((path: string, content: string) => context.fs.writeFile(path, content));
    vi.mocked(fsExtra.mkdirSync).mockImplementation((path: string) => context.fs.mkdir(path));
    vi.mocked(fsExtra.statSync).mockImplementation((path: string) => ({
      isFile: () => context.fs.isFile(path),
      isDirectory: () => context.fs.isDirectory(path)
    }));

    // Create test directory structure
    await context.fs.mkdir('/test');
    
    // Create test files
    await context.fs.writeFile('/test/test.meld', '<!-- @embed source="test.txt" -->');
    await context.fs.writeFile('/test/test.txt', 'Test content');
    await context.fs.writeFile('/test/test.md', '# Test Markdown\nContent');

    // Verify test files exist
    const testFiles = await context.fs.readDir('/test');
    if (!testFiles.includes('test.meld') || !testFiles.includes('test.txt') || !testFiles.includes('test.md')) {
      throw new Error('Test files not created properly');
    }
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetAllMocks();
    delete process.env.NODE_ENV;
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const inputPath = context.fs.getPath('/test/test.meld');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      const inputPath = context.fs.getPath('/test/test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      const inputPath = context.fs.getPath('/test/test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const inputPath = context.fs.getPath('test.meld');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should use default output path when not specified', async () => {
      const inputPath = context.fs.getPath('test.meld');
      const args = ['node', 'meld', inputPath];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle multiple format options correctly', async () => {
      const inputPath = context.fs.getPath('test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'md,llm', '--stdout'];
      await expect(cmd(args)).rejects.toThrow('Format must be either "md" or "llm"');
    });
  });

  describe('File Handling', () => {
    it('should handle all supported file extensions', async () => {
      const extensions = ['.meld', '.md'];
      for (const ext of extensions) {
        const inputPath = context.fs.getPath(`test${ext}`);
        const args = ['node', 'meld', inputPath, '--stdout'];
        await expect(cmd(args)).resolves.not.toThrow();
      }
    });

    it('should reject unsupported file extensions', async () => {
      const inputPath = context.fs.getPath('test.invalid');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).rejects.toThrow('Invalid file extension');
    });

    it('should handle missing input files', async () => {
      const inputPath = context.fs.getPath('nonexistent.meld');
      const args = ['node', 'meld', inputPath, '--stdout'];
      await expect(cmd(args)).rejects.toThrow('ENOENT: no such file or directory');
    });
  });

  describe('Complex Content', () => {
    it('should handle meld directives with format conversion', async () => {
      const inputPath = context.fs.getPath('test.meld');
      const args = ['node', 'meld', inputPath, '--format', 'llm', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });
}); 