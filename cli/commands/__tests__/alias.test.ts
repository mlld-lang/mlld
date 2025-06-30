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

describe('AliasCommand', () => {
  let command: AliasCommand;
  let mockConsoleLog: any;
  let mockConsoleError: any;
  let validPaths: Set<string>;

  beforeEach(() => {
    command = new AliasCommand();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Define valid paths that should exist in our mock filesystem
    validPaths = new Set([
      '/home/user/Desktop',
      '/project/shared-modules', 
      '/project/new-path',
      '/project/path',
      '/home/user/.config/mlld'
    ]);
    
    // Mock os.homedir
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    
    // Mock process.cwd
    const originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue('/project');
    
    // Mock existsSync with intelligent path resolution
    vi.mocked(existsSync).mockImplementation((filePath: string) => {
      const pathStr = filePath.toString();
      
      // Handle relative paths by resolving them
      let resolvedPath = pathStr;
      if (!path.isAbsolute(pathStr)) {
        resolvedPath = path.resolve('/project', pathStr);
      }
      
      // Check if this resolved path exists in our mock filesystem
      return validPaths.has(resolvedPath) || pathStr.includes('.config/mlld');
    });
    
    // Mock fs.stat to return directory stats for existing paths
    vi.mocked(fs.stat).mockImplementation(async (filePath: string) => {
      const pathStr = filePath.toString();
      
      // Resolve relative paths
      let resolvedPath = pathStr;
      if (!path.isAbsolute(pathStr)) {
        resolvedPath = path.resolve('/project', pathStr);
      }
      
      // For files that should be files, not directories
      if (pathStr.includes('some-file.txt')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          size: 100,
          mtime: new Date(),
          ctime: new Date(),
          atime: new Date()
        } as any;
      }
      
      // Default to directory for existing paths
      if (validPaths.has(resolvedPath) || pathStr.includes('.config')) {
        return {
          isDirectory: () => true,
          isFile: () => false,
          size: 0,
          mtime: new Date(),
          ctime: new Date(),
          atime: new Date()
        } as any;
      }
      
      throw new Error(`ENOENT: no such file or directory, stat '${pathStr}'`);
    });

    // Mock fs.mkdir
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
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
      path: './shared-modules',
      global: false
    });

    expect(mockLockFile.setResolverPrefixes).toHaveBeenCalledWith([
      {
        prefix: '@shared/',
        resolver: 'LOCAL',
        config: {
          basePath: 'shared-modules'
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
  });

  it('should validate alias name format', async () => {
    // Mock LockFile for this test
    const mockLockFile = {
      getResolverPrefixes: vi.fn().mockReturnValue([]),
      setResolverPrefixes: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(LockFile).mockImplementation(() => mockLockFile as any);

    await expect(command.createAlias({
      name: 'invalid_name',  // Underscore is not allowed
      path: './shared-modules',
      global: false
    })).rejects.toThrow('Alias name must be lowercase alphanumeric with hyphens');
  });

  it('should require both name and path', async () => {
    await expect(command.createAlias({
      name: '',
      path: './shared-modules',
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

  it('should throw error when path does not exist', async () => {
    await expect(command.createAlias({
      name: 'missing',
      path: './nonexistent',
      global: false
    })).rejects.toThrow('Path does not exist');
  });

  it('should throw error when path is not a directory', async () => {
    // Add the file to valid paths so existsSync returns true
    validPaths.add('/project/some-file.txt');

    await expect(command.createAlias({
      name: 'file',
      path: './some-file.txt',
      global: false
    })).rejects.toThrow('Path must be a directory');
  });
});