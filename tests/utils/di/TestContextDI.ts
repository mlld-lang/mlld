import { container, DependencyContainer, InjectionToken } from 'tsyringe';
import { TestContainerHelper } from '@tests/utils/di/TestContainerHelper';
import { Service } from '@core/ServiceProvider';
import { vi } from 'vitest';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem';
import { ProjectBuilder } from '@tests/utils/ProjectBuilder';
import { TestSnapshot } from '@tests/utils/TestSnapshot';
import * as testFactories from '@tests/utils/testFactories';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { PathService } from '@services/fs/PathService/PathService';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { StateService } from '@services/state/StateService/StateService';
import { StateFactory } from '@services/state/StateService/StateFactory';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';
import { MeldImportError } from '@core/errors/MeldImportError';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { createPathValidationError } from '@tests/utils/errorFactories';
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient';
import { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective';

import type { IOutputService } from '@services/pipeline/OutputService/IOutputService';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService';
import type { IStateDebuggerService } from '@tests/utils/debug/StateDebuggerService/IStateDebuggerService';
import { MockFactory } from '@tests/utils/mocks/MockFactory';
import { ClientFactoryHelpers } from '@tests/utils/mocks/ClientFactoryHelpers';
import type { IStateServiceClient } from '@services/state/StateService/interfaces/IStateServiceClient';
import type { RawPath } from '@core/types/paths';
import type { ILogger } from '@core/utils/logger';

/**
 * Options for creating a TestContextDI instance
 */
export interface TestContextDIOptions {
  /**
   * Directory to look for test fixtures
   */
  fixturesDir?: string;
  
  /**
   * Existing container to use (for child scopes)
   */
  container?: DependencyContainer;
  
  /**
   * Create isolated container (prevents modifications to global container)
   */
  isolatedContainer?: boolean;
  
  /**
   * Auto-initialize services (true by default)
   */
  autoInit?: boolean;
  
  /**
   * Enable container leak detection (false by default)
   */
  leakDetection?: boolean;
}

/**
 * TestContextDI extends TestContext to provide DI capabilities for tests
 * It uses TSyringe dependency injection for all tests
 */
export class TestContextDI {
  /**
   * Container helper for managing DI in tests
   */
  public readonly container: TestContainerHelper;

  /**
   * Filesystem instance specifically for this context
   */
  public fs!: MemfsTestFileSystem;

  /**
   * Helper method for normalizing paths in tests
   */
  private normalizePathForTests!: (path: string) => string;

  /**
   * Tracks registered mock services for cleanup
   */
  private registeredMocks: Map<string, any> = new Map();

  /**
   * Tracks child contexts for cleanup
   */
  private childContexts: TestContextDI[] = [];

  /**
   * Promise for initialization
   */
  private initPromise: Promise<void> | null = null;

  /**
   * Tracks if this context has been cleaned up
   */
  private isCleanedUp: boolean = false;

  /**
   * Leak detection enabled
   */
  private leakDetectionEnabled: boolean = false;

  /**
   * Added properties from TestContext
   */
  public builder!: ProjectBuilder;
  public fixtures!: { load(fixtureName: string): Promise<void> };
  public snapshot!: TestSnapshot;
  public factory!: typeof testFactories;
  private fixturesDir: string = 'tests/fixtures'; // Default value

  /**
   * Create a new TestContextDI instance
   * @param options Options for test context initialization
   */
  constructor(options: TestContextDIOptions = {}) {
    // Store fixturesDir
    this.fixturesDir = options.fixturesDir ?? 'tests/fixtures';

    // Set leak detection flag
    this.leakDetectionEnabled = options.leakDetection === true;

    // Create appropriate container helper
    if (options.container) {
      // Use existing container (for child scopes)
      this.container = new TestContainerHelper(options.container);
    } else if (options.isolatedContainer) {
      // Create an isolated container that won't affect the global one
      this.container = TestContainerHelper.createIsolatedContainer();
    } else {
      // Create a standard child container
      this.container = TestContainerHelper.createTestContainer();
    }

    // Initialize immediately if auto-init is enabled (default)
    if (options.autoInit !== false) {
      this.initPromise = this.initializeAsync();
    }
  }

  /**
   * Create a TestContextDI instance
   * @param options Options for test context initialization
   */
  static async create(options: TestContextDIOptions = {}): Promise<TestContextDI> {
    const context = new TestContextDI(options);
    if (context.initPromise) { // Ensure initPromise exists
      await context.initPromise; // Await initialization
    }
    return context;
  }

  /**
   * Create a TestContextDI instance with an isolated container
   * @param options Options for test context initialization
   */
  static async createIsolated(options: Omit<TestContextDIOptions, 'isolatedContainer'> = {}): Promise<TestContextDI> {
    const context = new TestContextDI({ ...options, isolatedContainer: true });
    if (context.initPromise) { // Ensure initPromise exists
      await context.initPromise; // Await initialization
    }
    return context;
  }

  /**
   * Create a child context with a new container that inherits from the parent
   * @param options Additional options for the child context
   */
  createChildContext(options: Omit<TestContextDIOptions, 'container'> = {}): TestContextDI {
    // Create a new context with a child container
    const childContext = new TestContextDI({
      ...options,
      container: this.container.getContainer().createChildContainer()
    });
    
    // Track the child context for cleanup
    this.childContexts.push(childContext);
    
    return childContext;
  }

  /**
   * Resolves a service by token
   * Works in both DI and non-DI modes for consistent API
   * 
   * @param token The token to resolve
   * @param fallback Optional fallback to use if service isn't found (non-DI mode)
   * @returns The resolved service
   */
  async resolve<T>(token: string | InjectionToken<T>, fallback?: T): Promise<T> {
    if (this.isCleanedUp) {
      throw new Error(`Cannot resolve service '${String(token)}' - context has been cleaned up`);
    }

    // Wait for initialization to complete
    if (this.initPromise) {
      await this.initPromise;
    }

    // Resolve from container
    return this.container.resolve<T>(token);
  }

  /**
   * Synchronous version of resolve for backward compatibility
   * Use async resolve method for new code if possible
   */
  resolveSync<T>(token: string | InjectionToken<T>, fallback?: T): T {
    if (this.isCleanedUp) {
      throw new Error(`Cannot resolve service '${String(token)}' - context has been cleaned up`);
    }

    // Resolve from container
    return this.container.resolve<T>(token);
  }

  /**
   * Registers a mock instance for a token in the container
   * @param token The token to register (string or class)
   * @param mockInstance The mock implementation
   */
  registerMock<T>(token: string | InjectionToken<T>, mockInstance: T): void {
    if (this.isCleanedUp) {
      throw new Error(`Cannot register mock for '${String(token)}' - context has been cleaned up`);
    }

    // Register the mock with the container
    this.container.registerMock(token, mockInstance);
    
    // Track the mock for cleanup
    this.registeredMocks.set(String(token), mockInstance);
  }

  /**
   * Registers multiple mocks at once
   * @param mocks Object mapping tokens to mock implementations
   */
  registerMocks(mocks: Record<string, any>): void {
    for (const [token, mockImpl] of Object.entries(mocks)) {
      this.registerMock(token, mockImpl);
    }
  }

  /**
   * Registers a mock service class
   * @param token The token to register
   * @param mockClass The mock class to register
   */
  registerMockClass<T>(token: string | InjectionToken<T>, mockClass: new (...args: any[]) => T): void {
    if (this.isCleanedUp) {
      throw new Error(`Cannot register mock class for '${String(token)}' - context has been cleaned up`);
    }

    this.container.registerMockClass(token, mockClass);
  }
  
  /**
   * Creates a diagnostic report about the context state
   */
  createDiagnosticReport(): Record<string, any> {
    const containerDiagnostics = this.container.getDiagnostics();
    
    return {
      cleanedUp: this.isCleanedUp,
      mockCount: this.registeredMocks.size,
      childContextCount: this.childContexts.length,
      container: containerDiagnostics,
      leakDetection: {
        enabled: this.leakDetectionEnabled,
        ...containerDiagnostics.leakInfo
      }
    };
  }

  /**
   * Resets the context state, cleaning up any resources
   */
  async reset(): Promise<void> {
    // Reset container state
    this.container.reset();
    
    // Clear registered mocks
    this.registeredMocks.clear();
    
    // Reinitialize
    await this.initializeAsync();
  }

  /**
   * Cleans up resources used by this context
   */
  async cleanup(): Promise<void> {
    if (this.isCleanedUp) {
      return;
    }
    
    // Mark as cleaned up to prevent further use
    this.isCleanedUp = true;
    
    // Check for memory leaks
    if (this.leakDetectionEnabled) {
      const leakInfo = this.container.detectLeaks();
      if (leakInfo.hasLeaks) {
        console.warn(`[TestContextDI] Container leak detected: ${leakInfo.count} tokens still have references`, {
          tokens: leakInfo.tokens
        });
      }
    }

    // Clean up child contexts first
    await Promise.all(this.childContexts.map(child => child.cleanup()));
    this.childContexts = [];
    
    // Clean up container instances and registrations
    this.container.dispose();
    
    // Added: Cleanup filesystem
    if (this.fs) { // Add check in case initialization failed
        this.fs.cleanup();
    }

    // Clear registered mocks
    this.registeredMocks.clear();
    
    // Clear initialization promise
    this.initPromise = null;
  }

  /**
   * Initializes the test context with dependency injection and merged TestContext setup
   */
  private async initializeAsync(): Promise<void> {
    // Initialize fs and normalizePathForTests (existing)
    this.fs = new MemfsTestFileSystem();
    this.normalizePathForTests = (path) => path;

    // Added: Initialize fs (from TestContext constructor)
    this.fs.initialize(); 

    // Added: Initialize merged properties (from TestContext constructor)
    this.builder = new ProjectBuilder(this.fs);
    this.snapshot = new TestSnapshot(this.fs);
    this.factory = testFactories;
    this.fixtures = {
      load: async (fixtureName: string): Promise<void> => {
        const fixturePath = path.join(process.cwd(), this.fixturesDir, `${fixtureName}.json`);
        const fixtureContent = await fsExtra.readFile(fixturePath, 'utf-8'); 
        const fixture = JSON.parse(fixtureContent);
        // Assuming loadFixture exists on MemfsTestFileSystem based on TestContext usage
        // If not, this might need adjustment based on MemfsTestFileSystem implementation
        await (this.fs as any).loadFixture(fixture); 
      }
    };

    // Added: Directory creation (from TestContext.initialize)
    await this.fs.mkdir('/project', { recursive: true }); 
    await this.fs.mkdir('/project/src', { recursive: true });
    await this.fs.mkdir('/project/nested', { recursive: true });
    await this.fs.mkdir('/project/shared', { recursive: true });

    // Existing DI service registration
    await this.registerServices();
  }

  /**
   * Registers all the necessary services for the test context using MockFactory defaults
   */
  private async registerServices(): Promise<void> {
    // Register IFileSystem FIRST (before factories)
    this.registerMock<MemfsTestFileSystem>('IFileSystem', this.fs);

    // Register Factories SECOND
    this.registerFactories();
    
    // Define core services to skip mocking
    const coreServicesToSkip = [
      'IStateService', 
      'IParserService', 
      'IInterpreterService', 
      'IOutputService'
    ];
    
    // Register standard mocks from MockFactory, EXCEPT for core services
    for (const [token, factory] of Object.entries(MockFactory.standardFactories)) {
      // Check if token should be skipped
      if (!this.container.isRegistered(token) && !coreServicesToSkip.includes(token)) { 
        this.container.registerMock(token, factory()); 
      }
    }
    
    this.registerURLContentResolver();
    this.registerDebugServices();

    // Register the container instance itself for StateService
    this.container.registerMock('DependencyContainer', this.container.getContainer());

    // Register REAL StateService (already present)
    this.container.registerService(StateFactory, StateFactory);
    this.container.registerService('IStateService', StateService);
    
    // Register REAL ParserService
    // Assuming ParserFactory is registered by registerFactories()
    this.container.registerService('IParserService', ParserService);
    
    // Register REAL InterpreterService
    // Assuming InterpreterFactory is registered by registerFactories()
    this.container.registerService('IInterpreterService', InterpreterService);
    
    // Register REAL OutputService
    // Assuming OutputFactory is registered by registerFactories()
    this.container.registerService('IOutputService', OutputService);
  }

  /**
   * Registers the URLContentResolver mock - Keep custom mock for now if needed
   */
  private registerURLContentResolver(): void {
    if (this.container.isRegistered('IURLContentResolver')) return;
    const mockURLContentResolver = {
      isURL: vi.fn().mockImplementation((path: string) => {
        if (!path) return false;
        try {
          const url = new URL(path);
          return !!url.protocol && !!url.host;
        } catch {
          return false;
        }
      }),
      validateURL: vi.fn().mockImplementation(async (url: string, _options?: any) => {
        try {
          new URL(url);
          return url;
        } catch (error) {
          throw new Error(`Invalid URL: ${url}`);
        }
      }),
      fetchURL: vi.fn().mockImplementation(async (url: string, _options?: any) => {
        return {
          content: `Mock content for ${url}`,
          metadata: { statusCode: 200, contentType: 'text/plain' },
          fromCache: false,
          url
        };
      })
    };
    this.registerMock('IURLContentResolver', mockURLContentResolver);
  }

  /**
   * Registers debug services for testing
   */
  private registerDebugServices(): void {
    if (!this.container.isRegistered('IStateTrackingService')) {
    const mockStateTrackingService = {
      trackState: vi.fn(),
      getStateHistory: vi.fn().mockReturnValue([]),
      clearHistory: vi.fn()
    };
      this.registerMock('IStateTrackingService', mockStateTrackingService);
    }
    if (!this.container.isRegistered('IStateDebuggerService')) {
    const mockStateDebuggerService = {
      debugState: vi.fn(),
      createSnapshot: vi.fn(),
      compareSnapshots: vi.fn().mockReturnValue([]),
      enable: vi.fn(),
      disable: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(false)
    };
      this.registerMock('IStateDebuggerService', mockStateDebuggerService);
    }
  }

  /**
   * Registers factory classes using ClientFactoryHelpers
   */
  private registerFactories(): void {
    // Register standard factories UNCONDITIONALLY for now
    ClientFactoryHelpers.registerStandardClientFactories(this);
    
    // Remove conditional logic for now
    /*
    const factoryTokens = [
        'PathServiceClientFactory', 
        // ... other tokens
    ];
    let needsRegister = false;
    for(const token of factoryTokens) {
        if (!this.container.isRegistered(token)) {
            needsRegister = true;
            break;
        }
    }
    if (needsRegister) {
        ClientFactoryHelpers.registerStandardClientFactories(this);
    }
    */

    if (!this.container.isRegistered('FileSystemServiceClientFactory')) {
      const fsClient = {
        exists: vi.fn(),
        isDirectory: vi.fn()
      } as unknown as IFileSystemServiceClient; // Cast via unknown
      ClientFactoryHelpers.registerClientFactory(this, 'FileSystemServiceClientFactory', fsClient);
    }
    if (!this.container.isRegistered('PathServiceClientFactory')) {
      const pathClient = {
         resolvePath: vi.fn(), 
         normalizePath: vi.fn()
      } as unknown as IPathServiceClient; // Cast via unknown
       ClientFactoryHelpers.registerClientFactory(this, 'PathServiceClientFactory', pathClient);
    }
  }

  /**
   * Provides access to test helper methods
   */
  static createTestHelpers() {
    return {
      /**
       * Creates a minimal test context with only essential infrastructure mocks (like IFileSystem using MemFS)
       * Does NOT register standard service mocks from MockFactory.
       */
      setupMinimal: (options: TestContextDIOptions = {}): TestContextDI => {
        const context = new TestContextDI({ ...options, autoInit: false });
        context.fs = new MemfsTestFileSystem();
        context.normalizePathForTests = (path) => path;
        context.registerMock<MemfsTestFileSystem>('IFileSystem', context.fs);
        if (!context.container.isRegistered('FileSystemServiceClientFactory')) {
          const fsClient = {
            exists: vi.fn(),
            isDirectory: vi.fn()
          } as unknown as IFileSystemServiceClient; // Cast via unknown
          ClientFactoryHelpers.registerClientFactory(context, 'FileSystemServiceClientFactory', fsClient);
        }
        if (!context.container.isRegistered('PathServiceClientFactory')) {
          const pathClient = {
             resolvePath: vi.fn(), 
             normalizePath: vi.fn()
          } as unknown as IPathServiceClient; // Cast via unknown
           ClientFactoryHelpers.registerClientFactory(context, 'PathServiceClientFactory', pathClient);
        }
        context.initPromise = Promise.resolve();
        return context;
      },
      
      /**
       * Creates a context with standardized mock service implementations from MockFactory.
       * Allows overriding specific mocks.
       */
      setupWithStandardMocks: (
        customMocks: Record<string, any> = {}, 
        options: TestContextDIOptions = {}
      ): TestContextDI => {
        const context = new TestContextDI({ ...options, autoInit: false });
        // Register custom mocks FIRST (including factory overrides)
        context.registerMocks(customMocks);
        // Run standard initialization AFTER overrides are registered
        context.initPromise = context.initializeAsync(); 
        return context;
      }
    };
  }
}