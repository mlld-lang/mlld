import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { RunCommand } from './run';
import { MlldError } from '@core/errors/index';

// Mock modules
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('@interpreter/index');
vi.mock('@core/registry/LockFile', () => ({
  LockFile: vi.fn().mockImplementation(() => ({
    data: {}
  }))
}));
vi.mock('@core/utils/findProjectRoot', () => ({
  findProjectRoot: vi.fn().mockResolvedValue('/test/project')
}));
vi.mock('@services/fs/NodeFileSystem', () => ({
  NodeFileSystem: vi.fn().mockImplementation(() => ({}))
}));

describe('RunCommand', () => {
  let runCommand: RunCommand;
  const mockCwd = '/test/project';
  
  beforeEach(async () => {
    // Ensure findProjectRoot is mocked before creating RunCommand
    const { findProjectRoot } = await import('@core/utils/findProjectRoot');
    vi.mocked(findProjectRoot).mockResolvedValue('/test/project');
    
    runCommand = new RunCommand();
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('getScriptDirectory', () => {
    it('should return default directory when no lock file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      
      const dir = await (runCommand as any).getScriptDirectory();
      expect(dir).toBe('/test/project/llm/run');
    });
    
    it('should read script directory from lock file', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      
      // Mock the LockFile module
      const { LockFile } = await import('@core/registry/LockFile');
      vi.mocked(LockFile).mockImplementation(() => ({
        data: {
          config: {
            scriptDir: 'custom/scripts'
          }
        }
      } as any));
      
      // Ensure findProjectRoot is mocked for new instance
      const { findProjectRoot } = await import('@core/utils/findProjectRoot');
      vi.mocked(findProjectRoot).mockResolvedValue('/test/project');
      
      // Create a new instance to test
      const testCommand = new RunCommand();
      const dir = await (testCommand as any).getScriptDirectory();
      expect(dir).toBe('/test/project/custom/scripts');
    });
  });
  
  describe('listScripts', () => {
    it('should return empty array when directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      
      const scripts = await runCommand.listScripts();
      expect(scripts).toEqual([]);
    });
    
    it('should list .mld files without extension', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        'script1.mld',
        'script2.mld',
        'readme.txt',
        'data.json'
      ] as any);
      
      // Ensure findProjectRoot is mocked for new instance
      const { findProjectRoot } = await import('@core/utils/findProjectRoot');
      vi.mocked(findProjectRoot).mockResolvedValue('/test/project');
      
      // Create a new instance to avoid issues with mocked LockFile
      const testCommand = new RunCommand();
      const scripts = await testCommand.listScripts();
      expect(scripts).toEqual(['script1', 'script2']);
    });
  });
  
  describe('findScript', () => {
    it('should find script with .mld extension', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return path.toString().endsWith('test-script.mld');
      });
      
      const scriptPath = await runCommand.findScript('test-script');
      expect(scriptPath).toContain('test-script.mld');
    });
    
    it('should find script with exact name', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        return pathStr.endsWith('exact.mld') && pathStr.includes('llm/run');
      });
      
      const scriptPath = await runCommand.findScript('exact.mld');
      expect(scriptPath).toContain('exact.mld');
    });
    
    it('should return null when script not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      
      const scriptPath = await runCommand.findScript('nonexistent');
      expect(scriptPath).toBeNull();
    });
  });
  
  describe('run', () => {
    it('should throw error when script not found with no available scripts', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      
      await expect(runCommand.run('missing')).rejects.toThrow(MlldError);
      await expect(runCommand.run('missing')).rejects.toThrow(/No scripts found/);
    });
    
    it('should throw error with available scripts list', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        if (pathStr.includes('llm/run') && !pathStr.includes('missing')) return true;
        return false;
      });
      
      vi.mocked(fs.readdir).mockResolvedValue(['available1.mld', 'available2.mld'] as any);
      
      try {
        await runCommand.run('missing');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MlldError);
        expect(error.message).toMatch(/Available scripts:\n {2}available1\n {2}available2/);
      }
    });
    
    it('should successfully run a script', async () => {
      // Mock the interpret function before importing
      const { interpret } = await import('@interpreter/index');
      vi.mocked(interpret).mockResolvedValue('Script output');
      
      vi.mocked(existsSync).mockImplementation((p) => {
        return p.toString().endsWith('hello.mld');
      });
      
      vi.mocked(fs.readFile).mockResolvedValue('/show "Hello World"');
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Mock process.exit to prevent it from actually exiting
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit unexpectedly called with "${code}"`);
      });
      
      try {
        await runCommand.run('hello');
      } catch (error) {
        // Expected to throw due to process.exit mock
        if (!error.message.includes('process.exit unexpectedly called with "0"')) {
          throw error;
        }
      }
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Running'));
      expect(interpret).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Script output');
      expect(exitSpy).toHaveBeenCalledWith(0);
      
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});