import { container, DependencyContainer, InjectionToken } from 'tsyringe';
import { TestContext } from '@tests/utils/TestContext.js';
import { TestContainerHelper } from '@tests/utils/di/TestContainerHelper.js';
import { Service } from '@core/ServiceProvider.js';
import { vi } from 'vitest';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { ServiceMediator } from '@services/mediator/index.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createPathValidationError } from '@tests/utils/errorFactories.js';
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
import { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective.js';

import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import type { IStateDebuggerService } from '@tests/utils/debug/StateDebuggerService/IStateDebuggerService.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import { ClientFactoryHelpers } from '@tests/utils/mocks/ClientFactoryHelpers.js';
import type { IStateServiceClient } from '@services/state/StateService/interfaces/IStateServiceClient.js';
import type { IStateTrackingServiceClient } from '@tests/utils/debug/StateTrackingService/interfaces/IStateTrackingServiceClient.js';

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
export class TestContextDI extends TestContext {
  /**
   * Container helper for managing DI in tests
   */
  public readonly container: TestContainerHelper;

  /**
   * Helper method for normalizing paths in tests
   */
  private normalizePathForTests: (path: string) => string;

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
   * Create a new TestContextDI instance
   * @param options Options for test context initialization
   */
  constructor(options: TestContextDIOptions = {}) {
    // Call parent constructor, will initialize services manually
    super(options.fixturesDir);

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
  static create(options: TestContextDIOptions = {}): TestContextDI {
    return new TestContextDI(options);
  }

  /**
   * Create a TestContextDI instance with an isolated container
   * @param options Options for test context initialization
   */
  static createIsolated(options: Omit<TestContextDIOptions, 'isolatedContainer'> = {}): TestContextDI {
    return new TestContextDI({ ...options, isolatedContainer: true });
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

    if (this.initPromise && !this.initialized) {
      console.warn('Warning: Synchronous resolve called before initialization is complete. This may cause race conditions.');
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
      initialized: this.initialized,
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
    
    // Reset initialization state
    this.initialized = false;
    
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
    
    // Clean up container instances
    this.container.clearInstances();
    
    // Clear registered mocks
    this.registeredMocks.clear();
    
    // Clear initialization promise
    this.initPromise = null;
  }

  /**
   * Initializes the test context with dependency injection
   */
  private async initializeAsync(): Promise<void> {
    this.fs = new MemfsTestFileSystem();
    this.normalizePathForTests = (path) => path;
    await this.registerServices();
    this.initialized = true;
  }

  /**
   * Registers all the necessary services for the test context using MockFactory defaults
   */
  private async registerServices(): Promise<void> {
    // === Change Order: Register Factories FIRST ===
    this.registerFactories(); 
    
    // Register standard mocks from MockFactory 
    for (const [token, factory] of Object.entries(MockFactory.standardFactories)) {
      if (!this.container.isRegistered(token)) {
        this.container.registerMock(token, factory()); 
      }
    }
    
    this.registerMock<MemfsTestFileSystem>('IFileSystem', this.fs);
    this.registerURLContentResolver();
    this.registerDebugServices();

    // Register REAL StateService last
    this.container.registerService(StateFactory, StateFactory);
    this.container.registerService('IStateService', StateService);
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
    // === Change: Register standard factories UNCONDITIONALLY for now ===
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
        context.registerMock<MemfsTestFileSystem>('IFileSystem', context.fs);
        if (!context.container.isRegistered('FileSystemServiceClientFactory')) {
          const fsClient: IFileSystemServiceClient = {
            exists: vi.fn().mockImplementation(async (path: string) => context.fs.exists(path)),
            isDirectory: vi.fn().mockImplementation(async (path: string) => {
              try { return (await context.fs.stat(path)).isDirectory(); } catch { return false; }
            })
          };
          ClientFactoryHelpers.registerClientFactory(context, 'FileSystemServiceClientFactory', fsClient);
        }
        if (!context.container.isRegistered('PathServiceClientFactory')) {
          const pathClient: IPathServiceClient = {
             resolvePath: vi.fn().mockImplementation((path: string) => path),
             normalizePath: vi.fn().mockImplementation((path: string) => path)
          };
           ClientFactoryHelpers.registerClientFactory(context, 'PathServiceClientFactory', pathClient);
        }
        context.initialized = true;
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