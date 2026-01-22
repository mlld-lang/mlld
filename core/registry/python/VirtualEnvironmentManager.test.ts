import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VirtualEnvironmentManager } from './VirtualEnvironmentManager';

describe('VirtualEnvironmentManager', () => {
  let testDir: string;
  let manager: VirtualEnvironmentManager;

  beforeAll(async () => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-venv-test-'));
    manager = new VirtualEnvironmentManager(testDir);
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('isVenvActive', () => {
    it('should detect active venv from environment', async () => {
      const result = await manager.isVenvActive();
      // Result depends on whether tests are run in a venv
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getActivePath', () => {
    it('should return VIRTUAL_ENV if set', async () => {
      const result = await manager.getActivePath();
      if (process.env.VIRTUAL_ENV) {
        expect(result).toBe(process.env.VIRTUAL_ENV);
      } else {
        expect(result).toBeUndefined();
      }
    });
  });

  describe('venvExists', () => {
    it('should return false for non-existent venv', async () => {
      const result = await manager.venvExists(path.join(testDir, 'nonexistent'));
      expect(result).toBe(false);
    });
  });

  describe('getPythonPathForVenv', () => {
    it('should return correct path for Unix', () => {
      if (process.platform !== 'win32') {
        const pythonPath = manager.getPythonPathForVenv('/some/venv');
        expect(pythonPath).toBe('/some/venv/bin/python');
      }
    });

    it('should return correct path for Windows', () => {
      if (process.platform === 'win32') {
        const pythonPath = manager.getPythonPathForVenv('C:\\some\\venv');
        expect(pythonPath).toBe('C:\\some\\venv\\Scripts\\python.exe');
      }
    });
  });

  describe('getPythonConfig', () => {
    it('should return undefined when no config file exists', async () => {
      const config = await manager.getPythonConfig();
      expect(config).toBeUndefined();
    });

    it('should return python config when present', async () => {
      // Create mlld-config.json with python config
      const configPath = path.join(testDir, 'mlld-config.json');
      await fs.promises.writeFile(configPath, JSON.stringify({
        python: {
          venv: '.venv',
          manager: 'uv'
        }
      }));

      const config = await manager.getPythonConfig();
      expect(config).toEqual({
        venv: '.venv',
        manager: 'uv'
      });
    });
  });

  describe('createVenv', () => {
    it('should create a virtual environment', async () => {
      const venvPath = path.join(testDir, 'test-venv');

      // Skip if no Python available
      try {
        const context = await manager.createVenv(venvPath);

        expect(context.path).toBe(venvPath);
        expect(context.pythonPath).toContain('python');
        expect(context.pythonVersion).toMatch(/^\d+\.\d+/);
        expect(typeof context.sitePackagesPath).toBe('string');

        // Verify venv was actually created
        const exists = await manager.venvExists(venvPath);
        expect(exists).toBe(true);
      } catch (error) {
        // Skip test if Python not available
        if ((error as Error).message.includes('python')) {
          return;
        }
        throw error;
      }
    }, 30000); // Allow 30 seconds for venv creation

    it('should return existing venv context when not forcing', async () => {
      const venvPath = path.join(testDir, 'existing-venv');

      try {
        // Create venv first time
        const firstContext = await manager.createVenv(venvPath);

        // Create again without force - should return same context
        const secondContext = await manager.createVenv(venvPath, { force: false });

        expect(secondContext.path).toBe(firstContext.path);
      } catch (error) {
        if ((error as Error).message.includes('python')) {
          return;
        }
        throw error;
      }
    }, 30000);
  });

  describe('getPackageManager', () => {
    it('should return auto-detected manager when no config', async () => {
      const pm = await manager.getPackageManager();
      expect(pm.name === 'pip' || pm.name === 'uv').toBe(true);
    });

    it('should respect manager config', async () => {
      const configPath = path.join(testDir, 'mlld-config.json');
      await fs.promises.writeFile(configPath, JSON.stringify({
        python: {
          manager: 'pip'
        }
      }));

      const pm = await manager.getPackageManager();
      expect(pm.name).toBe('pip');
    });
  });
});
