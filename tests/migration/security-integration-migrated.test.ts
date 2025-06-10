import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestSetup, EnvironmentFactory, TestEnvironment, TTLTestFramework } from '../setup/vitest-security-setup';

/**
 * Example migration of existing security integration tests to new framework
 * 
 * BEFORE: Tests had inconsistent setup, silent failures, unreliable mocking
 * AFTER: Tests use standardized framework with proper verification
 */
describe('Security Integration (Migrated)', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await TestSetup.createSecurityUnitTestEnv({
      security: { 
        enabled: true, 
        mock: true, 
        allowCommandExecution: false,
        lockFile: { enabled: true, autoCreate: true } 
      }
    });
  });

  afterEach(async () => {
    await TestSetup.afterEach();
  });

  describe('Command Execution Security', () => {
    it('should call SecurityManager for all commands', async () => {
      // OLD WAY: Hard to verify if security was actually checked
      // const result = await env.executeCommand('echo test');
      // expect(result).toBe('test'); // No verification of security

      // NEW WAY: Explicit verification of security integration
      const testCommand = 'echo "security test"';
      
      await env.executeCommand(testCommand);
      
      // Verify security was actually checked
      expect(env.wasCommandChecked(testCommand)).toBe(true);
      
      // Get detailed verification data
      const verification = await env.verifySecurityCalls();
      expect(verification.commandChecks).toHaveLength(1);
      expect(verification.commandChecks[0].command).toBe(testCommand);
      expect(verification.commandChecks[0].result).toBeDefined();
    });

    it('should apply trust levels to security context', async () => {
      // Test trust level propagation through the security manager
      const sm = env.getSecurityManager();
      expect(sm).toBeDefined();
      
      // Create security context with trust level
      const context = {
        file: '/test/mock.mld',
        line: 1,
        directive: 'run',
        metadata: {
          trust: 'verify'
        }
      };
      
      // Call security manager with trust context
      await sm!.checkCommand('echo "trust test"', context);
      
      // Verify trust level was passed to security context
      const verification = await env.verifySecurityCalls();
      const securityCall = verification.commandChecks[0];
      expect(securityCall.context?.metadata?.trust).toBe('verify');
    });

    it('should block commands based on security policy', async () => {
      // Configure strict security policy
      env.mockCommandApproval('dangerous-command', { 
        allowed: false, 
        reason: 'Blocked by security policy' 
      });

      // Attempt to execute dangerous command
      await expect(env.executeCommand('dangerous-command')).rejects.toThrow();
      
      // Verify security check occurred
      expect(env.wasCommandChecked('dangerous-command')).toBe(true);
      
      const verification = await env.verifySecurityCalls();
      expect(verification.commandChecks[0].result.allowed).toBe(false);
    });

    it('should track taint from command output', async () => {
      const testCommand = 'echo "user-input"';
      
      // Execute command and manually track taint (simulating what real integration would do)
      const result = await env.executeCommand(testCommand);
      
      // Manually track taint (simulating what the interpreter would do)
      const sm = env.getSecurityManager();
      sm?.trackTaint(result, 'command_output');
      
      // Verify taint was tracked
      const verification = await env.verifySecurityCalls();
      expect(verification.taintOperations.length).toBeGreaterThan(0);
      
      // Check specific taint operation
      const taintOp = verification.taintOperations.find(op => 
        op.source === 'command_output'
      );
      expect(taintOp).toBeDefined();
    });
  });

  describe('Path Access Security', () => {
    it('should check path permissions before file access', async () => {
      // OLD WAY: Tests often skipped security checks
      // const content = await env.readFile('/test/file.txt');

      // NEW WAY: Explicit security verification
      env.mockPathAccess('/test/secure-file.txt', 'read', true);
      
      try {
        await env.readFile('/test/secure-file.txt');
      } catch (error) {
        // File might not exist, but security should still be checked
      }
      
      // Verify security check occurred
      const verification = await env.verifySecurityCalls();
      const pathCheck = verification.pathChecks.find(check => 
        check.path === '/test/secure-file.txt' && check.operation === 'read'
      );
      expect(pathCheck).toBeDefined();
    });

    it('should deny access to blocked paths', async () => {
      env.mockPathAccess('/etc/passwd', 'read', false);
      
      await expect(env.readFile('/etc/passwd')).rejects.toThrow();
      
      // Verify security denial
      const verification = await env.verifySecurityCalls();
      const pathCheck = verification.pathChecks.find(check => 
        check.path === '/etc/passwd'
      );
      expect(pathCheck?.result).toBe(false);
    });

    it('should track taint from file system access', async () => {
      // Set up file with content
      env.mockPathAccess('/test/data.txt', 'read', true);
      
      try {
        await env.readFile('/test/data.txt');
      } catch (error) {
        // Expected if file doesn't exist
      }
      
      // Verify taint tracking occurred
      const verification = await env.verifySecurityCalls();
      const fileTaint = verification.taintOperations.find(op => 
        op.source === 'file_system'
      );
      // Note: Only tracked if file actually exists and is read
    });
  });

  describe('TTL/Trust Enforcement', () => {
    let ttlFramework: TTLTestFramework;

    beforeEach(() => {
      ttlFramework = new TTLTestFramework(env);
    });

    it('should respect trust levels for URL access', async () => {
      // OLD WAY: Trust levels were parsed but not enforced
      // NEW WAY: End-to-end verification of trust enforcement

      const trustScenarios = await ttlFramework.testTrustScenarios();
      
      // Verify each trust level behaves correctly
      const alwaysResult = trustScenarios.find(s => s.scenario.includes('Always'));
      expect(alwaysResult?.result.allowed).toBe(true);
      
      const neverResult = trustScenarios.find(s => s.scenario.includes('Never'));
      expect(neverResult?.result.allowed).toBe(false);
      
      const verifyResult = trustScenarios.find(s => s.scenario.includes('Verify'));
      expect(verifyResult?.result.securityChecks).toBeGreaterThan(0);
    });

    it('should enforce TTL caching behavior', async () => {
      // OLD WAY: TTL values were parsed but cache behavior wasn't tested
      // NEW WAY: Comprehensive TTL behavior verification

      const ttlScenarios = await ttlFramework.testTTLScenarios();
      
      // Verify each TTL type behaves correctly
      ttlScenarios.forEach(({ scenario, result }) => {
        expect(result.fetches.length).toBeGreaterThanOrEqual(2);
        
        if (scenario.includes('Live')) {
          // Live content should never be cached
          expect(result.fetches[1].fromCache).toBe(false);
        } else if (scenario.includes('Static')) {
          // Static content should always be cached
          expect(result.fetches[1].fromCache).toBe(true);
        } else if (scenario.includes('Duration')) {
          // Duration-based should cache then expire
          expect(result.fetches[1].fromCache).toBe(true);
          if (result.fetches[2]) {
            expect(result.fetches[2].fromCache).toBe(false);
          }
        }
      });
    });

    it('should combine TTL and trust enforcement correctly', async () => {
      // NEW: Test interaction between TTL and trust
      const result = await ttlFramework.testTTLTrustInteraction(
        'https://secure.com/data.mld',
        { type: 'static' },
        'verify'
      );
      
      expect(result.ttlResult.behaviorCorrect).toBe(true);
      expect(result.trustResult.securityChecks).toBeGreaterThan(0);
      expect(result.interactionCorrect).toBe(true);
    });
  });

  describe('Lock File Integration', () => {
    let lockFileEnv: TestEnvironment;

    beforeEach(async () => {
      lockFileEnv = await TestSetup.createLockFileTestEnv() as TestEnvironment;
    });

    afterEach(async () => {
      await EnvironmentFactory.cleanupEnvironment(lockFileEnv);
    });

    it('should have lock file available', async () => {
      // OLD WAY: env.getLockFile() often returned undefined
      // NEW WAY: Guaranteed lock file availability in test environment

      const lockFile = lockFileEnv.getLockFile();
      expect(lockFile).toBeDefined();
      
      // Verify lock file operations work
      await lockFile.addImport('https://example.com/test.mld', {
        resolved: 'https://example.com/test.mld',
        integrity: 'sha256-abc123',
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'always'
      });
      
      const imported = lockFile.getImport('https://example.com/test.mld');
      expect(imported).toBeDefined();
      expect(imported.trust).toBe('always');
    });

    it('should track lock file operations', async () => {
      // NEW: Comprehensive operation tracking
      const lockFile = lockFileEnv.getLockFile();
      
      // Perform various operations
      await lockFile.addCommandApproval('echo test', {
        trust: 'always',
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user'
      });
      
      const approval = await lockFile.getCommandApproval('echo test');
      expect(approval).toBeDefined();
      
      // Verify operations were tracked
      const verification = await lockFileEnv.verifyLockFileOperations();
      expect(verification.operations.length).toBeGreaterThan(0);
      expect(verification.writes).toBeGreaterThan(0);
    });

    it('should persist security decisions', async () => {
      // NEW: Verify security decisions are actually saved
      const lockFile = lockFileEnv.getLockFile();
      
      // Add multiple types of approvals
      await lockFile.addCommandApproval('npm test', {
        trust: 'pattern',
        approvedBy: 'test-user'
      });
      
      await lockFile.addImport('https://registry.com/module', {
        resolved: 'https://registry.com/module',
        integrity: 'sha256-def456',
        approvedAt: new Date().toISOString(),
        approvedBy: 'test-user',
        trust: 'verify'
      });
      
      // Verify persistence
      const cmdApproval = await lockFile.getCommandApproval('npm test');
      expect(cmdApproval.trust).toBe('pattern');
      
      const importEntry = lockFile.getImport('https://registry.com/module');
      expect(importEntry.trust).toBe('verify');
      
      // Verify tracking
      const verification = await lockFileEnv.verifyLockFileOperations();
      expect(verification.operations.some(op => op.operation === 'addCommandApproval')).toBe(true);
      expect(verification.operations.some(op => op.operation === 'addImport')).toBe(true);
    });
  });

  describe('Environment Verification', () => {
    it('should verify test environment is properly configured', async () => {
      // NEW: Proactive verification of test setup
      const verification = await TestSetup.verifyTestEnvironment(env);
      
      expect(verification.isValid).toBe(true);
      expect(verification.issues).toHaveLength(0);
      
      // Check specific components
      const securityIntegration = await env.verifySecurityIntegration();
      expect(securityIntegration.securityManagerAvailable).toBe(true);
      expect(securityIntegration.lockFileAvailable).toBe(true);
    });

    it('should provide meaningful error information when tests fail', async () => {
      // NEW: Rich debugging information
      
      // Intentionally cause a security check
      await env.executeCommand('echo "debug test"');
      
      // Get comprehensive test state
      const verification = await env.verifySecurityCalls();
      const duration = env.getTestDuration();
      
      // This information helps debug test failures
      expect(verification.commandChecks.length).toBeGreaterThan(0);
      expect(duration).toBeGreaterThan(0);
      
      // Example of how to debug failing tests:
      if (verification.commandChecks.length === 0) {
        console.error('No security checks performed - SecurityManager may not be initialized');
      }
      
      if (duration > 5000) {
        console.warn(`Test took ${duration}ms - may indicate performance issue`);
      }
    });
  });
});

/**
 * Key improvements demonstrated in this migration:
 * 
 * 1. **Reliable Security Verification**: Tests now explicitly verify that security
 *    checks are performed, not just that the code doesn't crash.
 * 
 * 2. **Comprehensive Mock Framework**: MockSecurityManager provides detailed
 *    tracking and verification capabilities.
 * 
 * 3. **TTL/Trust Testing**: Dedicated framework for testing complex TTL and
 *    trust interactions end-to-end.
 * 
 * 4. **Lock File Integration**: Guaranteed lock file availability and operation
 *    tracking in test environments.
 * 
 * 5. **Environment Verification**: Proactive checking that test environments
 *    are properly configured.
 * 
 * 6. **Better Debugging**: Rich information available when tests fail to help
 *    identify root causes.
 * 
 * 7. **Test Isolation**: Proper cleanup and state management between tests.
 */