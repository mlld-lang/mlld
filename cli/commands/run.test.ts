import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { RunCommand } from './run';
import { MlldError } from '@core/errors/index';

// Mock modules
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('@sdk/execute');

// Create a shared mock function that can be controlled in tests
const mockGetScriptDir = vi.fn().mockReturnValue(undefined);

vi.mock('@core/registry/ProjectConfig', () => ({
  ProjectConfig: vi.fn(() => ({
    getScriptDir: mockGetScriptDir
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
    // Reset the mock before each test
    mockGetScriptDir.mockReturnValue(undefined);

    // Ensure findProjectRoot is mocked before creating RunCommand
    const { findProjectRoot } = await import('@core/utils/findProjectRoot');
    vi.mocked(findProjectRoot).mockResolvedValue('/test/project');

    // Default fs.stat mock - returns non-directory (overridden in specific tests)
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false } as any);

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
    
    it('should read script directory from config file', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      // Mock getScriptDir to return custom directory
      mockGetScriptDir.mockReturnValue('custom/scripts');

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
      // Return Dirent-like objects since readdir is called with withFileTypes: true
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'script1.mld', isFile: () => true, isDirectory: () => false },
        { name: 'script2.mld', isFile: () => true, isDirectory: () => false },
        { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        { name: 'data.json', isFile: () => true, isDirectory: () => false }
      ] as any);

      const scripts = await runCommand.listScripts();
      expect(scripts).toContain('script1');
      expect(scripts).toContain('script2');
    });

    it('should list directory scripts with index.mld', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        if (pathStr.includes('llm/run') && !pathStr.includes('.mlld')) return true;
        if (pathStr.endsWith('myapp/index.mld')) return true;
        return false;
      });

      // Return Dirent-like objects
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'script1.mld', isFile: () => true, isDirectory: () => false },
        { name: 'myapp', isFile: () => false, isDirectory: () => true }
      ] as any);

      const scripts = await runCommand.listScripts();
      expect(scripts).toContain('script1');
      expect(scripts).toContain('myapp');
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

    it('should find directory script with index.mld entry point', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        // Flat file doesn't exist, but directory does and has index.mld
        if (pathStr.endsWith('myapp.mld')) return false;
        if (pathStr.endsWith('myapp') && !pathStr.includes('.')) return true; // Directory exists
        if (pathStr.endsWith('myapp/index.mld')) return true;
        return false;
      });

      // Mock fs.stat to return directory for myapp
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = p.toString();
        return {
          isDirectory: () => pathStr.endsWith('myapp')
        } as any;
      });

      const scriptPath = await runCommand.findScript('myapp');
      expect(scriptPath).not.toBeNull();
      expect(scriptPath).toContain('myapp');
      expect(scriptPath).toContain('index.mld');
    });

    it('should prefer flat file over directory script', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        // Flat file exists
        if (pathStr.endsWith('myapp.mld')) return true;
        return false;
      });

      const scriptPath = await runCommand.findScript('myapp');
      // Should find the flat file first
      expect(scriptPath).not.toBeNull();
      expect(scriptPath).toContain('myapp.mld');
    });

    it('should find directory script with main.mld entry point', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('myapp.mld')) return false;
        if (pathStr.endsWith('myapp') && !pathStr.includes('.')) return true; // Directory exists
        if (pathStr.endsWith('myapp/index.mld')) return false;
        if (pathStr.endsWith('myapp/main.mld')) return true;
        return false;
      });

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = p.toString();
        return {
          isDirectory: () => pathStr.endsWith('myapp')
        } as any;
      });

      const scriptPath = await runCommand.findScript('myapp');
      expect(scriptPath).not.toBeNull();
      expect(scriptPath).toContain('myapp');
      expect(scriptPath).toContain('main.mld');
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
        // Script directory exists but missing.mld doesn't
        if (pathStr.includes('llm/run') && !pathStr.includes('missing')) return true;
        return false;
      });

      // Use Dirent-like objects
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'available1.mld', isFile: () => true, isDirectory: () => false },
        { name: 'available2.mld', isFile: () => true, isDirectory: () => false }
      ] as any);

      try {
        await runCommand.run('missing');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MlldError);
        expect(error.message).toMatch(/Available scripts:\n {2}available1\n {2}available2/);
      }
    });
    
    it('should successfully run a script', async () => {
      // Mock execute from the SDK
      const { execute } = await import('@sdk/execute');
      vi.mocked(execute).mockResolvedValue({
        output: 'Script output',
        effects: [],
        exports: {},
        stateWrites: [],
        metrics: {
          totalMs: 10,
          parseMs: 2,
          evaluateMs: 8,
          cacheHit: false,
          effectCount: 0,
          stateWriteCount: 0
        }
      } as any);

      vi.mocked(existsSync).mockImplementation((p) => {
        return p.toString().endsWith('hello.mld');
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock process.exit to prevent it from actually exiting
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit unexpectedly called with "${code}"`);
      });

      try {
        await runCommand.run('hello');
      } catch (error: any) {
        // Expected to throw due to process.exit mock
        if (!error.message.includes('process.exit unexpectedly called with "0"')) {
          throw error;
        }
      }

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Running'));
      expect(execute).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Script output');
      expect(exitSpy).toHaveBeenCalledWith(0);

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('should pass timeout option to execute', async () => {
      const { execute } = await import('@sdk/execute');
      vi.mocked(execute).mockResolvedValue({
        output: 'Done',
        effects: [],
        exports: {},
        stateWrites: [],
        metrics: { totalMs: 5, parseMs: 1, evaluateMs: 4, cacheHit: false, effectCount: 0, stateWriteCount: 0 }
      } as any);

      vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith('script.mld'));

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      try {
        await runCommand.run('script', { timeoutMs: 5000 });
      } catch (error: any) {
        if (!error.message.includes('exit:0')) throw error;
      }

      expect(execute).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        expect.objectContaining({ timeoutMs: 5000 })
      );

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('should show metrics in debug mode', async () => {
      const { execute } = await import('@sdk/execute');
      vi.mocked(execute).mockResolvedValue({
        output: 'Output',
        effects: [],
        exports: {},
        stateWrites: [],
        metrics: {
          totalMs: 100.5,
          parseMs: 10.2,
          evaluateMs: 90.3,
          cacheHit: true,
          effectCount: 5,
          stateWriteCount: 2
        }
      } as any);

      vi.mocked(existsSync).mockImplementation((p) => p.toString().endsWith('script.mld'));

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      try {
        await runCommand.run('script', { debug: true });
      } catch (error: any) {
        if (!error.message.includes('exit:0')) throw error;
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Metrics:'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 100.5ms'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('cached'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Effects: 5'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('State writes: 2'));

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});