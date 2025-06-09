import { Environment } from '@interpreter/env/Environment';
import type { SecurityManager } from '@security';
import type { LockFile } from '@core/registry';
import type { URLCache } from '@interpreter/cache/URLCache';
import type { TestEnvironmentConfig } from './EnvironmentFactory';
import { MockSecurityManager } from '../mocks/MockSecurityManager';
import { MockURLCache } from '../mocks/MockURLCache';
import { MockLockFile } from '../mocks/MockLockFile';

export interface SecurityVerification {
  commandChecks: Array<{
    command: string;
    context?: any;
    result: any;
    timestamp: number;
  }>;
  pathChecks: Array<{
    path: string;
    operation: string;
    result: boolean;
    timestamp: number;
  }>;
  taintOperations: Array<{
    value: any;
    source: string;
    timestamp: number;
  }>;
  policyEvaluations: Array<{
    type: string;
    input: any;
    result: any;
    timestamp: number;
  }>;
}

export interface CacheVerification {
  cacheHits: number;
  cacheMisses: number;
  cacheOperations: Array<{
    operation: 'get' | 'set' | 'delete';
    key: string;
    ttl?: any;
    timestamp: number;
  }>;
}

export interface LockFileVerification {
  reads: number;
  writes: number;
  operations: Array<{
    operation: 'read' | 'write' | 'addImport' | 'addCommandApproval';
    data?: any;
    timestamp: number;
  }>;
}

/**
 * Enhanced Environment class for testing with verification capabilities
 * Provides additional methods for test setup, mocking, and verification
 */
export class TestEnvironment extends Environment {
  private testConfig: TestEnvironmentConfig;
  private mocks: Map<string, any> = new Map();
  private startTime: number = Date.now();

  constructor(config: TestEnvironmentConfig, environmentOptions: any) {
    super(environmentOptions);
    this.testConfig = config;
    this.initializeTestComponents();
  }

  /**
   * Initialize test-specific components based on configuration
   */
  private initializeTestComponents(): void {
    // Force security initialization if enabled
    if (this.testConfig.security?.enabled) {
      this.forceSecurityInitialization();
    }

    // Set up mock or real cache
    if (this.testConfig.cache?.enabled) {
      this.initializeTestCache();
    }

    // Set up lock file mocking if needed
    if (this.testConfig.security?.lockFile?.enabled) {
      this.initializeTestLockFile();
    }
  }

  /**
   * Force security initialization, bypassing silent failures
   * Creates mock or real SecurityManager based on config
   */
  forceSecurityInitialization(): void {
    if (this.getSecurityManager()) {
      return; // Already initialized
    }

    if (this.testConfig.security?.mock) {
      const mockSM = new MockSecurityManager(this.testConfig.security);
      this.setSecurityManager(mockSM as any);
      this.mocks.set('SecurityManager', mockSM);
    } else {
      try {
        // Force real SecurityManager creation with error propagation
        const sm = SecurityManager.getInstance(this.getBasePath());
        this.setSecurityManager(sm);
      } catch (error) {
        throw new Error(`Failed to initialize SecurityManager in test: ${error.message}`);
      }
    }
  }

  /**
   * Initialize test cache (mock or real)
   */
  private initializeTestCache(): void {
    if (this.testConfig.cache?.mock) {
      const mockCache = new MockURLCache(this.testConfig.cache);
      this.setURLCache(mockCache as any);
      this.mocks.set('URLCache', mockCache);
    }
    // Real cache initialization handled by parent Environment
  }

  /**
   * Initialize test lock file
   */
  private initializeTestLockFile(): void {
    if (this.testConfig.security?.lockFile?.enabled) {
      const mockLockFile = new MockLockFile(this.testConfig.security.lockFile);
      this.setLockFile(mockLockFile as any);
      this.mocks.set('LockFile', mockLockFile);
    }
  }

  /**
   * Get security verification data (only available with mocked SecurityManager)
   */
  async verifySecurityCalls(): Promise<SecurityVerification> {
    const sm = this.getSecurityManager();
    if (!sm || !(sm instanceof MockSecurityManager)) {
      throw new Error('Security verification only available with mocked SecurityManager');
    }

    return {
      commandChecks: sm.getCommandCheckCalls(),
      pathChecks: sm.getPathCheckCalls(),
      taintOperations: sm.getTaintOperations(),
      policyEvaluations: sm.getPolicyEvaluations()
    };
  }

