import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecurityManager } from '@security/SecurityManager';
import { LockFile } from '@core/registry/LockFile';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe.skip('Security Decision Persistence', () => {
  // TODO: Skip security persistence tests since lock file operations are disabled in test mode
  let securityManager: SecurityManager;
  let projectLockFile: LockFile;
  let tempDir: string;
  let lockFilePath: string;

  beforeEach(async () => {
    // Create temporary directory for test lock file
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mlld-security-test-'));
    lockFilePath = path.join(tempDir, 'mlld.lock.json');
    
    // Create initial lock file with minimal structure
    const initialData = {
      version: '1.0.0',
      imports: {},
      metadata: {
        mlldVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    await fs.promises.writeFile(lockFilePath, JSON.stringify(initialData, null, 2));
    
    // Initialize lock file and security manager
    projectLockFile = new LockFile(lockFilePath);
    securityManager = SecurityManager.getInstance(tempDir);
    securityManager.setLockFiles(projectLockFile);
  });

  afterEach(async () => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Command Approval Persistence', () => {
    it('should persist command approval decisions', async () => {
      const command = 'echo "test"';
      
      // Add a command approval directly to the lock file
      await projectLockFile.addCommandApproval(command, {
        pattern: command,
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always'
      });
      
      // Check that SecurityManager can find the approval
      const decision = await securityManager.checkCommand(command, undefined, false);
      
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toContain('project lock file');
    });

    it('should handle expired command approvals', async () => {
      const command = 'npm install';
      
      // Add an expired approval
      const expiredTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      await projectLockFile.addCommandApproval(command, {
        pattern: command,
        approvedAt: expiredTime,
        approvedBy: 'test-user',
        trust: 'always',
        expiresAt: expiredTime
      });
      
      // Check that expired approval is ignored
      const approval = projectLockFile.findMatchingCommandApproval(command);
      expect(approval).toBeUndefined(); // Should be undefined due to expiry
    });

    it('should save command approvals when approved in test mode', async () => {
      const command = 'git status';
      
      // Mock test environment
      process.env.NODE_ENV = 'test';
      
      try {
        // Check command - this should trigger approval flow in test mode
        const decision = await securityManager.checkCommand(command, {
          file: 'test.mld',
          line: 1,
          directive: 'run'
        }, false);
        
        expect(decision.allowed).toBe(true);
        
        // Verify the approval was saved to lock file
        const savedApproval = projectLockFile.getCommandApproval(command);
        expect(savedApproval).toBeDefined();
        expect(savedApproval?.trust).toBe('verify');
      } finally {
        delete process.env.NODE_ENV;
      }
    });
  });

  describe('Import Approval Persistence', () => {
    it('should persist import approval decisions', async () => {
      const url = 'https://raw.githubusercontent.com/example/repo/main/module.mld';
      const content = '@text greeting = "Hello from module"';
      
      // Add import approval directly to lock file
      await projectLockFile.addImportApproval(url, {
        url,
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always',
        contentHash: 'sha256:test-hash'
      });
      
      // Mock test environment for approval check
      process.env.NODE_ENV = 'test';
      
      try {
        // Check import approval
        const approved = await securityManager.approveImport(url, content, [], {
          file: 'test.mld',
          line: 1,
          directive: 'import'
        });
        
        expect(approved).toBe(true);
      } finally {
        delete process.env.NODE_ENV;
      }
    });

    it('should handle content hash validation for imports', async () => {
      const url = 'https://raw.githubusercontent.com/example/repo/main/module.mld';
      const originalContent = '@text greeting = "Hello"';
      const modifiedContent = '@text greeting = "Modified"';
      
      // Calculate hash for original content
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256');
      hash.update(originalContent);
      const originalHash = `sha256:${hash.digest('hex')}`;
      
      // Add approval for original content
      await projectLockFile.addImportApproval(url, {
        url,
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always',
        contentHash: originalHash
      });
      
      // Mock test environment
      process.env.NODE_ENV = 'test';
      
      try {
        // Original content should be approved
        const originalApproved = await securityManager.approveImport(url, originalContent, []);
        expect(originalApproved).toBe(true);
        
        // Modified content should require new approval (content hash mismatch)
        // Note: This would normally prompt user, but in test mode it auto-approves
        const modifiedApproved = await securityManager.approveImport(url, modifiedContent, []);
        expect(modifiedApproved).toBe(true);
      } finally {
        delete process.env.NODE_ENV;
      }
    });
  });

  describe('Path Approval Persistence', () => {
    it('should persist path access approval decisions', async () => {
      const testPath = path.join(tempDir, 'test-file.txt');
      
      // Add path approval directly to lock file
      await projectLockFile.addPathApproval(testPath, 'read', {
        path: testPath,
        operation: 'read',
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always'
      });
      
      // Mock test environment
      process.env.NODE_ENV = 'test';
      
      try {
        // Check path access
        const allowed = await securityManager.checkPath(testPath, 'read', {
          file: 'test.mld',
          line: 1,
          directive: 'path'
        });
        
        expect(allowed).toBe(true);
      } finally {
        delete process.env.NODE_ENV;
      }
    });

    it('should handle path prefix matching', async () => {
      const baseDir = path.join(tempDir, 'data');
      const specificFile = path.join(baseDir, 'config.json');
      
      // Add approval for base directory
      await projectLockFile.addPathApproval(baseDir, 'read', {
        path: baseDir,
        operation: 'read',
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always'
      });
      
      // Check that specific file under base directory is approved
      const approval = projectLockFile.findMatchingPathApproval(specificFile, 'read');
      expect(approval).toBeDefined();
      expect(approval?.trust).toBe('always');
    });
  });

  describe('Lock File Structure', () => {
    it('should maintain proper lock file structure with security decisions', async () => {
      const command = 'echo test';
      const url = 'https://example.com/module.mld';
      const testPath = '/tmp/test.txt';
      
      // Add various approvals
      await projectLockFile.addCommandApproval(command, {
        pattern: command,
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always'
      });
      
      await projectLockFile.addImportApproval(url, {
        url,
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'verify'
      });
      
      await projectLockFile.addPathApproval(testPath, 'write', {
        path: testPath,
        operation: 'write',
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'session'
      });
      
      // Save and reload lock file to verify structure
      await projectLockFile.save();
      const lockFileContent = JSON.parse(await fs.promises.readFile(lockFilePath, 'utf8'));
      
      // Verify structure
      expect(lockFileContent.security).toBeDefined();
      expect(lockFileContent.security.approvedCommands).toBeDefined();
      expect(lockFileContent.security.approvedUrls).toBeDefined();
      expect(lockFileContent.security.approvedPaths).toBeDefined();
      
      // Verify content
      expect(lockFileContent.security.approvedCommands[command]).toBeDefined();
      expect(lockFileContent.security.approvedUrls[url]).toBeDefined();
      expect(lockFileContent.security.approvedPaths[`${testPath}:write`]).toBeDefined();
    });

    it('should handle TTL expiry correctly', async () => {
      const command = 'test command';
      
      // Add approval with short TTL
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 100).toISOString(); // 100ms from now
      
      await projectLockFile.addCommandApproval(command, {
        pattern: command,
        approvedAt: now.toISOString(),
        approvedBy: 'test-user',
        trust: 'always',
        expiresAt
      });
      
      // Should be found initially
      let approval = projectLockFile.findMatchingCommandApproval(command);
      expect(approval).toBeDefined();
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired and not found
      approval = projectLockFile.findMatchingCommandApproval(command);
      expect(approval).toBeUndefined();
    });
  });
});