import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyManagerImpl } from './PolicyManagerImpl';
import type { SecurityPolicy, CommandAnalysis } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PolicyManager', () => {
  let policyManager: PolicyManagerImpl;
  
  beforeEach(() => {
    policyManager = new PolicyManagerImpl();
  });
  
  describe('trust level hierarchy', () => {
    it('should correctly determine more restrictive trust levels', () => {
      expect(policyManager.isMoreRestrictive('block', 'verify')).toBe(true);
      expect(policyManager.isMoreRestrictive('verify', 'low')).toBe(true);
      expect(policyManager.isMoreRestrictive('low', 'medium')).toBe(true);
      expect(policyManager.isMoreRestrictive('medium', 'high')).toBe(true);
      
      expect(policyManager.isMoreRestrictive('high', 'medium')).toBe(false);
      expect(policyManager.isMoreRestrictive('verify', 'block')).toBe(false);
    });
  });
  
  describe('command evaluation', () => {
    it('should block commands matching immutable patterns', () => {
      const policy: SecurityPolicy = {
        commands: { default: 'high' }
      };
      
      const analysis: CommandAnalysis = {
        command: 'rm -rf /',
        risks: [],
        isDangerous: true,
        matchedPatterns: []
      };
      
      const decision = policyManager.evaluateCommand('rm -rf /', analysis, policy);
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('IMMUTABLE_BLOCKED_COMMAND');
    });
    
    it('should block explicitly blocked commands', () => {
      const policy: SecurityPolicy = {
        commands: {
          blocked: ['curl', 'wget'],
          default: 'high'
        }
      };
      
      const analysis: CommandAnalysis = {
        command: 'curl http://example.com',
        risks: [],
        isDangerous: false,
        matchedPatterns: []
      };
      
      const decision = policyManager.evaluateCommand('curl http://example.com', analysis, policy);
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('BLOCKED_COMMAND');
    });
    
    it('should allow explicitly allowed commands', () => {
      const policy: SecurityPolicy = {
        commands: {
          blocked: ['curl'],
          allowed: ['npm run *'],
          default: 'verify'
        }
      };
      
      const analysis: CommandAnalysis = {
        command: 'npm run test',
        risks: [],
        isDangerous: false,
        matchedPatterns: []
      };
      
      const decision = policyManager.evaluateCommand('npm run test', analysis, policy);
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(false);
      expect(decision.matchedRule).toBe('ALLOWED_COMMAND');
    });
    
    it('should apply trust level from trusted patterns', () => {
      const policy: SecurityPolicy = {
        commands: {
          trustedPatterns: [
            { pattern: 'git *', trust: 'high' },
            { pattern: 'docker *', trust: 'verify' }
          ],
          default: 'low'
        }
      };
      
      const analysis: CommandAnalysis = {
        command: 'docker run ubuntu',
        risks: [],
        isDangerous: false,
        matchedPatterns: []
      };
      
      const decision = policyManager.evaluateCommand('docker run ubuntu', analysis, policy);
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(true);
      expect(decision.trustLevel).toBe('verify');
    });
  });
  
  describe('path evaluation', () => {
    it('should block paths matching immutable patterns', () => {
      const policy: SecurityPolicy = {
        paths: { defaultRead: 'high' }
      };
      
      const decision = policyManager.evaluatePath('~/.ssh/id_rsa', 'read', policy);
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('IMMUTABLE_READ_PROTECTION');
    });
    
    it('should respect path-specific policies', () => {
      const policy: SecurityPolicy = {
        paths: {
          readBlocked: ['/etc/passwd'],
          readAllowed: ['/tmp/*'],
          defaultRead: 'verify'
        }
      };
      
      const blockedDecision = policyManager.evaluatePath('/etc/passwd', 'read', policy);
      expect(blockedDecision.allowed).toBe(false);
      
      const allowedDecision = policyManager.evaluatePath('/tmp/test.txt', 'read', policy);
      expect(allowedDecision.allowed).toBe(true);
      expect(allowedDecision.requiresApproval).toBe(false);
    });
  });
  
  describe('import evaluation', () => {
    it('should block domains on blocklist', () => {
      const policy: SecurityPolicy = {
        imports: {
          blockedDomains: ['evil.com', '*.sketchy.net'],
          default: 'high'
        }
      };
      
      const decision1 = policyManager.evaluateImport('https://evil.com/script.js', policy);
      expect(decision1.allowed).toBe(false);
      expect(decision1.matchedRule).toBe('BLOCKED_DOMAIN');
      
      const decision2 = policyManager.evaluateImport('https://subdomain.sketchy.net/data', policy);
      expect(decision2.allowed).toBe(false);
    });
    
    it('should allow trusted domains', () => {
      const policy: SecurityPolicy = {
        imports: {
          trustedDomains: ['github.com', '*.trusted.org'],
          default: 'verify'
        }
      };
      
      const decision = policyManager.evaluateImport('https://github.com/user/repo', policy);
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(false);
      expect(decision.matchedRule).toBe('TRUSTED_DOMAIN');
    });
    
    it('should enforce hash requirement', () => {
      const policy: SecurityPolicy = {
        imports: {
          default: 'high',
          requireHash: true
        }
      };
      
      const decision = policyManager.evaluateImport('https://example.com/data', policy);
      expect(decision.allowed).toBe(true);
      expect(decision.constraints?.requireHash).toBe(true);
    });
  });
  
  describe('policy merging', () => {
    it('should merge command policies with security flowing down', () => {
      const global: SecurityPolicy = {
        commands: {
          blocked: ['rm'],
          allowed: ['ls', 'cat'],
          default: 'medium'
        }
      };
      
      const project: SecurityPolicy = {
        commands: {
          blocked: ['curl'],
          allowed: ['npm'],
          default: 'low'  // Less restrictive, should be ignored
        }
      };
      
      const merged = policyManager.mergePolicy(global, project);
      
      // Blocked lists are additive
      expect(merged.commands?.blocked).toContain('rm');
      expect(merged.commands?.blocked).toContain('curl');
      
      // Allowed lists are additive
      expect(merged.commands?.allowed).toContain('ls');
      expect(merged.commands?.allowed).toContain('npm');
      
      // Most restrictive default wins (low is more restrictive than medium)
      expect(merged.commands?.default).toBe('low');
    });
    
    it('should not allow project to trust globally blocked domains', () => {
      const global: SecurityPolicy = {
        imports: {
          blockedDomains: ['evil.com'],
          trustedDomains: ['github.com']
        }
      };
      
      const project: SecurityPolicy = {
        imports: {
          trustedDomains: ['evil.com', 'example.com']  // Trying to trust blocked domain
        }
      };
      
      const merged = policyManager.mergePolicy(global, project);
      
      // evil.com should still be blocked
      expect(merged.imports?.blockedDomains).toContain('evil.com');
      // And should not be in trusted domains
      expect(merged.imports?.trustedDomains).not.toContain('evil.com');
      // But example.com should be trusted
      expect(merged.imports?.trustedDomains).toContain('example.com');
    });
    
    it('should apply inline trust overrides correctly', () => {
      const global: SecurityPolicy = {
        commands: { default: 'high' }
      };
      
      const project: SecurityPolicy = {
        commands: { default: 'medium' }
      };
      
      // Inline trying to be less restrictive (high) - should be ignored
      const merged1 = policyManager.mergePolicy(global, project, { trust: 'high' });
      expect(merged1.commands?.default).toBe('medium');
      
      // Inline being more restrictive - should win
      const merged2 = policyManager.mergePolicy(global, project, { trust: 'verify' });
      expect(merged2.commands?.default).toBe('verify');
    });
  });
  
  describe('resolver evaluation', () => {
    it('should block custom resolvers when not allowed', () => {
      const policy: SecurityPolicy = {
        resolvers: {
          allowCustom: false
        }
      };
      
      const decision = policyManager.evaluateResolver('my-custom-resolver', policy);
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('NO_CUSTOM_RESOLVERS');
    });
    
    it('should enforce allowed resolver list', () => {
      const policy: SecurityPolicy = {
        resolvers: {
          allowedResolvers: ['local', 'http', 'https']
        }
      };
      
      const allowed = policyManager.evaluateResolver('local', policy);
      expect(allowed.allowed).toBe(true);
      
      const blocked = policyManager.evaluateResolver('ftp', policy);
      expect(blocked.allowed).toBe(false);
      expect(blocked.matchedRule).toBe('RESOLVER_NOT_ALLOWED');
    });
  });
});