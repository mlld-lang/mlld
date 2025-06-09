import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestSetup, TestEnvironment } from '../setup/vitest-security-setup';
import { MlldCommandExecutionError, MlldFileSystemError, MlldImportError } from '@core/errors';

describe('Environment Security Operations - Phase 2', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await TestSetup.createSecurityUnitTestEnv();
  });

  afterEach(async () => {
    await TestSetup.afterEach();
  });

  describe('executeCommand Security Integration', () => {
    it('should call SecurityManager.checkCommand before execution', async () => {
      // Mock a safe command
      env.mockCommandApproval('echo test', { 
        allowed: true, 
        requiresApproval: false,
        reason: 'Safe command'
      });

      await env.executeCommand('echo test');
      
      // Verify security was checked
      expect(env.wasCommandChecked('echo test')).toBe(true);
      
      const verification = await env.verifySecurityCalls();
      expect(verification.commandChecks).toHaveLength(1);
      expect(verification.commandChecks[0].command).toBe('echo test');
      expect(verification.commandChecks[0].result.allowed).toBe(true);
    });

    it('should block commands when SecurityManager denies access', async () => {
      // Mock a dangerous command
      env.mockCommandApproval('rm -rf /', { 
        allowed: false, 
        reason: 'Dangerous command blocked' 
      });

      await expect(env.executeCommand('rm -rf /')).rejects.toThrow(MlldCommandExecutionError);
      expect(env.wasCommandChecked('rm -rf /')).toBe(true);
    });

    it('should handle approval flow for commands requiring approval', async () => {
      // Mock a command that requires approval but is approved
      env.mockCommandApproval('npm install', { 
        allowed: true, 
        requiresApproval: true,
        reason: 'Command requires approval'
      });

      // This would normally prompt user, but in test environment it uses the mock
      await env.executeCommand('npm install');
      
      expect(env.wasCommandChecked('npm install')).toBe(true);
      const verification = await env.verifySecurityCalls();
      expect(verification.commandChecks[0].result.requiresApproval).toBe(true);
    });

    it('should track command output taint', async () => {
      env.mockCommandApproval('npm --version', { allowed: true });

      // Set test mode to use mocked command execution
      const originalTestMode = process.env.MLLD_TEST_MODE;
      process.env.MLLD_TEST_MODE = 'true';
      
      try {
        await env.executeCommand('npm --version'); // Use a command that has a mock implementation
        
        const verification = await env.verifySecurityCalls();
        expect(verification.taintOperations.length).toBeGreaterThan(0);
        
        const taintOp = verification.taintOperations[0];
        expect(taintOp.source).toBe('command_output');
      } finally {
        // Restore original test mode
        if (originalTestMode) {
          process.env.MLLD_TEST_MODE = originalTestMode;
        } else {
          delete process.env.MLLD_TEST_MODE;
        }
      }
    });
  });

  describe('readFile Security Integration', () => {
    it('should call SecurityManager.checkPath for file reads', async () => {
      // Set up a test file
      await env.writeFile('/test.txt', 'test content');
      
      // Mock path access approval
      env.mockPathAccess('/test.txt', 'read', true);

      await env.readFile('/test.txt');
      
      // Verify security was checked
      expect(env.wasPathChecked('/test.txt', 'read')).toBe(true);
    });

    it('should block file reads when SecurityManager denies access', async () => {
      // Set up a test file
      await env.writeFile('/sensitive.txt', 'sensitive content');
      
      // Mock path access denial
      env.mockPathAccess('/sensitive.txt', 'read', false);

      await expect(env.readFile('/sensitive.txt')).rejects.toThrow(MlldFileSystemError);
      expect(env.wasPathChecked('/sensitive.txt', 'read')).toBe(true);
    });

    it('should track file content taint', async () => {
      await env.writeFile('/test.txt', 'test content');
      env.mockPathAccess('/test.txt', 'read', true);

      await env.readFile('/test.txt');
      
      const verification = await env.verifySecurityCalls();
      expect(verification.taintOperations.length).toBeGreaterThan(0);
      
      const taintOp = verification.taintOperations.find(op => op.source === 'file_system');
      expect(taintOp).toBeDefined();
    });
  });

  describe('writeFile Security Integration', () => {
    it('should call SecurityManager.checkPath for file writes', async () => {
      env.mockPathAccess('/output.txt', 'write', true);

      await env.writeFile('/output.txt', 'test content');
      
      expect(env.wasPathChecked('/output.txt', 'write')).toBe(true);
    });

    it('should block file writes when SecurityManager denies access', async () => {
      env.mockPathAccess('/protected.txt', 'write', false);

      await expect(env.writeFile('/protected.txt', 'content')).rejects.toThrow(MlldFileSystemError);
      expect(env.wasPathChecked('/protected.txt', 'write')).toBe(true);
    });
  });

  describe('fetchURL Security Integration', () => {
    it('should call SecurityManager.approveImport for import URLs', async () => {
      const url = 'https://example.com/module.mld';
      
      // Mock fetch for URL
      global.fetch = async () => ({
        ok: true,
        text: async () => '@text greeting = "Hello from import"'
      } as any);
      
      // Mock import approval
      env.mockImportApproval(url, true);

      await env.fetchURL(url, true); // forImport = true
      
      expect(env.wasImportApproved(url)).toBe(true);
    });

    it('should block URL imports when SecurityManager denies approval', async () => {
      const url = 'https://malicious.com/bad.mld';
      
      // Mock fetch for URL
      global.fetch = async () => ({
        ok: true,
        text: async () => '@text malicious = "bad content"'
      } as any);
      
      // Mock import denial
      env.mockImportApproval(url, false);

      await expect(env.fetchURL(url, true)).rejects.toThrow(MlldImportError);
      expect(env.wasImportApproved(url)).toBe(true); // Approval was attempted
    });

    it('should track URL content taint', async () => {
      const url = 'https://example.com/module.mld';
      
      // Mock fetch for URL
      global.fetch = async () => ({
        ok: true,
        text: async () => '@text greeting = "Hello from import"'
      } as any);
      
      env.mockImportApproval(url, true);

      await env.fetchURL(url, true);
      
      const verification = await env.verifySecurityCalls();
      const taintOp = verification.taintOperations.find(op => op.source === 'network');
      expect(taintOp).toBeDefined();
    });

    it('should not call SecurityManager for non-import URLs', async () => {
      const url = 'https://example.com/data.json';

      // Mock fetch for URL
      global.fetch = async () => ({
        ok: true,
        text: async () => '{"data": "some json"}'
      } as any);

      // Regular URL fetch should not trigger import approval
      await env.fetchURL(url, false); // forImport = false
      
      expect(env.wasImportApproved(url)).toBe(false);
    });
  });

  describe('Security Context Building', () => {
    it('should build proper security context for operations', async () => {
      const command = 'echo test';
      env.mockCommandApproval(command, { allowed: true });

      // Mock file path and context
      env.setCurrentFile('/test.mld');

      await env.executeCommand(command);
      
      const verification = await env.verifySecurityCalls();
      const commandCheck = verification.commandChecks[0];
      
      expect(commandCheck.context?.file).toBe('/test.mld');
      // Additional context fields would be verified here
    });
  });
});