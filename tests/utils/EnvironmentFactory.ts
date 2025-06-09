import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { Environment } from '@interpreter/env/Environment';
import { TestEnvironment } from './TestEnvironment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { SecurityManager } from '@security';
import { MockSecurityManager } from '../mocks/MockSecurityManager';
import { MockURLCache } from '../mocks/MockURLCache';
import { MockLockFile } from '../mocks/MockLockFile';

export interface SecurityConfig {
  enabled: boolean;
  mock: boolean;
  policies?: any; // SecurityPolicy type
  lockFile?: LockFileConfig;
  allowCommandExecution?: boolean;
  defaultTrust?: 'allow' | 'verify' | 'block';
}

export interface CacheConfig {
  enabled: boolean;
  mock: boolean;
  ttlBehavior?: 'strict' | 'lenient';
  defaultTTL?: number;
  enableURLCache?: boolean;
}

export interface FileSystemConfig {
  type: 'memory' | 'real';
  basePath?: string;
  readonly?: boolean;
  initialFiles?: Record<string, string>;
}

export interface ModuleConfig {
  enableRegistry: boolean;
  mockResolvers: boolean;
  registryEntries?: Record<string, any>;
}

export interface LockFileConfig {
  enabled: boolean;
  autoCreate: boolean;
  readonly?: boolean;
  initialData?: any;
}

export interface TestEnvironmentConfig {
  security?: SecurityConfig;
  cache?: CacheConfig;
  fileSystem?: FileSystemConfig;
  modules?: ModuleConfig;
  basePath?: string;
  enableStdin?: boolean;
  environmentVariables?: Record<string, string>;
}

/**
 * Factory for creating consistent, configurable test environments
 * Ensures proper initialization order and component wiring
 */
export class EnvironmentFactory {
  /**
   * Create a test environment with the specified configuration
   */
  static createTestEnvironment(config: TestEnvironmentConfig = {}): TestEnvironment {
    const {
      basePath = '/test',
      fileSystem = { type: 'memory' },
      security = { enabled: true, mock: true },
      cache = { enabled: true, mock: true },
      modules = { enableRegistry: false, mockResolvers: true },
      enableStdin = false,
      environmentVariables = {}
    } = config;

    // Set up environment variables for test
    const originalEnv: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(environmentVariables)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }

    // Create file system
    const fs = EnvironmentFactory.createFileSystem(fileSystem);
    const pathService = new PathService();

    // Create base environment with security options
    const environmentOptions = {
      security: {
        enabled: security.enabled,
        mock: security.mock,
        manager: security.mock ? new MockSecurityManager({
          enabled: security.enabled,
          allowCommandExecution: security.allowCommandExecution ?? false,
          defaultTrust: security.defaultTrust ?? 'verify'
        }) : undefined
      }
    };

    const env = new TestEnvironment(
      config,
      fs,
      pathService,
      basePath,
      environmentOptions
    );
    
    // Note: URL config is handled inside Environment constructor via urlConfig parameter
    // The Environment constructor will handle security and cache initialization internally

    // Store cleanup data
    (env as any).__testCleanup = {
      originalEnv,
      environmentVariables: Object.keys(environmentVariables)
    };

