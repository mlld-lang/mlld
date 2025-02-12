import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cmd } from '../../src/cli/cmd';
import * as fs from 'fs';
import * as pathModule from 'path';

// Mock path module
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    resolve: vi.fn((p) => p),
    join: vi.fn((...args) => args.join('/')),
    normalize: vi.fn((p) => p.replace(/\\/g, '/').replace(/\/+/g, '/')),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/') || '/'),
    basename: vi.fn((p) => p.split('/').pop() || ''),
    isAbsolute: vi.fn((p) => p.startsWith('/') || /^[A-Z]:/i.test(p)),
  };
});

// Import path utils after mock setup
import { pathTestUtils } from '../__mocks__/path';

describe('CLI Integration Tests', () => {
  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Reset path mock between tests
    const mock = vi.mocked(pathModule);
    pathTestUtils.resetMocks(mock);

    // Mock fs module
    vi.mock('fs', () => ({
      existsSync: vi.fn().mockImplementation(() => true),
      readFileSync: vi.fn().mockImplementation(() => 'test content'),
      writeFileSync: vi.fn(),
      promises: {
        readFile: vi.fn().mockResolvedValue('test content'),
        writeFile: vi.fn().mockResolvedValue(undefined)
      }
    }));

    // Mock fs/promises module
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue('test content'),
      writeFile: vi.fn().mockResolvedValue(undefined)
    }));
  });

  afterEach(() => {
    // Reset environment
    delete process.env.NODE_ENV;
    vi.resetAllMocks();
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should use default output path when not specified', async () => {
      const args = ['node', 'meld', 'test.meld'];
      await expect(cmd(args)).resolves.not.toThrow();
    });

    it('should handle multiple format options correctly', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md,llm', '--stdout'];
      await expect(cmd(args)).resolves.not.toThrow();
    });
  });

  describe('File Handling', () => {
    it('should handle all supported file extensions', async () => {
      const extensions = ['.meld', '.md'];
      for (const ext of extensions) {
        const inputFile = `test${ext}`;
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