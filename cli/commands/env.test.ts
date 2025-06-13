import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { envCommand } from './env';
import { LockFile } from '@core/registry/LockFile';

describe('env command', () => {
  let tempDir: string;
  let lockFilePath: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-env-test-'));
    lockFilePath = path.join(tempDir, 'mlld.lock.json');
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('env list', () => {
    it('should show message when no variables are allowed', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['list'], cwd: tempDir });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No environment variables are allowed'));
      consoleLogSpy.mockRestore();
    });

    it('should list allowed variables', async () => {
      // Create lock file with allowed vars
      const lockFile = new LockFile(lockFilePath);
      await lockFile.addAllowedEnvVar('API_KEY');
      await lockFile.addAllowedEnvVar('DATABASE_URL');
      
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['list'], cwd: tempDir });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Allowed environment variables'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('API_KEY'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL'));
      consoleLogSpy.mockRestore();
    });
  });

  describe('env allow', () => {
    it('should add single environment variable', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['allow', 'API_KEY'], cwd: tempDir });
      
      // Verify lock file was created and contains the variable
      const lockFile = new LockFile(lockFilePath);
      const allowedVars = lockFile.getAllowedEnvVars();
      expect(allowedVars).toContain('API_KEY');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added 1 environment variable'));
      consoleLogSpy.mockRestore();
    });

    it('should add multiple environment variables', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['allow', 'API_KEY', 'DATABASE_URL', 'SECRET_KEY'], cwd: tempDir });
      
      const lockFile = new LockFile(lockFilePath);
      const allowedVars = lockFile.getAllowedEnvVars();
      expect(allowedVars).toContain('API_KEY');
      expect(allowedVars).toContain('DATABASE_URL');
      expect(allowedVars).toContain('SECRET_KEY');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added 3 environment variables'));
      consoleLogSpy.mockRestore();
    });

    it('should handle already allowed variables', async () => {
      // Pre-add a variable
      const lockFile = new LockFile(lockFilePath);
      await lockFile.addAllowedEnvVar('API_KEY');
      
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['allow', 'API_KEY', 'NEW_VAR'], cwd: tempDir });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added 1 environment variable'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Already allowed'));
      consoleLogSpy.mockRestore();
    });
  });

  describe('env remove', () => {
    it('should remove environment variable', async () => {
      // Pre-add variables
      const lockFile = new LockFile(lockFilePath);
      await lockFile.addAllowedEnvVar('API_KEY');
      await lockFile.addAllowedEnvVar('DATABASE_URL');
      
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['remove', 'API_KEY'], cwd: tempDir });
      
      // Reload lock file to get updated values
      const updatedLockFile = new LockFile(lockFilePath);
      const updatedVars = updatedLockFile.getAllowedEnvVars();
      expect(updatedVars).not.toContain('API_KEY');
      expect(updatedVars).toContain('DATABASE_URL');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Removed 1 environment variable'));
      consoleLogSpy.mockRestore();
    });

    it('should handle non-existent variables', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['remove', 'NON_EXISTENT'], cwd: tempDir });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Not in allowed list'));
      consoleLogSpy.mockRestore();
    });
  });

  describe('env clear', () => {
    it('should clear all allowed variables', async () => {
      // Pre-add variables
      const lockFile = new LockFile(lockFilePath);
      await lockFile.addAllowedEnvVar('API_KEY');
      await lockFile.addAllowedEnvVar('DATABASE_URL');
      await lockFile.addAllowedEnvVar('SECRET_KEY');
      
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['clear'], cwd: tempDir });
      
      // Reload lock file to get updated values
      const updatedLockFile = new LockFile(lockFilePath);
      const updatedVars = updatedLockFile.getAllowedEnvVars();
      expect(updatedVars).toHaveLength(0);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cleared all 3 allowed environment variables'));
      consoleLogSpy.mockRestore();
    });

    it('should handle empty list', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await envCommand({ _: ['clear'], cwd: tempDir });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No environment variables to clear'));
      consoleLogSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should error on missing variable name for allow', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });
      
      await expect(envCommand({ _: ['allow'], cwd: tempDir })).rejects.toThrow('Process exit');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Variable name required'));
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should error on unknown subcommand', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });
      
      await expect(envCommand({ _: ['unknown'], cwd: tempDir })).rejects.toThrow('Process exit');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });
  });
});