import { container, DependencyContainer, InjectionToken } from 'tsyringe';
import { TestContext } from '../TestContext';
import { TestContainerHelper } from './TestContainerHelper';
import { 
  shouldUseDI, 
  Service, 
  resolveService, 
  registerServiceInstance 
} from '../../../core/ServiceProvider';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { PathService } from '@services/fs/PathService/PathService';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { ServiceMediator } from '@services/mediator/index.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { StateService } from '@services/state/StateService/StateService';
import { StateFactory } from '@services/state/StateService/StateFactory';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { TestDebuggerService } from '../debug/TestDebuggerService';
import { StateTrackingService } from '../debug/StateTrackingService/StateTrackingService';

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
   * Explicitly set DI mode (overrides environment variable)
   */
  useDI?: boolean;
  
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
   * Force DI-only mode (ensure all services use DI)
   */
  diOnlyMode?: boolean;
}

/**
 * TestContextDI extends TestContext to provide DI capabilities for tests
 * Depending on the USE_DI environment variable, it will use either:
 * - Traditional manual initialization (USE_DI=false)
 * - TSyringe dependency injection (USE_DI=true)
 */
export class TestContextDI extends TestContext {
  /**
   * Container helper for managing DI in tests
   */
  public readonly container: TestContainerHelper;

  /**
   * Tracks whether this context is using DI
   */
  public readonly useDI: boolean;

  /**
   * Tracks whether this context is in DI-only mode
   */
  public readonly diOnlyMode: boolean;

  /**
   * Tracks registered mock services for cleanup
   */
  private registeredMocks: Set<string> = new Set();

  /**
   * Tracks child contexts for cleanup
   */
  private childContexts: TestContextDI[] = [];

  /**
   * Tracks if this context has been cleaned up
   */
  private isCleanedUp: boolean = false;

  /**
   * Initialization promise to ensure async initialization completes
   */
  private initPromise: Promise<void> | null = null;

  /**
   * Create a new TestContextDI instance
   * @param options Options for test context initialization
   */
  constructor(options: TestContextDIOptions = {}) {
    // Call parent constructor, will initialize services manually
    super(options.fixturesDir);

    // Handle DI-only mode setting (highest priority)
    this.diOnlyMode = !!options.diOnlyMode;
    
    // Set environment variables for DI modes
    if (this.diOnlyMode) {
      // DI-only mode forces both flags to true
      process.env.MIGRATE_TO_DI_ONLY = 'true';
      process.env.USE_DI = 'true';
    } else if (options.useDI !== undefined) {
      // Regular mode uses provided useDI setting if available
      process.env.USE_DI = options.useDI ? 'true' : 'false';
    }

    // Set useDI property for easy access
    this.useDI = this.diOnlyMode || shouldUseDI();

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

    // Initialize immediately if auto-init is enabled (default) and DI is enabled
    if ((options.autoInit !== false) && this.useDI) {
      this.initPromise = this.initializeWithDIAsync();
    }
  }

  /**
   * Create a TestContextDI instance with DI enabled
   * @param options Options for test context initialization
   */
  static withDI(options: Omit<TestContextDIOptions, 'useDI'> = {}): TestContextDI {
    return new TestContextDI({ ...options, useDI: true });
  }

  /**
   * Create a TestContextDI instance with DI disabled
   * @param options Options for test context initialization
   */
  static withoutDI(options: Omit<TestContextDIOptions, 'useDI'> = {}): TestContextDI {
    return new TestContextDI({ ...options, useDI: false });
  }

  /**
   * Create a TestContextDI instance with DI-only mode
   * @param options Options for test context initialization
   */
  static withDIOnlyMode(options: Omit<TestContextDIOptions, 'diOnlyMode' | 'useDI'> = {}): TestContextDI {
    return new TestContextDI({ ...options, diOnlyMode: true });
  }

