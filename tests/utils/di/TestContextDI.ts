import { container, DependencyContainer, InjectionToken } from 'tsyringe';
import { TestContext } from '../TestContext';
import { TestContainerHelper } from './TestContainerHelper';
import { Service } from '@core/ServiceProvider';
import { vi } from 'vitest';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { PathService } from '@services/fs/PathService/PathService';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { ServiceMediator } from '@services/mediator/index';
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { StateService } from '@services/state/StateService/StateService';
import { StateFactory } from '@services/state/StateService/StateFactory';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { TestDebuggerService } from '../debug/TestDebuggerService';
import { StateTrackingService } from '../debug/StateTrackingService/StateTrackingService';
import { MeldImportError } from '@core/errors/MeldImportError';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { createPathValidationError } from '../errorFactories';
import { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient';
import { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient';
import { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient';
import { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective';

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
import type { IStateDebuggerService } from '../debug/StateDebuggerService/IStateDebuggerService';

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
    // Create a new filesystem for this test
    this.fs = new MemfsTestFileSystem();
    this.normalizePathForTests = (path) => path;
    
    // Register core services for testing
    await this.registerServices();
    
    // Mark as initialized
    this.initialized = true;
  }

  /**
   * Registers all the necessary services for the test context
   */
  private async registerServices(): Promise<void> {
    this.registerFileSystemService();
    this.registerPathService();
    this.registerStateEventService();
    this.registerStateService();
    this.registerParserService();
    this.registerResolutionService();
    this.registerValidationService();
    this.registerCircularityService();
    this.registerDirectiveService();
    this.registerInterpreterService();
    this.registerOutputService();
    this.registerDebugServices();
    this.registerFactories();
  }

  /**
   * Registers the FileSystemService mock
   */
  private registerFileSystemService(): void {
    const mockFsService = {
      readFile: vi.fn().mockImplementation(async (path: string) => {
        try {
          return await this.fs.readFile(path);
        } catch (error) {
          throw error;
        }
      }),
      writeFile: vi.fn().mockImplementation(async (path: string, content: string) => {
        try {
          return await this.fs.writeFile(path, content);
        } catch (error) {
          throw error;
        }
      }),
      mkdir: vi.fn().mockImplementation(async (path: string) => {
        try {
          return await this.fs.mkdir(path);
        } catch (error) {
          throw error;
        }
      }),
      exists: vi.fn().mockImplementation(async (path: string) => {
        try {
          return await this.fs.exists(path);
        } catch (error) {
          return false;
        }
      }),
      stat: vi.fn().mockImplementation(async (path: string) => {
        try {
          return await this.fs.stat(path);
        } catch (error) {
          throw error;
        }
      }),
      listFiles: vi.fn().mockImplementation(async (path: string) => {
        try {
          return await this.fs.listFiles(path);
        } catch (error) {
          throw error;
        }
      }),
      isDirectory: vi.fn().mockImplementation(async (path: string) => {
        try {
          const stats = await this.fs.stat(path);
          return stats.isDirectory();
        } catch (error) {
          return false;
        }
      }),
      isFile: vi.fn().mockImplementation(async (path: string) => {
        try {
          const stats = await this.fs.stat(path);
          return stats.isFile();
        } catch (error) {
          return false;
        }
      }),
      debug: vi.fn(),
      isTestEnabled: vi.fn().mockReturnValue(true),
      isTestMode: vi.fn().mockReturnValue(true)
    };
    
    this.container.registerMock('IFileSystemService', mockFsService);
  }

  /**
   * Registers the PathService mock
   */
  private registerPathService(): void {
    const mockPathService = {
      validatePath: vi.fn().mockImplementation(async (path: string) => {
        if (!path || path === '') {
          throw createPathValidationError('Empty path is not allowed', {
            code: 'EMPTY_PATH',
            path: ''
          });
        }
        
        if (path.includes('\0')) {
          throw createPathValidationError('Path contains null bytes', {
            code: 'NULL_BYTES',
            path
          });
        }
        
        return path;
      }),
      normalizePath: vi.fn().mockImplementation((path: string) => path),
      resolveRelativePath: vi.fn().mockImplementation((path: string, basePath?: string) => {
        if (path.startsWith('/')) return path;
        if (!basePath) return '/' + path;
        return basePath.replace(/\/[^/]*$/, '') + '/' + path;
      }),
      joinPaths: vi.fn().mockImplementation((...paths: string[]) => {
        return paths.join('/').replace(/\/+/g, '/');
      }),
      isAbsolutePath: vi.fn().mockImplementation((path: string) => {
        return path.startsWith('/');
      }),
      dirname: vi.fn().mockImplementation((path: string) => {
        return path.replace(/\/[^/]*$/, '') || '/';
      }),
      basename: vi.fn().mockImplementation((path: string) => {
        return path.split('/').pop() || '';
      }),
      extname: vi.fn().mockImplementation((path: string) => {
        const base = path.split('/').pop() || '';
        const match = base.match(/\.[^.]*$/);
        return match ? match[0] : '';
      }),
      isTestMode: vi.fn().mockReturnValue(true)
    };
    
    this.container.registerMock('IPathService', mockPathService);
  }

  /**
   * Registers the StateEventService mock
   */
  private registerStateEventService(): void {
    const mockStateEventService = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      publish: vi.fn()
    };
    
    this.container.registerMock('IStateEventService', mockStateEventService);
  }

  /**
   * Registers the StateService mock
   */
  private registerStateService(): void {
    const mockStateService = {
      getVariable: vi.fn(),
      setVariable: vi.fn(),
      hasVariable: vi.fn().mockReturnValue(false),
      getDataVariable: vi.fn(),
      setDataVariable: vi.fn(),
      hasDataVariable: vi.fn().mockReturnValue(false),
      getPathVariable: vi.fn(),
      setPathVariable: vi.fn(),
      hasPathVariable: vi.fn().mockReturnValue(false),
      getCommand: vi.fn(),
      setCommand: vi.fn(),
      hasCommand: vi.fn().mockReturnValue(false),
      getCommandRef: vi.fn(),
      getOriginalNode: vi.fn(),
      storeOriginalNode: vi.fn(),
      getTransformedNode: vi.fn(),
      storeTransformedNode: vi.fn(),
      hasTransformedNode: vi.fn().mockReturnValue(false),
      createChildState: vi.fn().mockImplementation(() => mockStateService),
      getImmutable: vi.fn().mockReturnValue(false),
      setImmutable: vi.fn(),
      getParentState: vi.fn().mockReturnValue(null),
      createTransformationState: vi.fn().mockImplementation(() => mockStateService),
      isTransformationState: vi.fn().mockReturnValue(false),
      getTransformationState: vi.fn().mockReturnValue(null),
      getGlobalState: vi.fn().mockImplementation(() => mockStateService),
      clone: vi.fn().mockImplementation(() => mockStateService),
      merge: vi.fn(),
      getEventService: vi.fn().mockReturnValue(null),
      getStateClass: vi.fn().mockReturnValue('StateService'),
      getStateID: vi.fn().mockReturnValue('test-state')
    };
    
    this.container.registerMock('IStateService', mockStateService);
  }

  /**
   * Registers the ParserService mock
   */
  private registerParserService(): void {
    const mockParserService = {
      parse: vi.fn().mockReturnValue([]),
      parseWithLocations: vi.fn().mockReturnValue([])
    };
    
    this.container.registerMock('IParserService', mockParserService);
  }

  /**
   * Registers the ResolutionService mock
   */
  private registerResolutionService(): void {
    const mockResolutionService = {
      resolveVariable: vi.fn(),
      resolvePathVariable: vi.fn(),
      resolveDataVariable: vi.fn(),
      resolvePrimitive: vi.fn().mockImplementation(value => value),
      resolveCommand: vi.fn(),
      resolveVariableInText: vi.fn().mockImplementation((text, state) => text),
      resolveAll: vi.fn().mockImplementation((value, state) => value)
    };
    
    this.container.registerMock('IResolutionService', mockResolutionService);
  }

  /**
   * Registers the ValidationService mock
   */
  private registerValidationService(): void {
    const mockValidationService = {
      validateDirective: vi.fn().mockReturnValue(true),
      registerValidator: vi.fn()
    };
    
    this.container.registerMock('IValidationService', mockValidationService);
  }

  /**
   * Registers the CircularityService mock
   */
  private registerCircularityService(): void {
    const mockCircularityService = {
      markFileVisited: vi.fn(),
      isFileVisited: vi.fn().mockReturnValue(false),
      clearVisitedFiles: vi.fn(),
      getVisitedFiles: vi.fn().mockReturnValue([])
    };
    
    this.container.registerMock('ICircularityService', mockCircularityService);
  }

  /**
   * Registers the DirectiveService mock
   */
  private registerDirectiveService(): void {
    const mockDirectiveService = {
      executeDirective: vi.fn().mockImplementation(async (node) => {
        return {
          success: true,
          node,
          replacement: null
        };
      }),
      registerHandler: vi.fn(),
      getHandler: vi.fn()
    };
    
    this.container.registerMock('IDirectiveService', mockDirectiveService);
  }

  /**
   * Registers the InterpreterService mock
   */
  private registerInterpreterService(): void {
    const mockInterpreterService = {
      interpret: vi.fn().mockReturnValue(''),
      interpretWithState: vi.fn().mockReturnValue({ content: '', state: null })
    };
    
    this.container.registerMock('IInterpreterService', mockInterpreterService);
  }

  /**
   * Registers the OutputService mock
   */
  private registerOutputService(): void {
    const mockOutputService = {
      generateOutput: vi.fn().mockReturnValue('')
    };
    
    this.container.registerMock('IOutputService', mockOutputService);
  }

  /**
   * Registers debug services for testing
   */
  private registerDebugServices(): void {
    // Register state tracking service for tests that need it
    const mockStateTrackingService = {
      trackState: vi.fn(),
      getStateHistory: vi.fn().mockReturnValue([]),
      clearHistory: vi.fn()
    };
    
    this.container.registerMock('IStateTrackingService', mockStateTrackingService);
    
    // Register state debugger service
    const mockStateDebuggerService = {
      debugState: vi.fn(),
      createSnapshot: vi.fn(),
      compareSnapshots: vi.fn().mockReturnValue([]),
      enable: vi.fn(),
      disable: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(false)
    };
    
    this.container.registerMock('IStateDebuggerService', mockStateDebuggerService);
  }

  /**
   * Registers factory classes for circular dependency resolution
   */
  private registerFactories(): void {
    // Register PathServiceClientFactory mock
    const mockPathServiceClientFactory = {
      createClient: vi.fn().mockImplementation(() => {
        const mockPathClient: IPathServiceClient = {
          resolvePath: vi.fn().mockImplementation((path: string) => path),
          normalizePath: vi.fn().mockImplementation((path: string) => path)
        };
        return mockPathClient;
      })
    };
    
    // Register FileSystemServiceClientFactory mock
    const mockFileSystemServiceClientFactory = {
      createClient: vi.fn().mockImplementation(() => {
        const mockFileSystemClient: IFileSystemServiceClient = {
          exists: vi.fn().mockImplementation(async (path: string) => {
            try {
              return await this.fs.exists(path);
            } catch (error) {
              return false;
            }
          }),
          isDirectory: vi.fn().mockImplementation(async (path: string) => {
            try {
              const stats = await this.fs.stat(path);
              return stats.isDirectory();
            } catch (error) {
              return false;
            }
          })
        };
        return mockFileSystemClient;
      })
    };
    
    // Register VariableReferenceResolverClientFactory mock
    const mockVariableReferenceResolverClientFactory = {
      createClient: vi.fn().mockImplementation(() => {
        const mockVariableReferenceResolverClient = {
          resolve: vi.fn().mockImplementation(async (text: string, context: any) => {
            // Simple mock implementation that returns the text unchanged
            return text;
          }),
          setResolutionTracker: vi.fn()
        };
        return mockVariableReferenceResolverClient;
      })
    };
    
    // Register DirectiveServiceClientFactory mock
    const mockDirectiveServiceClientFactory = {
      createClient: vi.fn().mockImplementation(() => {
        const mockDirectiveServiceClient = {
          supportsDirective: vi.fn().mockImplementation((kind: string) => {
            // Default to supporting all directives in tests
            return true;
          }),
          getSupportedDirectives: vi.fn().mockImplementation(() => {
            // Return common directive kinds
            return ['text', 'data', 'path', 'define', 'run', 'embed', 'import'];
          })
        };
        return mockDirectiveServiceClient;
      })
    };
    
    // Register ResolutionServiceClientForDirectiveFactory mock
    const mockResolutionServiceClientForDirectiveFactory = {
      createClient: vi.fn().mockImplementation(() => {
        const mockResolutionServiceClientForDirective = {
          resolveText: vi.fn().mockImplementation(async (text: string, context: any) => {
            // Simple mock implementation that returns the text unchanged
            return text;
          }),
          resolveData: vi.fn().mockImplementation(async (ref: string, context: any) => {
            // Simple mock implementation that returns the ref as a string
            return ref;
          }),
          resolvePath: vi.fn().mockImplementation(async (path: string, context: any) => {
            // Simple mock implementation that returns the path unchanged
            return path;
          }),
          resolveContent: vi.fn().mockImplementation(async (nodes: any[], context: any) => {
            // Simple mock implementation that returns empty string
            return '';
          }),
          resolveInContext: vi.fn().mockImplementation(async (value: string | any, context: any) => {
            // Simple mock implementation that returns the value as a string
            return typeof value === 'string' ? value : JSON.stringify(value);
          })
        };
        return mockResolutionServiceClientForDirective;
      })
    };
    
    // Register StateServiceClientFactory mock
    const mockStateServiceClientFactory = {
      createClient: vi.fn().mockImplementation(() => {
        const mockStateServiceClient = {
          getStateId: vi.fn().mockImplementation(() => 'test-state-id'),
          getCurrentFilePath: vi.fn().mockImplementation(() => '/test/file.meld'),
          getAllTextVars: vi.fn().mockImplementation(() => new Map()),
          getAllDataVars: vi.fn().mockImplementation(() => new Map()),
          getAllPathVars: vi.fn().mockImplementation(() => new Map()),
          getAllCommands: vi.fn().mockImplementation(() => new Map()),
          isTransformationEnabled: vi.fn().mockImplementation(() => false)
        };
        return mockStateServiceClient;
      })
    };
    
    // Register StateTrackingServiceClientFactory mock
    const mockStateTrackingServiceClientFactory = {
      createClient: vi.fn().mockImplementation(() => {
        const mockStateTrackingServiceClient = {
          registerState: vi.fn(),
          addRelationship: vi.fn(),
          registerRelationship: vi.fn()
        };
        return mockStateTrackingServiceClient;
      })
    };
    
    this.container.registerMock('PathServiceClientFactory', mockPathServiceClientFactory);
    this.container.registerMock('FileSystemServiceClientFactory', mockFileSystemServiceClientFactory);
    this.container.registerMock('VariableReferenceResolverClientFactory', mockVariableReferenceResolverClientFactory);
    this.container.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
    this.container.registerMock('ResolutionServiceClientForDirectiveFactory', mockResolutionServiceClientForDirectiveFactory);
    this.container.registerMock('StateServiceClientFactory', mockStateServiceClientFactory);
    this.container.registerMock('StateTrackingServiceClientFactory', mockStateTrackingServiceClientFactory);
  }
  
  /**
   * Create helper methods for common test patterns
   */
  static createTestHelpers() {
    return {
      /**
       * Sets up a TestContextDI instance for a test
       * @param options TestContextDI options
       */
      setup: (options: TestContextDIOptions = {}) => {
        return TestContextDI.create(options);
      },
      
      /**
       * Creates a context with common mock services
       * @param mockOverrides Object with mock overrides
       */
      setupWithMocks: (mockOverrides: Record<string, any> = {}) => {
        const context = TestContextDI.create();
        
        // Register default mocks for common services
        const defaultMocks: Record<string, any> = {
          'IStateService': {
            getVariable: vi.fn(),
            setVariable: vi.fn(),
            hasVariable: vi.fn().mockReturnValue(false),
            // Add other state methods as needed
          },
          'IFileSystemService': {
            readFile: vi.fn().mockResolvedValue(''),
            writeFile: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
            // Add other filesystem methods as needed
          },
          // Add other common services as needed
        };
        
        // Register all default mocks
        for (const [token, mock] of Object.entries(defaultMocks)) {
          // If an override is provided, use it instead
          const finalMock = mockOverrides[token] || mock;
          context.registerMock(token, finalMock);
        }
        
        // Register additional mocks from overrides
        for (const [token, mock] of Object.entries(mockOverrides)) {
          if (!(token in defaultMocks)) {
            context.registerMock(token, mock);
          }
        }
        
        return context;
      },
      
      /**
       * Creates a test context for directive handler testing
       * @param directiveHandler The directive handler to test
       * @param mockOverrides Mock overrides for services
       */
      setupDirectiveTest: <T>(
        directiveHandler: T,
        mockOverrides: Record<string, any> = {}
      ) => {
        const context = TestContextDI.create();
        
        // Register default mocks for directive testing
        const defaultMocks: Record<string, any> = {
          'IValidationService': {
            validateDirective: vi.fn().mockReturnValue(true)
          },
          'IStateService': {
            getVariable: vi.fn(),
            setVariable: vi.fn(),
            hasVariable: vi.fn().mockReturnValue(false),
            getDataVariable: vi.fn(),
            setDataVariable: vi.fn(),
            hasDataVariable: vi.fn().mockReturnValue(false),
            getPathVariable: vi.fn(),
            setPathVariable: vi.fn(),
            hasPathVariable: vi.fn().mockReturnValue(false),
            getCommand: vi.fn(),
            setCommand: vi.fn(),
            hasCommand: vi.fn().mockReturnValue(false),
            storeOriginalNode: vi.fn(),
            storeTransformedNode: vi.fn(),
            hasTransformedNode: vi.fn().mockReturnValue(false),
            createChildState: vi.fn().mockImplementation(function() { return this; }),
            getImmutable: vi.fn().mockReturnValue(false)
          },
          'IResolutionService': {
            resolveVariable: vi.fn(),
            resolvePathVariable: vi.fn(),
            resolveDataVariable: vi.fn(),
            resolvePrimitive: vi.fn().mockImplementation(value => value),
            resolveVariableInText: vi.fn().mockImplementation((text) => text),
            resolveAll: vi.fn().mockImplementation((value) => value)
          }
        };
        
        // Register handler if provided
        if (directiveHandler) {
          context.container.registerInstance('directiveHandler', directiveHandler);
        }
        
        // Register all default mocks
        for (const [token, mock] of Object.entries(defaultMocks)) {
          // If an override is provided, use it instead
          const finalMock = mockOverrides[token] || mock;
          context.registerMock(token, finalMock);
        }
        
        // Register additional mocks from overrides
        for (const [token, mock] of Object.entries(mockOverrides)) {
          if (!(token in defaultMocks)) {
            context.registerMock(token, mock);
          }
        }
        
        return {
          context,
          validationService: context.resolveSync<any>('IValidationService'),
          stateService: context.resolveSync<any>('IStateService'),
          resolutionService: context.resolveSync<any>('IResolutionService'),
          handler: directiveHandler || null
        };
      }
    };
  }
}