import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cli } from '../cli';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Consolidated mock setup
vi.mock('path', () => ({
  resolve: vi.fn((p: string) => p),
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  basename: vi.fn((p: string) => p.split('/').pop() || ''),
  extname: vi.fn((p: string) => '.meld'),
  join: vi.fn((...parts: string[]) => parts.join('/'))
}));

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => path === 'test.meld'),
  promises: {
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path === 'test.meld') {
        return Promise.resolve('@text test = "value"');
      }
      throw new Error('File not found');
    }),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('cli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
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