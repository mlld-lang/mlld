import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { initCommand, createInitCommand } from './init';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}));

// Mock fs.existsSync
vi.mock('fs', () => ({
  existsSync: vi.fn()
}));

// Save original process.cwd
const originalCwd = process.cwd;

describe('initCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.cwd = vi.fn(() => '/test/project');
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  it('should create mlld-config.json with defaults', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await initCommand();

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/test/project/mlld-config.json',
      expect.stringContaining('"version": 1')
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/test/project/mlld-config.json',
      expect.stringContaining('"scriptDir": "llm/run"')
    );
  });

  it('should create mlld-lock.json if it does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await initCommand();

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/test/project/mlld-lock.json',
      expect.stringContaining('"version": 1')
    );
  });

  it('should create directories if they do not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await initCommand();

    expect(fs.mkdir).toHaveBeenCalledWith('/test/project/llm/run', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('/test/project/llm/modules', { recursive: true });
  });

  it('should not overwrite existing config without --force', async () => {
    // Config exists
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).includes('mlld-config.json');
    });

    const consoleSpy = vi.spyOn(console, 'log');

    await initCommand();

    // Should not write config
    expect(fs.writeFile).not.toHaveBeenCalledWith(
      '/test/project/mlld-config.json',
      expect.anything()
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  it('should overwrite existing config with --force', async () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).includes('mlld-config.json');
    });

    await initCommand({ force: true });

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/test/project/mlld-config.json',
      expect.stringContaining('"version": 1')
    );
  });

  it('should use custom script-dir when provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await initCommand({ scriptDir: 'scripts' });

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/test/project/mlld-config.json',
      expect.stringContaining('"scriptDir": "scripts"')
    );
    expect(fs.mkdir).toHaveBeenCalledWith('/test/project/scripts', { recursive: true });
  });

  it('should use custom local-path when provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await initCommand({ localPath: './modules' });

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/test/project/mlld-config.json',
      expect.stringContaining('"basePath": "./modules"')
    );
    expect(fs.mkdir).toHaveBeenCalledWith('/test/project/modules', { recursive: true });
  });
});

describe('createInitCommand', () => {
  it('should create a command object with correct name', () => {
    const command = createInitCommand();
    expect(command.name).toBe('init');
    expect(command.description).toBe('Initialize mlld project with defaults');
  });

  it('should show help when --help flag is provided', async () => {
    const command = createInitCommand();
    const consoleSpy = vi.spyOn(console, 'log');

    await command.execute([], { help: true });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('mlld init'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--force'));
  });
});