  /**
   * Get cache verification data (only available with mocked URLCache)
   */
  async verifyCacheOperations(): Promise<CacheVerification> {
    const cache = this.mocks.get('URLCache') as MockURLCache;
    if (!cache) {
      throw new Error('Cache verification only available with mocked URLCache');
    }

    return cache.getVerificationData();
  }

  /**
   * Get lock file verification data (only available with mocked LockFile)
   */
  async verifyLockFileOperations(): Promise<LockFileVerification> {
    const lockFile = this.mocks.get('LockFile') as MockLockFile;
    if (!lockFile) {
      throw new Error('Lock file verification only available with mocked LockFile');
    }

    return lockFile.getVerificationData();
  }

  /**
   * Verify that security integration is working properly
   */
  async verifySecurityIntegration(): Promise<{
    securityManagerAvailable: boolean;
    lockFileAvailable: boolean;
    policyManagerWorking: boolean;
    taintTrackingWorking: boolean;
  }> {
    return {
      securityManagerAvailable: !!this.getSecurityManager(),
      lockFileAvailable: !!this.getLockFile(),
      policyManagerWorking: await this.testPolicyManager(),
      taintTrackingWorking: await this.testTaintTracking()
    };
  }

  /**
   * Mock command approval decision
   */
  mockCommandApproval(command: string, decision: { allowed: boolean; reason?: string }): void {
    const sm = this.mocks.get('SecurityManager') as MockSecurityManager;
    if (!sm) {
      throw new Error('Command mocking only available with mocked SecurityManager');
    }
    sm.mockCommandDecision(command, decision);
  }

  /**
   * Mock path access decision
   */
  mockPathAccess(path: string, operation: 'read' | 'write', allowed: boolean): void {
    const sm = this.mocks.get('SecurityManager') as MockSecurityManager;
    if (!sm) {
      throw new Error('Path mocking only available with mocked SecurityManager');
    }
    sm.mockPathDecision(path, operation, allowed);
  }

  /**
   * Mock URL response with TTL
   */
  mockURLResponse(url: string, content: string, ttl?: any): void {
    const cache = this.mocks.get('URLCache') as MockURLCache;
    if (!cache) {
      throw new Error('URL mocking only available with mocked URLCache');
    }
    cache.mockResponse(url, content, ttl);
  }

  /**
   * Check if a command was security-checked
   */
  wasCommandChecked(command: string): boolean {
    const sm = this.mocks.get('SecurityManager') as MockSecurityManager;
    if (!sm) {
      throw new Error('Command verification only available with mocked SecurityManager');
    }
    return sm.wasCommandChecked(command);
  }

  /**
   * Get count of security checks performed
   */
  getSecurityCheckCount(): number {
    const sm = this.mocks.get('SecurityManager') as MockSecurityManager;
    if (!sm) {
      throw new Error('Security verification only available with mocked SecurityManager');
    }
    return sm.getCommandCheckCount();
  }

  /**
   * Reset all mock data for test isolation
   */
  resetMocks(): void {
    for (const mock of this.mocks.values()) {
      if (mock.reset) {
        mock.reset();
      }
    }
  }

  /**
   * Get test execution time
   */
  getTestDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Clean up test environment
   */
  async cleanup(): Promise<void> {
    this.resetMocks();
    this.mocks.clear();
    
    // Additional cleanup can be added here
  }

  /**
   * Test if PolicyManager is working
   */
  private async testPolicyManager(): Promise<boolean> {
    const sm = this.getSecurityManager();
    if (!sm) return false;

    try {
      // Try to evaluate a simple command
      const decision = await sm.checkCommand('echo test');
      return decision !== undefined && typeof decision.allowed === 'boolean';
    } catch (error) {
      return false;
    }
  }

  /**
   * Test if taint tracking is working
   */
  private async testTaintTracking(): Promise<boolean> {
    const sm = this.getSecurityManager();
    if (!sm) return false;

    try {
      // Track some taint and verify it's stored
      sm.trackTaint('test-value', 'user_input');
      const taint = sm.getTaint('test-value');
      return taint !== undefined;
    } catch (error) {
      return false;
    }
  }

  // Override methods to provide test-specific behavior
  setSecurityManager(sm: SecurityManager): void {
    (this as any).securityManager = sm;
  }

  setURLCache(cache: URLCache): void {
    (this as any).urlCacheManager = cache;
  }

  setLockFile(lockFile: LockFile): void {
    (this as any).lockFile = lockFile;
  }

  getBasePath(): string {
    return (this as any).basePath || '/test';
  }
}