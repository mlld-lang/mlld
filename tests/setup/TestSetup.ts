import { Environment } from '@interpreter/env/Environment';
import { EnvironmentFactory, TestEnvironmentConfig } from '../utils/EnvironmentFactory';
import { TestEnvironment } from '../utils/TestEnvironment';
import { SecurityManager } from '@security';

export type TestType = 'unit' | 'integration' | 'e2e' | 'ttl' | 'lockfile' | 'minimal';

/**
 * Centralized test setup and teardown framework
 * Ensures reliable test isolation and proper cleanup
 */
export class TestSetup {
  private static environments: Environment[] = [];
  private static originalProcessEnv: Record<string, string | undefined> = {};
  private static testStartTime: number = 0;

  /**
   * Set up test environment before each test
   */
  static async beforeEach(testType: TestType = 'unit', overrides: Partial<TestEnvironmentConfig> = {}): Promise<TestEnvironment> {
    TestSetup.testStartTime = Date.now();
    
    try {
      // Reset singletons and global state
      await TestSetup.resetGlobalState();
      
      // Save original environment variables
      TestSetup.saveOriginalEnvironment();
      
      // Create appropriate environment for test type
      const config = TestSetup.getConfigForTestType(testType, overrides);
      const env = EnvironmentFactory.createTestEnvironment(config);
      
      // Track environment for cleanup
      TestSetup.environments.push(env);
      
      return env;
    } catch (error) {
      // If running without security setup hooks, provide a basic environment
      console.warn('Security test setup not available, using basic environment');
      const basicEnv = EnvironmentFactory.createTestEnvironment({
        basePath: '/test',
        security: { enabled: false, mock: false },
        cache: { enabled: false, mock: false },
        fileSystem: { type: 'memory' },
        modules: { enableRegistry: false, mockResolvers: false }
      });
      TestSetup.environments.push(basicEnv);
      return basicEnv;
    }
  }

  /**
   * Clean up after each test
   */
  static async afterEach(): Promise<void> {
    // Clean up all environments
    for (const env of TestSetup.environments) {
      await EnvironmentFactory.cleanupEnvironment(env);
    }
    TestSetup.environments = [];
    
    // Restore original environment variables
    TestSetup.restoreOriginalEnvironment();
    
    // Reset global state again
    await TestSetup.resetGlobalState();
  }

  /**
   * Global cleanup after all tests
   */
  static async afterAll(): Promise<void> {
    // Final cleanup
    await TestSetup.resetGlobalState();
    TestSetup.environments = [];
    TestSetup.originalProcessEnv = {};
  }

  /**
   * Set up test suite (called once per test file)
   */
  static async beforeAll(): Promise<void> {
    // Global setup if needed
    TestSetup.saveOriginalEnvironment();
  }

  /**
   * Create a specific environment type quickly
   */
  static async createSecurityUnitTestEnv(overrides: Partial<TestEnvironmentConfig> = {}): Promise<TestEnvironment> {
    return TestSetup.beforeEach('unit', overrides);
  }

  static async createSecurityIntegrationTestEnv(overrides: Partial<TestEnvironmentConfig> = {}): Promise<TestEnvironment> {
    return TestSetup.beforeEach('integration', overrides);
  }

  static async createTTLTestEnv(overrides: Partial<TestEnvironmentConfig> = {}): Promise<Environment> {
    return TestSetup.beforeEach('ttl', overrides);
  }

  static async createLockFileTestEnv(overrides: Partial<TestEnvironmentConfig> = {}): Promise<Environment> {
    return TestSetup.beforeEach('lockfile', overrides);
  }

  static async createE2ETestEnv(overrides: Partial<TestEnvironmentConfig> = {}): Promise<Environment> {
    return TestSetup.beforeEach('e2e', overrides);
  }

  /**
   * Get test execution time
   */
  static getTestDuration(): number {
    return Date.now() - TestSetup.testStartTime;
  }

  /**
   * Verify test environment is properly set up
   */
  static async verifyTestEnvironment(env: Environment): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if environment is properly initialized
    if (!env) {
      issues.push('Environment is null or undefined');
      return { isValid: false, issues, recommendations };
    }

    // Check security manager availability
    const securityManager = env.getSecurityManager?.();
    if (!securityManager) {
      issues.push('SecurityManager not available');
      recommendations.push('Use EnvironmentFactory.createSecurityUnitTest() or ensure security is enabled in config');
    }

    // Check lock file availability
    const lockFile = env.getLockFile?.();
    if (!lockFile) {
      recommendations.push('Consider enabling lock file in test config if testing lock file functionality');
    }

