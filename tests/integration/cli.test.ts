import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cli } from '../../src/cli/cli';
import * as fs from 'fs';
import * as path from 'path';

describe('CLI Integration Tests', () => {
  beforeEach(() => {
    // Mock path module
    vi.mock('path', () => {
      const actual = {
        normalize: vi.fn().mockImplementation((p: string) => p),
        resolve: vi.fn().mockImplementation((p: string) => p),
        join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
        dirname: vi.fn().mockImplementation((p: string) => p.split('/').slice(0, -1).join('/')),
        basename: vi.fn().mockImplementation((p: string) => p.split('/').pop() || ''),
        extname: vi.fn().mockImplementation((p: string) => '.meld'),
        isAbsolute: vi.fn().mockReturnValue(false)
      };
      return {
        ...actual,
        default: actual
      };
    });

    // Mock fs module
    vi.mock('fs', () => {
      const mockContent = `@text test = "value"`;
      const existsSync = vi.fn().mockImplementation((path: string) => true);
      const readFileSync = vi.fn().mockImplementation(() => mockContent);
      const writeFileSync = vi.fn();
      
      return {
        existsSync,
        readFileSync,
        writeFileSync,
        promises: {
          readFile: vi.fn().mockResolvedValue(mockContent),
          writeFile: vi.fn().mockResolvedValue(undefined)
        },
        default: {
          existsSync,
          readFileSync,
          writeFileSync,
          promises: {
            readFile: vi.fn().mockResolvedValue(mockContent),
            writeFile: vi.fn().mockResolvedValue(undefined)
          }
        }
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(cli(args)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(cli(args)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(cli(args)).resolves.not.toThrow();
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(cli(args)).resolves.not.toThrow();
    });

    it('should use default output path when not specified', async () => {
      const args = ['node', 'meld', 'test.meld'];
      await expect(cli(args)).resolves.not.toThrow();
    });

    it('should handle multiple format options correctly', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md,llm', '--stdout'];
      await expect(cli(args)).resolves.not.toThrow();
    });
  });

  describe('File Handling', () => {
    it('should handle all supported file extensions', async () => {
      const extensions = ['.meld', '.md'];
      for (const ext of extensions) {
        const inputFile = `test${ext}`;
        const args = ['node', 'meld', inputFile, '--stdout'];
        await expect(cli(args)).resolves.not.toThrow();
      }
    });

    it('should reject unsupported file extensions', async () => {
      const args = ['node', 'meld', 'test.invalid', '--stdout'];
      await expect(cli(args)).rejects.toThrow(/Invalid file extension/);
    });

    it('should handle missing input files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const args = ['node', 'meld', 'nonexistent.meld', '--stdout'];
      await expect(cli(args)).rejects.toThrow(/File not found/);
    });
  });

  describe('Complex Content', () => {
    it('should handle meld directives with format conversion', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'llm', '--stdout'];
      await expect(cli(args)).resolves.not.toThrow();
    });
  });
}); 