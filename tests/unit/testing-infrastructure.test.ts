import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvironmentFactory, TestEnvironmentConfig } from '../utils/EnvironmentFactory';
import { MockSecurityManager } from '../mocks/MockSecurityManager';
import { MockURLCache } from '../mocks/MockURLCache';
import { MockLockFile } from '../mocks/MockLockFile';
import { TTLTestFramework } from '../utils/TTLTestFramework';

/**
 * Core testing infrastructure validation
 * Tests the testing framework itself to ensure it's working correctly
 */
describe('Testing Infrastructure Core', () => {
  describe('EnvironmentFactory', () => {
    it('should create environment configurations', () => {
      const config: TestEnvironmentConfig = {
        security: { enabled: true, mock: true },
        cache: { enabled: true, mock: true },
        fileSystem: { type: 'memory' }
      };

      expect(config.security?.enabled).toBe(true);
      expect(config.cache?.enabled).toBe(true);
      expect(config.fileSystem?.type).toBe('memory');
    });

    it('should handle different environment types', () => {
      const unitConfig: TestEnvironmentConfig = {
        security: { enabled: true, mock: true },
        cache: { enabled: true, mock: true }
      };

      const integrationConfig: TestEnvironmentConfig = {
        security: { enabled: true, mock: false },
        cache: { enabled: true, mock: false }
      };

      expect(unitConfig.security?.mock).toBe(true);
      expect(integrationConfig.security?.mock).toBe(false);
    });
  });

  describe('MockSecurityManager', () => {
    let mockSM: MockSecurityManager;

    beforeEach(() => {
      mockSM = new MockSecurityManager({
        enabled: true,
        mock: true,
        allowCommandExecution: false,
        defaultTrust: 'verify'
      });
    });

    afterEach(() => {
      mockSM.reset();
    });

    it('should track command checks', async () => {
      await mockSM.checkCommand('echo test');
      await mockSM.checkCommand('ls -la');

      expect(mockSM.getCommandCheckCount()).toBe(2);
      expect(mockSM.wasCommandChecked('echo test')).toBe(true);
      expect(mockSM.wasCommandChecked('ls -la')).toBe(true);
      expect(mockSM.wasCommandChecked('not-called')).toBe(false);
    });

    it('should provide configurable command decisions', async () => {
      mockSM.mockCommandDecision('dangerous-cmd', { 
        allowed: false, 
        reason: 'Blocked for testing' 
      });

      const result = await mockSM.checkCommand('dangerous-cmd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Blocked for testing');
    });

    it('should track path access checks', async () => {
      await mockSM.checkPath('/safe/path', 'read');
      await mockSM.checkPath('/blocked/path', 'write');

      const pathChecks = mockSM.getPathCheckCalls();
      expect(pathChecks).toHaveLength(2);
      expect(pathChecks[0].path).toBe('/safe/path');
      expect(pathChecks[0].operation).toBe('read');
      expect(pathChecks[1].path).toBe('/blocked/path');
      expect(pathChecks[1].operation).toBe('write');
    });

    it('should track taint operations', () => {
      mockSM.trackTaint('user-input', 'user_input');
      mockSM.trackTaint('network-data', 'network');

      const taintOps = mockSM.getTaintOperations();
      expect(taintOps).toHaveLength(2);
      expect(taintOps[0].source).toBe('user_input');
      expect(taintOps[1].source).toBe('network');
    });

    it('should provide taint retrieval', () => {
      mockSM.trackTaint('test-value', 'user_input');
      
      const taint = mockSM.getTaint('test-value');
      expect(taint).toBeDefined();
      expect(taint?.level).toBeDefined();
    });

    it('should reset properly between tests', async () => {
      await mockSM.checkCommand('test1');
      await mockSM.checkCommand('test2');
      mockSM.trackTaint('data', 'network');

      expect(mockSM.getCommandCheckCount()).toBe(2);
      expect(mockSM.getTaintOperations()).toHaveLength(1);

      mockSM.reset();

      expect(mockSM.getCommandCheckCount()).toBe(0);
      expect(mockSM.getTaintOperations()).toHaveLength(0);
    });

    it('should apply default security policies', async () => {
      // Dangerous command should be blocked by default
      const dangerous = await mockSM.checkCommand('rm -rf /');
      expect(dangerous.allowed).toBe(false);

      // Safe command should be allowed
      const safe = await mockSM.checkCommand('echo hello');
      expect(safe.allowed).toBe(true);
    });
  });

  describe('MockURLCache', () => {
    let mockCache: MockURLCache;

    beforeEach(() => {
      mockCache = new MockURLCache({
        enabled: true,
        mock: true,
        ttlBehavior: 'strict'
      });
    });

    afterEach(() => {
      mockCache.reset();
    });

    it('should track cache operations', async () => {
      await mockCache.set('https://test.com', 'content');
      await mockCache.get('https://test.com');
      await mockCache.get('https://missing.com'); // miss

      const verification = mockCache.getVerificationData();
      expect(verification.cacheOperations).toHaveLength(3);
      expect(verification.cacheHits).toBe(1);
      expect(verification.cacheMisses).toBe(1);
    });

    it('should enforce TTL behavior', async () => {
      // Static TTL - should cache forever
      await mockCache.set('https://static.com', 'content', { 
        ttl: { type: 'static' } 
      });
      
      const result1 = await mockCache.get('https://static.com', { type: 'static' });
      const result2 = await mockCache.get('https://static.com', { type: 'static' });
      
      expect(result1).toBe('content');
      expect(result2).toBe('content');
      expect(mockCache.getVerificationData().cacheHits).toBe(2);
    });

    it('should handle live TTL (no caching)', async () => {
      await mockCache.set('https://live.com', 'content');
      
      // Live TTL should not use cache
      const result = await mockCache.get('https://live.com', { type: 'live' });
      expect(result).toBe(null); // Should force fresh fetch
    });

    it('should support cache configuration', () => {
      mockCache.mockResponse('https://example.com', 'mock content');
      
      expect(mockCache.wasCached('https://example.com')).toBe(true);
      expect(mockCache.getSize()).toBe(1);
      expect(mockCache.getCachedURLs()).toContain('https://example.com');
    });
  });

  describe('MockLockFile', () => {
    let mockLockFile: MockLockFile;

    beforeEach(() => {
      mockLockFile = new MockLockFile({
        enabled: true,
        autoCreate: true,
        readonly: false
      });
    });

    afterEach(() => {
      mockLockFile.reset();
    });

    it('should track lock file operations', async () => {
      await mockLockFile.addImport('https://test.com', {
        resolved: 'https://test.com',
        integrity: 'sha256-abc123',
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always'
      });

      const verification = mockLockFile.getVerificationData();
      expect(verification.operations.length).toBeGreaterThan(0);
      expect(verification.writes).toBeGreaterThan(0);
      
      expect(mockLockFile.wasImportAdded('https://test.com')).toBe(true);
    });

    it('should handle command approvals', async () => {
      await mockLockFile.addCommandApproval('npm test', {
        trust: 'always',
        approvedBy: 'test-user'
      });

      const approval = await mockLockFile.getCommandApproval('npm test');
      expect(approval).toBeDefined();
      expect(approval?.trust).toBe('always');
      
      expect(mockLockFile.wasCommandApprovalAdded('npm test')).toBe(true);
    });

    it('should provide security policy', () => {
      const policy = mockLockFile.getSecurityPolicy();
      expect(policy).toBeDefined();
      expect(policy.commands).toBeDefined();
      expect(policy.paths).toBeDefined();
      expect(policy.imports).toBeDefined();
    });

    it('should support mock configuration', () => {
      mockLockFile.mockImportEntry('https://mock.com', {
        trust: 'verify',
        integrity: 'sha256-test'
      });

      const entry = mockLockFile.getImport('https://mock.com');
      expect(entry).toBeDefined();
      expect(entry?.trust).toBe('verify');
    });
  });

  describe('TTLTestFramework', () => {
    let mockEnv: any;
    let ttlFramework: TTLTestFramework;

    beforeEach(() => {
      // Mock environment for TTL testing
      mockEnv = {
        getURLCache: () => new MockURLCache({
          enabled: true,
          mock: true,
          ttlBehavior: 'strict'
        }),
        fetchURL: async (url: string) => `Mock content for ${url}`,
        executeCommand: async (cmd: string) => `Mock result for ${cmd}`,
        getSecurityCheckCount: () => 0,
        wasCommandChecked: () => false
      };
      
      ttlFramework = new TTLTestFramework(mockEnv);
    });

    it('should create directives with metadata', () => {
      const directive = TTLTestFramework.createDirectiveWithMetadata(
        'run',
        'echo test',
        { 
          ttl: { type: 'static' },
          trust: 'verify'
        }
      );

      expect(directive.type).toBe('directive');
      expect(directive.directive).toBe('run');
      expect(directive.meta?.ttl?.type).toBe('static');
      expect(directive.meta?.trust).toBe('verify');
    });

    it('should support different directive types', () => {
      const runDirective = TTLTestFramework.createDirectiveWithMetadata(
        'run',
        'echo test',
        { trust: 'always' }
      );

      const pathDirective = TTLTestFramework.createDirectiveWithMetadata(
        'path',
        'config = ./config.json',
        { ttl: { type: 'duration', value: 5000 } }
      );

      expect(runDirective.directive).toBe('run');
      expect(runDirective.values.command).toBeDefined();
      
      expect(pathDirective.directive).toBe('path');
      expect(pathDirective.values.identifier).toBeDefined();
      expect(pathDirective.values.path).toBeDefined();
    });
  });

  describe('Test Infrastructure Integration', () => {
    it('should provide consistent interface', () => {
      const mockSM = new MockSecurityManager({
        enabled: true,
        mock: true
      });

      const mockCache = new MockURLCache({
        enabled: true,
        mock: true
      });

      const mockLockFile = new MockLockFile({
        enabled: true,
        autoCreate: true
      });

      // All mocks should have reset functionality
      expect(typeof mockSM.reset).toBe('function');
      expect(typeof mockCache.reset).toBe('function');
      expect(typeof mockLockFile.reset).toBe('function');

      // All mocks should have verification capabilities
      expect(typeof mockSM.getCommandCheckCalls).toBe('function');
      expect(typeof mockCache.getVerificationData).toBe('function');
      expect(typeof mockLockFile.getVerificationData).toBe('function');
    });

    it('should handle error conditions gracefully', async () => {
      const mockSM = new MockSecurityManager({
        enabled: true,
        mock: true,
        defaultTrust: 'block'
      });

      // Should handle blocked commands
      const blockedResult = await mockSM.checkCommand('blocked-command');
      expect(blockedResult.allowed).toBe(false);

      // Should handle missing path permissions
      mockSM.mockPathDecision('/blocked', 'read', false);
      const pathResult = await mockSM.checkPath('/blocked', 'read');
      expect(pathResult).toBe(false);
    });

    it('should provide comprehensive verification data', async () => {
      const mockSM = new MockSecurityManager({
        enabled: true,
        mock: true
      });

      // Generate some test data
      await mockSM.checkCommand('cmd1');
      await mockSM.checkCommand('cmd2');
      await mockSM.checkPath('/path1', 'read');
      mockSM.trackTaint('data1', 'user_input');
      mockSM.trackTaint('data2', 'network');

      // Verify comprehensive data is available
      const cmdCalls = mockSM.getCommandCheckCalls();
      const pathCalls = mockSM.getPathCheckCalls();
      const taintOps = mockSM.getTaintOperations();

      expect(cmdCalls).toHaveLength(2);
      expect(pathCalls).toHaveLength(1);
      expect(taintOps).toHaveLength(2);

      // Each call should have timestamp and context
      expect(cmdCalls[0].timestamp).toBeGreaterThan(0);
      expect(pathCalls[0].timestamp).toBeGreaterThan(0);
      expect(taintOps[0].timestamp).toBeGreaterThan(0);
    });
  });
});

