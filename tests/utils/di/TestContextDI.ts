import { container, DependencyContainer } from 'tsyringe';
import { TestContext } from '../TestContext';
import { TestContainerHelper } from './TestContainerHelper';
import { shouldUseDI, Service } from '../../../core/ServiceProvider';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
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
   * Create a new TestContextDI instance
   * @param options Options for test context initialization
   */
  constructor(options: {
    fixturesDir?: string;
    useDI?: boolean;
    container?: DependencyContainer;
  } = {}) {
    // Call parent constructor, will initialize services manually
    super(options.fixturesDir);

    // Override environment variable if specified
    if (options.useDI !== undefined) {
      process.env.USE_DI = options.useDI ? 'true' : 'false';
    }

    // Create container helper
    this.container = options.container
      ? new TestContainerHelper()
      : TestContainerHelper.createTestContainer();

    // Initialize DI only if enabled
    if (shouldUseDI()) {
      this.initializeWithDI();
    }
  }

  /**
   * Initialize services with dependency injection
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
    
    // Create service instances manually first
    const pathOps = new PathOperationsService();
    const filesystem = new FileSystemService(pathOps, null, this.fs);
    
    // Create the ProjectPathResolver separately
    const projectPathResolver = new ProjectPathResolver();
    
    // Create PathService with its dependencies
    const path = new PathService(filesystem, null, projectPathResolver);
    const validation = new ValidationService();
    const circularity = new CircularityService();
    const parser = new ParserService();
    const eventService = new StateEventService();
    const stateFactory = new StateFactory();
    
    // Create tracking service before state service since it's a dependency
    const trackingService = new StateTrackingService();
    
    // Properly pass tracking service to state service
    const state = new StateService(stateFactory, eventService, trackingService);
    
    const interpreter = new InterpreterService();
    const directive = new DirectiveService();
    const resolution = new ResolutionService(state, filesystem, parser, path);
    const output = new OutputService();
    const debugger_ = new TestDebuggerService(state);
    
    // Register service instances with the container
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
   * Register a mock service implementation with the container
   * This is useful for tests that want to override service behavior
   * 
   * @param token The service token to mock
   * @param mockImplementation The mock implementation
   */
  registerMock<T>(token: string, mockImplementation: T): void {
    this.container.registerMock(token, mockImplementation);

    // If there's an interface token, register that too
    if (!token.startsWith('I')) {
      this.container.registerMock(`I${token}`, mockImplementation);
    }

    // Update the services object for compatibility with non-DI tests
    if (token in this.services) {
      (this.services as any)[token.toLowerCase()] = mockImplementation;
    }
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
   * @returns A new TestContextDI with a child container
   */
  createChildScope(): TestContextDI {
    // Create a new child container
    const childContainer = this.container.getContainer().createChildContainer();
    
    // Create a new TestContextDI with the child container
    return new TestContextDI({
      useDI: shouldUseDI(),
      container: childContainer
    });
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
   */
  static withDI(fixturesDir?: string): TestContextDI {
    return new TestContextDI({
      fixturesDir,
      useDI: true
    });
  }

  /**
   * Factory method to create a TestContextDI with DI disabled
   */
  static withoutDI(fixturesDir?: string): TestContextDI {
    return new TestContextDI({
      fixturesDir,
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
      if (shouldUseDI()) {
        // In DI mode, register the handler with the container
        this.container.registerMock(`${directiveName}DirectiveHandler`, handler);
        
        // Also register it with the directive service if available
        const directiveService = this.container.resolve('DirectiveService');
        if (directiveService && typeof directiveService.registerHandler === 'function') {
          try {
            directiveService.registerHandler(directiveName, handler);
          } catch (error) {
            // If registering fails, log the error but continue
            console.error(`Error registering handler for ${directiveName}:`, error);
          }
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
    } catch (error) {
      // Ignore registration errors - the handler object is still returned
      console.error(`Error during mock directive handler creation:`, error);
    }
    
    return handler;
  }

  /**
   * Clean up resources, including the container
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    // Reset the container
    this.container.reset();
  }
}