    // Check URL cache availability
    const urlCache = env.getURLCache?.();
    if (!urlCache) {
      recommendations.push('Consider enabling URL cache in test config if testing cache functionality');
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Set up mock data for common test scenarios
   */
  static setupCommonMocks(env: Environment): void {
    if (!(env instanceof TestEnvironment)) {
      throw new Error('Common mocks only available with TestEnvironment');
    }

    // Mock common command approvals
    env.mockCommandApproval('echo test', { allowed: true });
    env.mockCommandApproval('ls', { allowed: true });
    env.mockCommandApproval('pwd', { allowed: true });
    env.mockCommandApproval('cat', { allowed: true });
    
    // Mock dangerous command blocks
    env.mockCommandApproval('rm -rf /', { allowed: false, reason: 'Dangerous command' });
    env.mockCommandApproval('sudo dangerous', { allowed: false, reason: 'Dangerous command' });
    
    // Mock common path access
    env.mockPathAccess('/test', 'read', true);
    env.mockPathAccess('/test', 'write', true);
    env.mockPathAccess('/blocked', 'read', false);
    env.mockPathAccess('/blocked', 'write', false);
    
    // Mock common URL responses
    env.mockURLResponse('https://example.com/test.mld', '@text greeting = "Hello from URL"');
    env.mockURLResponse('https://cache-test.com/data', 'cached content');
  }

  // === Private Helper Methods ===

  private static getConfigForTestType(testType: TestType, overrides: Partial<TestEnvironmentConfig>): TestEnvironmentConfig {
    const baseConfigs: Record<TestType, TestEnvironmentConfig> = {
      unit: {
        basePath: '/test',
        security: { enabled: true, mock: true, allowCommandExecution: false },
        cache: { enabled: true, mock: true },
        fileSystem: { type: 'memory' },
        modules: { enableRegistry: false, mockResolvers: true }
      },
      integration: {
        basePath: '/test',
        security: { enabled: true, mock: false, allowCommandExecution: true },
        cache: { enabled: true, mock: false },
        fileSystem: { type: 'memory' },
        modules: { enableRegistry: true, mockResolvers: false }
      },
      e2e: {
        basePath: '/test',
        security: { enabled: true, mock: false, allowCommandExecution: true },
        cache: { enabled: true, mock: false },
        fileSystem: { type: 'real' },
        modules: { enableRegistry: true, mockResolvers: false }
      },
      ttl: {
        basePath: '/test',
        security: { enabled: true, mock: true },
        cache: { enabled: true, mock: true, ttlBehavior: 'strict' },
        fileSystem: { type: 'memory' },
        modules: { enableRegistry: false, mockResolvers: true }
      },
      lockfile: {
        basePath: '/test',
        security: { 
          enabled: true, 
          mock: true, 
          lockFile: { enabled: true, autoCreate: true } 
        },
        cache: { enabled: true, mock: true },
        fileSystem: { type: 'memory' },
        modules: { enableRegistry: true, mockResolvers: true }
      },
      minimal: {
        basePath: '/test',
        security: { enabled: false, mock: false },
        cache: { enabled: false, mock: false },
        fileSystem: { type: 'memory' },
        modules: { enableRegistry: false, mockResolvers: false }
      }
    };

    const baseConfig = baseConfigs[testType];
    return TestSetup.mergeConfigs(baseConfig, overrides);
  }

  private static mergeConfigs(base: TestEnvironmentConfig, overrides: Partial<TestEnvironmentConfig>): TestEnvironmentConfig {
    return {
      ...base,
      ...overrides,
      basePath: overrides.basePath || base.basePath,
      security: overrides.security ? { ...base.security, ...overrides.security } : base.security,
      cache: overrides.cache ? { ...base.cache, ...overrides.cache } : base.cache,
      fileSystem: overrides.fileSystem ? { ...base.fileSystem, ...overrides.fileSystem } : base.fileSystem,
      modules: overrides.modules ? { ...base.modules, ...overrides.modules } : base.modules
    };
  }

  private static async resetGlobalState(): Promise<void> {
    // Reset SecurityManager singleton
    if (SecurityManager.resetInstance) {
      SecurityManager.resetInstance();
    }

    // Reset other global state as needed
    // TODO: Add other singleton resets here as they're identified
  }

  private static saveOriginalEnvironment(): void {
    // Save current environment variables
    TestSetup.originalProcessEnv = { ...process.env };
  }

  private static restoreOriginalEnvironment(): void {
    // Restore original environment variables
    for (const key in process.env) {
      if (!(key in TestSetup.originalProcessEnv)) {
        delete process.env[key];
      }
    }
    
    for (const [key, value] of Object.entries(TestSetup.originalProcessEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  private static resetTestEnvironmentVariables(): void {
    // Remove test-specific environment variables
    const testVars = [
      'MOCK_BASH',
      'MLLD_TEST_MODE',
      'MLLD_MOCK_TIME',
      'MLLD_SKIP_HASH_VALIDATION',
      'NODE_ENV'
    ];

    for (const varName of testVars) {
      delete process.env[varName];
    }
  }
}

/**
 * Vitest setup helpers
 * These can be imported and used in vitest.config.ts setup files
 */
export const vitestSetup = {
  /**
   * Setup function for vitest beforeEach
   */
  beforeEach: async (testType: TestType = 'unit') => {
    return TestSetup.beforeEach(testType);
  },

  /**
   * Cleanup function for vitest afterEach
   */
  afterEach: async () => {
    return TestSetup.afterEach();
  },

  /**
   * Global setup for vitest beforeAll
   */
  beforeAll: async () => {
    return TestSetup.beforeAll();
  },

  /**
   * Global cleanup for vitest afterAll
   */
  afterAll: async () => {
    return TestSetup.afterAll();
  }
};