/**
 * Performance and reliability tests for the testing infrastructure
 */
describe('Testing Infrastructure Performance', () => {
  it('should handle large numbers of operations efficiently', async () => {
    const mockSM = new MockSecurityManager({
      enabled: true,
      mock: true
    });

    const startTime = Date.now();

    // Perform many operations
    for (let i = 0; i < 1000; i++) {
      await mockSM.checkCommand(`command-${i}`);
    }

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // Should complete in < 1 second

    expect(mockSM.getCommandCheckCount()).toBe(1000);
  });

  it('should maintain memory efficiency with reset', async () => {
    const mockSM = new MockSecurityManager({
      enabled: true,
      mock: true
    });

    // Generate data
    for (let i = 0; i < 100; i++) {
      await mockSM.checkCommand(`cmd-${i}`);
      mockSM.trackTaint(`data-${i}`, 'user_input');
    }

    expect(mockSM.getCommandCheckCount()).toBe(100);
    expect(mockSM.getTaintOperations()).toHaveLength(100);

    // Reset should clear everything
    mockSM.reset();

    expect(mockSM.getCommandCheckCount()).toBe(0);
    expect(mockSM.getTaintOperations()).toHaveLength(0);
  });

  it('should provide fast verification queries', async () => {
    const mockSM = new MockSecurityManager({
      enabled: true,
      mock: true
    });

    // Add many commands
    for (let i = 0; i < 500; i++) {
      await mockSM.checkCommand(`command-${i}`);
    }

    const startTime = Date.now();

    // Verification queries should be fast
    const wasChecked = mockSM.wasCommandChecked('command-250');
    const count = mockSM.getCommandCheckCount();
    const calls = mockSM.getCommandCheckCalls();

    const queryDuration = Date.now() - startTime;
    expect(queryDuration).toBeLessThan(50); // Should be very fast

    expect(wasChecked).toBe(true);
    expect(count).toBe(500);
    expect(calls).toHaveLength(500);
  });
});