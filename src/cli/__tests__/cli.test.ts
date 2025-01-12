import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cli } from '../cli.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => path === 'test.meld'),
  promises: {
    readFile: vi.fn().mockResolvedValue('Mock content'),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('path', () => ({
  resolve: vi.fn((path: string) => path),
  extname: vi.fn((path: string) => '.meld')
}));

describe('cli', () => {
  beforeEach(() => {
    // Mock path module
    vi.mock('path', () => {
      const actual = {
        dirname: vi.fn().mockImplementation((p: string) => p.split('/').slice(0, -1).join('/')),
        basename: vi.fn().mockImplementation((p: string) => p.split('/').pop() || ''),
        extname: vi.fn().mockImplementation((p: string) => '.meld'),
        join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/'))
      };
      return {
        ...actual,
        default: actual
      };
    });

    // Mock fs module
    vi.mock('fs', () => ({
      existsSync: vi.fn().mockImplementation((path: string) => path === 'test.meld')
    }));

    // Mock fs/promises module
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockImplementation((path: string) => {
        if (path === 'test.meld') {
          return Promise.resolve('@text test = "value"');
        }
        throw new Error('File not found');
      }),
      writeFile: vi.fn().mockResolvedValue(undefined)
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should process input file with default options', async () => {
    const args = ['node', 'meld', 'test.meld'];
    await cli(args);
    expect(fs.writeFile).toHaveBeenCalledWith('test.llm', expect.any(String));
  });

  it('should respect custom output path', async () => {
    const args = ['node', 'meld', 'test.meld', '--output', 'custom.llm'];
    await cli(args);
    expect(fs.writeFile).toHaveBeenCalledWith('custom.llm', expect.any(String));
  });

  it('should handle different formats', async () => {
    const args = ['node', 'meld', 'test.meld', '--format', 'md'];
    await cli(args);
    expect(fs.writeFile).toHaveBeenCalledWith('test.md', expect.any(String));
  });

  it('should write to stdout when --stdout is used', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const args = ['node', 'meld', 'test.meld', '--stdout'];
    await cli(args);
    expect(consoleSpy).toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should validate file extensions', async () => {
    const args = ['node', 'meld', 'invalid.txt'];
    await expect(cli(args)).rejects.toThrow(/Invalid file extension/);
  });

  it('should handle parse errors', async () => {
    const mockInput = 'nonexistent.meld';
    const args = ['node', 'meld', mockInput];
    await expect(cli(args)).rejects.toThrow('File not found');
  });

  it('should normalize format aliases', async () => {
    const args = ['node', 'meld', 'test.meld', '--format', 'markdown'];
    await cli(args);
    expect(fs.writeFile).toHaveBeenCalledWith('test.md', expect.any(String));
  });
}); 