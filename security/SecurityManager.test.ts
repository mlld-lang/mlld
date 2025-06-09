import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecurityManager, TaintSource } from './SecurityManager';
import { TaintLevel } from './taint';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
vi.mock('fs');

describe('SecurityManager with PolicyManager', () => {
  let securityManager: SecurityManager;
  const projectPath = '/test/project';
  
  beforeEach(() => {
    // Reset singleton
    (SecurityManager as any).instance = undefined;
    
    // Setup default mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    
    securityManager = SecurityManager.getInstance(projectPath);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('command checking with policies', () => {
    it('should allow commands based on policy evaluation', async () => {
      const decision = await securityManager.checkCommand('echo "Hello"');
      
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(true); // Default is 'verify'
    });
    
    it('should block dangerous commands', async () => {
      const decision = await securityManager.checkCommand('rm -rf /');
      
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('immutable security pattern');
    });
    
    it('should apply taint-based restrictions', async () => {
      // First track some tainted data
      securityManager.trackTaint('untrusted-data', TaintSource.USER_INPUT);
      
      // Command using tainted data should require approval
      const decision = await securityManager.checkCommand('echo untrusted-data');
      
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(true);
    });
  });
  
  describe('path checking with policies', () => {
    it('should check path access with policy', async () => {
      const canRead = await securityManager.checkPath('/tmp/test.txt', 'read');
      expect(canRead).toBe(true); // Default medium trust allows read
      
      const canWrite = await securityManager.checkPath('/tmp/test.txt', 'write');
      expect(canWrite).toBe(false); // Default verify trust requires approval
    });
    
    it('should block protected paths', async () => {
      // The checkPath method throws an error for protected paths
      await expect(
        securityManager.checkPath('~/.ssh/id_rsa', 'read')
      ).rejects.toThrow();
      
      await expect(
        securityManager.checkPath('/etc/passwd', 'write')
      ).rejects.toThrow();
    });
  });
  
  describe('import approval with policies', () => {
    it('should evaluate imports against policy', async () => {
      // Mock the import approval prompt to auto-approve
      const importApproval = (securityManager as any).importApproval;
      vi.spyOn(importApproval, 'checkApproval').mockResolvedValue(true);
      
      const approved = await securityManager.approveImport(
        'https://example.com/script.js',
        'console.log("test");',
        []
      );
      
      expect(approved).toBe(true);
      expect(importApproval.checkApproval).toHaveBeenCalled();
    });
    
    it('should block imports from blocked domains', async () => {
      // Create a mock lock file with blocked domain
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        return path.includes('mlld.lock.json');
      });
      
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        return JSON.stringify({
          version: '1.0.0',
          imports: {},
          security: {
            policies: {
              imports: {
                blockedDomains: ['evil.com'],
                default: 'verify'
              }
            }
          }
        });
      });
      
      // Re-create security manager to load the policy
      (SecurityManager as any).instance = undefined;
      securityManager = SecurityManager.getInstance(projectPath);
      
      const approved = await securityManager.approveImport(
        'https://evil.com/malware.js',
        'malicious code',
        []
      );
      
      expect(approved).toBe(false);
    });
  });
  
  describe('resolver checking', () => {
    it('should check resolver access', async () => {
      const allowed = await securityManager.checkResolver('local');
      expect(allowed).toBe(true); // Built-in resolver
      
      const customAllowed = await securityManager.checkResolver('my-custom-resolver');
      expect(customAllowed).toBe(false); // Custom resolvers not allowed by default
    });
  });
});