    return env;
  }

  /**
   * Create environment for security unit tests (mocked SecurityManager)
   */
  static createSecurityUnitTest(overrides: Partial<TestEnvironmentConfig> = {}): TestEnvironment {
    return this.createTestEnvironment({
      security: { enabled: true, mock: true, allowCommandExecution: false },
      cache: { enabled: true, mock: true },
      fileSystem: { type: 'memory' },
      modules: { enableRegistry: false, mockResolvers: true },
      ...overrides
    });
  }

  /**
   * Create environment for security integration tests (real SecurityManager)
   */
  static createSecurityIntegrationTest(overrides: Partial<TestEnvironmentConfig> = {}): TestEnvironment {
    return this.createTestEnvironment({
      security: { enabled: true, mock: false, allowCommandExecution: true },
      cache: { enabled: true, mock: false },
      fileSystem: { type: 'memory' },
      modules: { enableRegistry: true, mockResolvers: false },
      ...overrides
    });
  }

  /**
   * Create environment for E2E tests (real components, temporary filesystem)
   */
  static createE2ETest(overrides: Partial<TestEnvironmentConfig> = {}): Environment {
    const testDir = `/tmp/mlld-e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return this.createTestEnvironment({
      security: { enabled: true, mock: false, allowCommandExecution: true },
      cache: { enabled: true, mock: false },
      fileSystem: { type: 'real', basePath: testDir },
      modules: { enableRegistry: true, mockResolvers: false },
      basePath: testDir,
      ...overrides
    });
  }

  /**
   * Create environment for TTL/trust testing
   */
  static createTTLTest(overrides: Partial<TestEnvironmentConfig> = {}): Environment {
    return this.createTestEnvironment({
      security: { enabled: true, mock: true },
      cache: { enabled: true, mock: true, ttlBehavior: 'strict' },
      fileSystem: { type: 'memory' },
      modules: { enableRegistry: false, mockResolvers: true },
      ...overrides
    });
  }

  /**
   * Create environment for lock file testing
   */
  static createLockFileTest(overrides: Partial<TestEnvironmentConfig> = {}): Environment {
    return this.createTestEnvironment({
      security: { 
        enabled: true, 
        mock: true, 
        lockFile: { enabled: true, autoCreate: true } 
      },
      cache: { enabled: true, mock: true },
      fileSystem: { type: 'memory' },
      modules: { enableRegistry: true, mockResolvers: true },
      ...overrides
    });
  }

  /**
   * Create minimal environment (no security, no cache) for basic testing
   */
  static createMinimalTest(overrides: Partial<TestEnvironmentConfig> = {}): Environment {
    return this.createTestEnvironment({
      security: { enabled: false, mock: false },
      cache: { enabled: false, mock: false },
      fileSystem: { type: 'memory' },
      modules: { enableRegistry: false, mockResolvers: false },
      ...overrides
    });
  }

  /**
   * Clean up test environment and restore original state
   */
  static async cleanupEnvironment(env: Environment): Promise<void> {
    const cleanup = (env as any).__testCleanup;
    if (cleanup) {
      // Restore environment variables
      for (const key of cleanup.environmentVariables) {
        if (cleanup.originalEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = cleanup.originalEnv[key];
        }
      }
    }

    // Clean up file system if it's a temporary directory
    const basePath = env.getBasePath?.();
    if (basePath?.startsWith('/tmp/mlld-e2e-')) {
      try {
        const fs = await import('fs/promises');
        await fs.rm(basePath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to clean up test directory ${basePath}:`, error);
      }
    }

    // Reset SecurityManager singleton if needed
    if (SecurityManager.resetInstance) {
      SecurityManager.resetInstance();
    }
  }

  private static createFileSystem(config: FileSystemConfig): IFileSystemService {
    if (config.type === 'real') {
      const fs = require('fs');
      const path = require('path');
      
      // Create directory if it doesn't exist
      if (config.basePath) {
        try {
          fs.mkdirSync(config.basePath, { recursive: true });
        } catch (error) {
          // Directory might already exist
        }
      }

      // For now, return MemoryFileSystem even for 'real' type
      // TODO: Implement proper real filesystem adapter for tests
      const memFs = new MemoryFileSystem();
      
      // Add initial files if specified
      if (config.initialFiles) {
        for (const [filePath, content] of Object.entries(config.initialFiles)) {
          memFs.writeFileSync(filePath, content);
        }
      }
      
      return memFs;
    } else {
      const memFs = new MemoryFileSystem();
      
      // Add initial files if specified
      if (config.initialFiles) {
        for (const [filePath, content] of Object.entries(config.initialFiles)) {
          memFs.writeFileSync(filePath, content);
        }
      }
      
      return memFs;
    }
  }
}