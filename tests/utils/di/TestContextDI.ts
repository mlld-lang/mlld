import { container, DependencyContainer } from 'tsyringe';
import { TestContext } from '../TestContext';
import { TestContainerHelper } from './TestContainerHelper';
import { shouldUseDI, Service } from '../../../core/ServiceProvider';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { PathService } from '@services/fs/PathService/PathService';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { StateService } from '@services/state/StateService/StateService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { TestDebuggerService } from '../debug/TestDebuggerService';

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
    const filesystem = new FileSystemService(pathOps, this.fs);
    const path = new PathService();
    const validation = new ValidationService();
    const circularity = new CircularityService();
    const parser = new ParserService();
    const eventService = new StateEventService();
    const state = new StateService(eventService);
    const interpreter = new InterpreterService();
    const directive = new DirectiveService();
    const resolution = new ResolutionService(state, filesystem, parser, path);
    const output = new OutputService();
    const debugger_ = new TestDebuggerService(state);
    
    // Register service instances with the container
    this.container.registerMock('PathOperationsService', pathOps);
    this.container.registerMock('FileSystemService', filesystem);
    this.container.registerMock('PathService', path);
    this.container.registerMock('ValidationService', validation);
    this.container.registerMock('CircularityService', circularity);
    this.container.registerMock('ParserService', parser);
    this.container.registerMock('StateEventService', eventService);
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
    this.container.registerMock('IStateService', state);
    this.container.registerMock('IInterpreterService', interpreter);
    this.container.registerMock('IDirectiveService', directive);
    this.container.registerMock('IResolutionService', resolution);
    this.container.registerMock('IOutputService', output);
    this.container.registerMock('IStateDebuggerService', debugger_);
    
    // Initialize the services that need explicit initialization
    path.initialize(filesystem);
    path.enableTestMode();
    path.setProjectPath('/project');
    
    // Make FileSystemService use PathService for path resolution
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
   * Clean up resources, including the container
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    // Reset the container
    this.container.reset();
  }
}