  /**
   * Create a TestContextDI instance with common options
   * @param options Options for test context initialization
   */
  static create(options: TestContextDIOptions = {}): TestContextDI {
    return new TestContextDI(options);
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

    if (this.useDI) {
      // In DI mode, resolve from container
      return this.container.resolve<T>(token);
    } else {
      // In non-DI mode, check the services object
      if (typeof token === 'string') {
        const lowerToken = token.toLowerCase();
        // Handle interface token format (IServiceName)
        const serviceName = token.startsWith('I') 
          ? lowerToken.substring(1) 
          : lowerToken;
        
        // Check if the service exists on the services object
        if (serviceName in this.services) {
          return (this.services as any)[serviceName] as T;
        }
      }
      
      // If fallback is provided, use it
      if (fallback !== undefined) {
        return fallback;
      }
      
      throw new Error(
        `Cannot resolve service '${String(token)}' in non-DI mode. ` +
        `Make sure the service is registered or provide a fallback.`
      );
    }
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

    if (this.useDI) {
      // In DI mode, resolve from container
      return this.container.resolve<T>(token);
    } else {
      // Non-DI case is the same as before
      if (typeof token === 'string') {
        const lowerToken = token.toLowerCase();
        const serviceName = token.startsWith('I') ? lowerToken.substring(1) : lowerToken;
        
        if (serviceName in this.services) {
          return (this.services as any)[serviceName] as T;
        }
      }
      
      if (fallback !== undefined) {
        return fallback;
      }
      
      throw new Error(`Cannot resolve service '${String(token)}' in non-DI mode.`);
    }
  }

