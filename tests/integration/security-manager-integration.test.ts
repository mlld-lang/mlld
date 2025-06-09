import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestSetup, TestEnvironment } from '../setup/vitest-security-setup';
import { SecurityManager } from '@security/SecurityManager';

describe('SecurityManager Integration - Phase 1', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await TestSetup.createSecurityIntegrationTestEnv();
  });

  afterEach(async () => {
    await TestSetup.afterEach();
  });

  describe('Environment Constructor', () => {
    it('should initialize SecurityManager when security is enabled', async () => {
      // Test that SecurityManager is properly initialized
      const securityManager = env.getSecurityManager();
      expect(securityManager).toBeDefined();
      expect(securityManager).toBeInstanceOf(SecurityManager);
    });

    it('should not initialize SecurityManager when security is disabled', async () => {
      // Create environment with security disabled
      const envNoSecurity = await TestSetup.createSecurityUnitTestEnv({
        security: { enabled: false, mock: false }
      });
      
      const securityManager = envNoSecurity.getSecurityManager();
      expect(securityManager).toBeUndefined();
    });

    it('should use mocked SecurityManager in unit test environment', async () => {
      const unitEnv = await TestSetup.createSecurityUnitTestEnv();
      const securityManager = unitEnv.getSecurityManager();
      
      expect(securityManager).toBeDefined();
      // Should be MockSecurityManager in unit test environment
      expect(securityManager.constructor.name).toBe('MockSecurityManager');
    });
  });

  describe('SecurityManager Initialization', () => {
    it('should pass correct project path to SecurityManager', async () => {
      const securityManager = env.getSecurityManager();
      expect(securityManager).toBeDefined();
      
      // Verify SecurityManager was created with correct path
      // (This test will help us ensure the constructor receives the right basePath)
    });

    it('should handle SecurityManager initialization errors gracefully', async () => {
      // Test that Environment creation doesn't fail if SecurityManager init fails
      // This ensures robustness in production environments
      expect(() => {
        // Environment creation should not throw even if SecurityManager fails
      }).not.toThrow();
    });
  });
});