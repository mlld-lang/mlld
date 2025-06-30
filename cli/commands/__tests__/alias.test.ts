import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AliasCommand } from '../alias';
import { existsSync } from 'fs';
import { LockFile } from '@core/registry/LockFile';

// Mock modules
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('os');
vi.mock('@core/registry/LockFile');

// TODO: Add test infrastructure for aliases - need to properly mock file system paths
// See: https://github.com/mlld-lang/mlld/issues/304
describe.skip('AliasCommand', () => {
  let command: AliasCommand;
  let mockConsoleLog: any;
  let mockConsoleError: any;

  beforeEach(() => {
    command = new AliasCommand();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock os.homedir
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    
    // Mock existsSync
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a local alias', async () => {
    const mockLockFile = {
      getResolverPrefixes: vi.fn().mockReturnValue([]),
      setResolverPrefixes: vi.fn().mockResolvedValue(undefined),
    };
    
    // Set up the mock implementation
    vi.mocked(LockFile).mockImplementation(() => mockLockFile as any);

    await command.createAlias({
      name: 'shared',
      path: '../shared-modules',
      global: false
    });

    expect(mockLockFile.setResolverPrefixes).toHaveBeenCalledWith([
      {
        prefix: '@shared/',
        resolver: 'LOCAL',
        config: {
          basePath: '../shared-modules'
        }
      }
    ]);

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✔ Created local path alias: @shared/'));
  });

  it('should create a global alias', async () => {
    const mockLockFile = {
      getResolverPrefixes: vi.fn().mockReturnValue([]),
      setResolverPrefixes: vi.fn().mockResolvedValue(undefined),
    };
    
    // Set up the mock implementation
    vi.mocked(LockFile).mockImplementation(() => mockLockFile as any);

    // Mock fs.mkdir
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);

    await command.createAlias({
      name: 'desktop',
      path: '~/Desktop',
      global: true
    });

    expect(mockLockFile.setResolverPrefixes).toHaveBeenCalledWith([
      {
        prefix: '@desktop/',
        resolver: 'LOCAL',
        config: {
          basePath: '/home/user/Desktop'
        }
      }
    ]);

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✔ Created global path alias: @desktop/'));
    expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith('/home/user/.config/mlld', { recursive: true });
  });

  it('should validate alias name format', async () => {
    await expect(command.createAlias({
      name: 'Invalid-Name',
      path: './path',
      global: false
    })).rejects.toThrow('Alias name must be lowercase alphanumeric with hyphens');
  });

  it('should require both name and path', async () => {
    await expect(command.createAlias({
      name: '',
      path: './path',
      global: false
    })).rejects.toThrow('Both --name and --path are required');

    await expect(command.createAlias({
      name: 'test',
      path: '',
      global: false
    })).rejects.toThrow('Both --name and --path are required');
  });

  it('should update existing alias', async () => {
    const existingRegistry = {
      prefix: '@shared/',
      resolver: 'LOCAL',
      type: 'input',
      priority: 20,
      config: {
        basePath: './old-path'
      }
    };

    const mockLockFile = {
      getResolverPrefixes: vi.fn().mockReturnValue([existingRegistry]),
      setResolverPrefixes: vi.fn().mockResolvedValue(undefined),
    };
    
    // Set up the mock implementation
    vi.mocked(LockFile).mockImplementation(() => mockLockFile as any);

    await command.createAlias({
      name: 'shared',
      path: './new-path',
      global: false
    });

    expect(mockLockFile.setResolverPrefixes).toHaveBeenCalledWith([
      {
        prefix: '@shared/',
        resolver: 'LOCAL',
        config: {
          basePath: 'new-path'
        }
      }
    ]);

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Updated existing path alias: @shared/'));
  });
});