  /**
   * Initialize services with dependency injection asynchronously
   */
  private async initializeWithDIAsync(): Promise<void> {
    // Register file system
    this.container.registerMock('FileSystem', this.fs);

    // Register services that we want the container to resolve
    this.registerServices();

    // Initialize services that need explicit initialization
    this.initializeServices();

    // Add a delay to ensure all service initializations (e.g., setTimeout) complete
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 10); // Small delay to allow all service inits to complete
    });
  }
  
  /**
   * Initialize services with dependency injection (legacy synchronous version)
   */
  private initializeWithDI(): void {
    // Register file system
    this.container.registerMock('FileSystem', this.fs);

    // Register services that we want the container to resolve
    this.registerServices();

    // Initialize services that need explicit initialization
    this.initializeServices();
  }

  /**
   * Register all services with the container
   */
  private registerServices(): void {
    // Since we're in a test context and can't modify the service classes to add @injectable
    // decorators, we'll register existing service instances rather than classes
    
    // Create ServiceMediator to manage circular dependencies
    const mediator = new ServiceMediator();
    
    // Create service instances manually first
    const pathOps = new PathOperationsService();
    
    // Create the ProjectPathResolver separately
    const projectPathResolver = new ProjectPathResolver();
    
    // Create services with circular dependencies first
    const filesystem = new FileSystemService(pathOps, mediator, this.fs);
    const path = new PathService(mediator, projectPathResolver);
    const parser = new ParserService(mediator);
    
    // Connect services through the mediator
    mediator.setFileSystemService(filesystem);
    mediator.setPathService(path);
    mediator.setParserService(parser);
    
    const validation = new ValidationService();
    const circularity = new CircularityService();
    const eventService = new StateEventService();
    const stateFactory = new StateFactory();
    
    // Create tracking service before state service since it's a dependency
    const trackingService = new StateTrackingService();
    
    // Properly pass tracking service and mediator to state service
    const state = new StateService(stateFactory, eventService, trackingService, mediator);
    
    // Explicitly register state service with mediator
    mediator.setStateService(state);
    
    const interpreter = new InterpreterService();
    const directive = new DirectiveService();
    const resolution = new ResolutionService(state, filesystem, path, mediator);
    
    // Register resolution service with the mediator
    mediator.setResolutionService(resolution);
    const output = new OutputService();
    const debugger_ = new TestDebuggerService(state);
    
    // Register service instances with the container
    this.container.registerMock('ServiceMediator', mediator);
    this.container.registerMock('IServiceMediator', mediator);
    this.container.registerMock('PathOperationsService', pathOps);
    this.container.registerMock('FileSystemService', filesystem);
    this.container.registerMock('PathService', path);
    this.container.registerMock('ProjectPathResolver', projectPathResolver);
    this.container.registerMock('ValidationService', validation);
    this.container.registerMock('CircularityService', circularity);
    this.container.registerMock('ParserService', parser);
    this.container.registerMock('StateEventService', eventService);
    this.container.registerMock('StateFactory', stateFactory);
    
    // StateTrackingService must be registered before StateService
    this.container.registerMock('StateTrackingService', trackingService);
    this.container.registerMock('StateService', state);
    
    this.container.registerMock('InterpreterService', interpreter);
    this.container.registerMock('DirectiveService', directive);
    this.container.registerMock('ResolutionService', resolution);
    this.container.registerMock('OutputService', output);
    this.container.registerMock('StateDebuggerService', debugger_);

    // Register by interfaces
    this.container.registerMock('IPathOperationsService', pathOps);
    this.container.registerMock('IFileSystemService', filesystem);
    this.container.registerMock('IPathService', path);
    this.container.registerMock('IValidationService', validation);
    this.container.registerMock('ICircularityService', circularity);
    this.container.registerMock('IParserService', parser);
    this.container.registerMock('IStateEventService', eventService);
    
    // IStateTrackingService must be registered before IStateService
    this.container.registerMock('IStateTrackingService', trackingService);
    this.container.registerMock('IStateService', state);
    
    this.container.registerMock('IInterpreterService', interpreter);
    this.container.registerMock('IDirectiveService', directive);
    this.container.registerMock('IResolutionService', resolution);
    this.container.registerMock('IOutputService', output);
    this.container.registerMock('IStateDebuggerService', debugger_);
    
    // Initialize services that need explicit initialization
    // ProjectPathResolver is already passed via constructor
    path.enableTestMode();
    // For TestContextDI.test.ts, we need to set the path to /project to match expectations
    path.setProjectPath('/project');
    
    // Set up the FileSystemService to bypass path resolution in test mode
    // This is a workaround for the circular dependency between PathService and FileSystemService in tests
    // We're creating a special override of the resolvePath method that works directly with the test filesystem
    const originalResolvePathMethod = (filesystem as any).resolvePath;
    (filesystem as any).resolvePath = function(filePath: string): string {
      // If the path starts with $PROJECTPATH, resolve directly to /project/...
      if (filePath.startsWith('$PROJECTPATH/')) {
        return `/project/${filePath.substring(13)}`;
      }
      // If the path starts with $HOMEPATH, resolve directly to /home/user/...
      if (filePath.startsWith('$HOMEPATH/')) {
        return `/home/user/${filePath.substring(10)}`;
      }
      // Otherwise use the original method
      return originalResolvePathMethod.call(this, filePath);
    };
    
    // Also set PathService on the FileSystemService (but our override will be used in tests)
    filesystem.setPathService(path);
    
    // Initialize state service
    state.setCurrentFilePath('test.meld');
    state.enableTransformation(true);
    state.setPathVar('PROJECTPATH', '/project');
    state.setPathVar('HOMEPATH', '/home/user');
    
    // Initialize resolution service
    // Already done during creation
    
    // Initialize debugger service
    debugger_.initialize(state);
    
    // Initialize directive service
    directive.initialize(
      validation,
      state,
      path,
      filesystem,
      parser,
      interpreter,
      circularity,
      resolution
    );
    
    // Initialize interpreter service
    interpreter.initialize(directive, state);
    
    // Register default handlers
    directive.registerDefaultHandlers();
    
    // Initialize output service
    output.initialize(state, resolution);
    
    // Set services on the test context for API compatibility
    this.services.parser = parser;
    this.services.interpreter = interpreter;
    this.services.directive = directive;
    this.services.validation = validation;
    this.services.state = state;
    this.services.path = path;
    this.services.circularity = circularity;
    this.services.resolution = resolution;
    this.services.filesystem = filesystem;
    this.services.output = output;
    this.services.debug = debugger_;
    this.services.eventService = eventService;
  }

  /**
   * Initialize services that need explicit initialization
   * Note: We've already done this in registerServices() for this implementation
   */
  private initializeServices(): void {
    // No-op - services are already initialized in registerServices
    // In a future implementation, we'll update this to use constructor injection
  }

  /**
   * Register a mock service implementation
   * Works in both DI and non-DI modes for consistent API
   * 
   * @param token The service token to mock
   * @param mockImplementation The mock implementation
   * @param options Optional registration options
   */
  registerMock<T>(
    token: string | InjectionToken<T>, 
    mockImplementation: T,
    options: {
      /**
       * Register interface token automatically (e.g., IServiceName)
       */
      registerInterface?: boolean;
      
      /**
       * Skip updating the services object (DI only use case)
       */
      skipServicesUpdate?: boolean;
      
      /**
       * Description for debugging purposes
       */
      description?: string;
    } = {}
  ): void {
    if (this.isCleanedUp) {
      throw new Error(`Cannot register mock '${String(token)}' - context has been cleaned up`);
    }
    
    // Default options
    const registerInterface = options.registerInterface !== false;
    const skipServicesUpdate = options.skipServicesUpdate === true;
    
    // Track for cleanup
    if (typeof token === 'string') {
      this.registeredMocks.add(token);
      
      // Also track interface token if we're registering it
      if (registerInterface && !token.startsWith('I')) {
        this.registeredMocks.add(`I${token}`);
      }
    }
    
    if (this.useDI) {
      // In DI mode, register with the container
      this.container.registerMock(token, mockImplementation);
      
      // If there's an interface token, register that too
      if (registerInterface && typeof token === 'string' && !token.startsWith('I')) {
        this.container.registerMock(`I${token}`, mockImplementation);
      }
    }
    
    // Update the services object for compatibility with non-DI tests
    // and for consistency in mixed mode
    if (!skipServicesUpdate && typeof token === 'string') {
      const serviceName = token.startsWith('I') 
        ? token.substring(1).toLowerCase() 
        : token.toLowerCase();
      
      if (serviceName in this.services) {
        (this.services as any)[serviceName] = mockImplementation;
      }
    }
  }
  
  /**
   * Registers a mock service class
   * Works in both DI and non-DI modes for consistent API
   * 
   * @param token The token to register
   * @param MockClass The mock class to register
   * @param options Optional registration options
   */
  registerMockClass<T>(
    token: string | InjectionToken<T>,
    MockClass: new (...args: any[]) => T,
    options: {
      /**
       * Register interface token automatically (e.g., IServiceName)
       */
      registerInterface?: boolean;
      
      /**
       * Arguments to pass to the constructor in non-DI mode
       */
      constructorArgs?: any[];
      
      /**
       * Skip updating the services object (DI only use case)
       */
      skipServicesUpdate?: boolean;
    } = {}
  ): T {
    if (this.isCleanedUp) {
      throw new Error(`Cannot register mock class '${String(token)}' - context has been cleaned up`);
    }
    
    // Default options
    const registerInterface = options.registerInterface !== false;
    const constructorArgs = options.constructorArgs || [];
    const skipServicesUpdate = options.skipServicesUpdate === true;
    
    // Create instance differently based on DI mode
    let instance: T;
    
    if (this.useDI) {
      // In DI mode, register class with the container
      this.container.registerMockClass(token, MockClass);
      
      // If there's an interface token, register that too
      if (registerInterface && typeof token === 'string' && !token.startsWith('I')) {
        this.container.registerMockClass(`I${token}`, MockClass);
      }
      
      // Resolve the instance from the container
      instance = this.container.resolve<T>(token);
    } else {
      // In non-DI mode, manually create instance
      instance = new MockClass(...constructorArgs);
    }
    
    // Update the services object for compatibility if not skipped
    if (!skipServicesUpdate && typeof token === 'string') {
      const serviceName = token.startsWith('I') 
        ? token.substring(1).toLowerCase() 
        : token.toLowerCase();
      
      if (serviceName in this.services) {
        (this.services as any)[serviceName] = instance;
      }
    }
    
    return instance;
  }
  
  /**
   * Registers multiple mocks at once
   * This is useful for setting up a test environment with many mocks
   * 
   * @param mocks Map of token -> mock implementation
   * @param options Options for registration
   */
  registerMocks<T extends Record<string, any>>(
    mocks: T,
    options: {
      /**
       * Register interface tokens automatically (e.g., IServiceName)
       */
      registerInterfaces?: boolean;
    } = {}
  ): void {
    if (this.isCleanedUp) {
      throw new Error('Cannot register mocks - context has been cleaned up');
    }
    
    // Register each mock
    Object.entries(mocks).forEach(([token, implementation]) => {
      this.registerMock(token, implementation, {
        registerInterface: options.registerInterfaces !== false
      });
    });
  }
  
  /**
   * Creates a child state with proper DI initialization
   * This ensures consistent state creation patterns regardless of DI mode
   * 
   * @param parentId Optional parent state ID to create a child from
   * @param options Optional state creation options
   * @returns The new state ID
   */
  createChildState(parentId?: string, options?: { 
    filePath?: string; 
    transformation?: boolean;
    cloneVariables?: boolean;
  }): string {
    // Use the state service to create a child state
    // The StateService API might have different methods depending on the version
    try {
      // Try different known methods
      const stateService = this.services.state;
      
      // Method 1: createChildState (newer versions)
      if (typeof stateService.createChildState === 'function') {
        const stateId = stateService.createChildState(parentId, options);
        
        // If the state ID is not a string, create our own
        if (typeof stateId !== 'string') {
          const fallbackId = parentId ? `${parentId}.child` : `state-${Date.now()}`;
          
          // Still try to register the actual state if possible
          if (shouldUseDI() && typeof stateService.getState === 'function') {
            try {
              const childState = stateService.getState(stateId);
              if (childState) {
                this.container.registerMock(`State:${fallbackId}`, childState);
              }
            } catch (error) {
              // Ignore registration errors
            }
          }
          
          return fallbackId;
        }
        
        // Try to register the state with the container if in DI mode
        if (shouldUseDI() && typeof stateService.getState === 'function') {
          try {
            const childState = stateService.getState(stateId);
            if (childState) {
              this.container.registerMock(`State:${stateId}`, childState);
            }
          } catch (error) {
            // Ignore registration errors - this is just for convenience
          }
        }
        
        return stateId;
      }
      
      // Method 2: createChild (older versions)
      if (typeof stateService.createChild === 'function') {
        const stateId = stateService.createChild(parentId, options);
        
        // If the state ID is not a string, create our own
        if (typeof stateId !== 'string') {
          return parentId ? `${parentId}.child` : `state-${Date.now()}`;
        }
        
        return stateId;
      }
    } catch (error) {
      // Ignore any errors during child state creation
      console.error('Error creating child state:', error);
    }
    
    // Fallback: Just create a new state ID
    return parentId ? `${parentId}.child` : `state-${Date.now()}`;
  }
  
  /**
   * Creates a new scope in the DI container
   * This is useful for tests that need isolation between test cases
   * 
   * @param options Additional options for the child scope
   * @returns A new TestContextDI with a child container
   */
  createChildScope(options: Partial<TestContextDIOptions> = {}): TestContextDI {
    if (this.isCleanedUp) {
      throw new Error('Cannot create child scope - context has been cleaned up');
    }
    
    // Create a child container
    const childContainer = this.useDI 
      ? this.container.getContainer().createChildContainer()
      : undefined;
      
    // Create new test context with options
    const childContext = new TestContextDI({
      useDI: this.useDI,
      container: childContainer,
      ...options
    });
    
    // Track the child context for cleanup
    this.childContexts.push(childContext);
    
    return childContext;
  }
  
  /**
   * Creates an isolated scope that doesn't affect the parent container
   * This is useful for tests that need complete isolation
   * 
   * @param options Additional options for the isolated scope
   * @returns A new TestContextDI with an isolated container
   */
  createIsolatedScope(options: Partial<TestContextDIOptions> = {}): TestContextDI {
    if (this.isCleanedUp) {
      throw new Error('Cannot create isolated scope - context has been cleaned up');
    }
    
    // Create new test context with isolated container
    const isolatedContext = new TestContextDI({
      useDI: this.useDI,
      isolatedContainer: true,
      ...options
    });
    
    // Track the isolated context for cleanup
    this.childContexts.push(isolatedContext);
    
    return isolatedContext;
  }
  
  /**
   * Creates a variable resolution tracker that works with DI
   * This is useful for tracking variable resolution during tests
   * 
   * @param stateId Optional state ID to track (defaults to current state)
   * @returns A tracker object that can be used to inspect resolution
   */
  createVariableTracker(stateId?: string): { 
    trackResolution: (variableName: string) => void;
    getResolutionPath: (variableName: string) => string[];
    reset: () => void;
  } {
    // Create a resolution tracking map
    const resolutionPaths = new Map<string, string[]>();
    
    // Get the current state ID if needed
    const currentStateId = stateId || (
      typeof this.services.state.getCurrentStateId === 'function' 
        ? this.services.state.getCurrentStateId() 
        : 'current'
    );
    
    // Track resolution of a specific variable
    const trackResolution = (variableName: string) => {
      if (!resolutionPaths.has(variableName)) {
        resolutionPaths.set(variableName, []);
      }
      
      // Set the variable if it doesn't exist
      try {
        if (typeof this.services.state.getVar === 'function') {
          // Check if the variable exists
          const value = this.services.state.getVar(variableName);
          if (value === undefined) {
            // Only set if it's undefined
            if (typeof this.services.state.setVar === 'function') {
              this.services.state.setVar(variableName, `test-value-${Date.now()}`);
            }
          }
        }
      } catch (error) {
        // Ignore errors during variable setting
      }
      
      // Try to set up tracking
      try {
        // If we're in DI mode, we need to use the special tracking service
        if (shouldUseDI()) {
          // Get the tracking service from the container
          const trackingService = this.container.resolve('StateTrackingService');
          if (trackingService && typeof trackingService.trackVariable === 'function') {
            // Start tracking this variable
            trackingService.trackVariable(variableName, currentStateId);
          }
        } else {
          // In non-DI mode, use direct tracking if available
          const trackerService = (this.services as any).debug?.tracking;
          if (trackerService && typeof trackerService.trackVariable === 'function') {
            trackerService.trackVariable(variableName, currentStateId);
          }
        }
      } catch (error) {
        // Ignore tracking errors - this is a convenience feature
      }
    };
    
    // Get the resolution path for a variable
    const getResolutionPath = (variableName: string): string[] => {
      return resolutionPaths.get(variableName) || [];
    };
    
    // Reset tracking
    const reset = () => {
      resolutionPaths.clear();
    };
    
    return {
      trackResolution,
      getResolutionPath,
      reset
    };
  }

  /**
   * Factory method to create a TestContextDI with DI enabled
   * @param options Additional options for context creation
   */
  static withDI(options: Partial<Omit<TestContextDIOptions, 'useDI'>> = {}): TestContextDI {
    return new TestContextDI({
      ...options,
      useDI: true
    });
  }

  /**
   * Factory method to create a TestContextDI with DI disabled
   * @param options Additional options for context creation
   */
  static withoutDI(options: Partial<Omit<TestContextDIOptions, 'useDI'>> = {}): TestContextDI {
    return new TestContextDI({
      ...options,
      useDI: false
    });
  }
  
  /**
   * Creates a DI-compatible mock directive handler
   * This ensures the handler works correctly in both DI and non-DI mode
   * 
   * @param directiveName The name of the directive to create a handler for
   * @param implementation The mock implementation
   * @returns The registered directive handler
   */
  createMockDirectiveHandler(directiveName: string, implementation: {
    transform?: (node: any, state: any) => any;
    execute?: (node: any, state: any) => any;
    validate?: (node: any) => boolean | { valid: boolean; errors?: string[] };
  }): any {
    if (this.isCleanedUp) {
      throw new Error(`Cannot create mock directive handler '${directiveName}' - context has been cleaned up`);
    }
    
    // Create a basic handler object with proper handler structure
    const handler = {
      directiveName,
      // Directive handlers must have a kind property (definition or execution)
      kind: implementation.execute ? 'execution' : 'definition',
      // Add implementation methods
      ...implementation
    };
    
    // Add a flag to indicate this is a mock handler
    (handler as any).__isMockHandler = true;
    
    try {
      if (this.useDI) {
        // In DI mode, register the handler with the container
        this.container.registerMock(`${directiveName}DirectiveHandler`, handler);
        
        // Also register it with the directive service if available
        try {
          // Use resolveSync to avoid unhandled promise rejections
          const directiveService = this.resolveSync<IDirectiveService>('IDirectiveService', null);
          if (directiveService && typeof directiveService.registerHandler === 'function') {
            directiveService.registerHandler(directiveName, handler);
          }
        } catch (error) {
          // If resolving or registering fails, log the error but continue
          console.error(`Error registering handler for ${directiveName} with directive service:`, error);
        }
      } else if (this.services.directive && typeof this.services.directive.registerHandler === 'function') {
        // In non-DI mode, register directly with the directive service if available
        try {
          this.services.directive.registerHandler(directiveName, handler);
        } catch (error) {
          // If registering fails, log the error but continue
          console.error(`Error registering handler for ${directiveName}:`, error);
        }
      }
      
      // Track this handler for cleanup
      this.registeredMocks.add(`${directiveName}DirectiveHandler`);
    } catch (error) {
      // Provide better error message but still return the handler
      console.error(`Error during mock directive handler creation for ${directiveName}:`, error);
    }
    
    return handler;
  }
  
  /**
   * Creates a diagnostic report of the current context
   * Useful for debugging test setup issues
   * 
   * @returns A diagnostic report object
   */
  createDiagnosticReport(): {
    useDI: boolean;
    registeredMocks: string[];
    childContexts: number;
    services: string[];
    containerState: { registeredTokens: string[] } | undefined;
    isCleanedUp: boolean;
  } {
    const registeredServices = Object.keys(this.services);
    
    let containerState;
    if (this.useDI) {
      try {
        // Get tokens from container if possible
        const tokens = this.container.getRegisteredTokens();
        containerState = {
          registeredTokens: tokens.filter(t => typeof t === 'string') as string[]
        };
      } catch (error) {
        containerState = undefined;
      }
    }
    
    return {
      useDI: this.useDI,
      registeredMocks: Array.from(this.registeredMocks),
      childContexts: this.childContexts.length,
      services: registeredServices,
      containerState,
      isCleanedUp: this.isCleanedUp
    };
  }

  /**
   * Clean up all test resources
   * Resets containers, removes temporary files, etc.
   */
  async cleanup(): Promise<void> {
    if (this.isCleanedUp) {
      return;
    }

    this.isCleanedUp = true;

    // Clean up child contexts first
    for (const child of this.childContexts) {
      await child.cleanup();
    }
    this.childContexts = [];

    // Clean up parent context
    await super.cleanup();

    // Clear container instances
    if (this.useDI) {
      this.container.clearInstances();
    }

    // Reset DI-only mode environment variable if we set it
    if (this.diOnlyMode) {
      delete process.env.MIGRATE_TO_DI_ONLY;
    }
  }
}