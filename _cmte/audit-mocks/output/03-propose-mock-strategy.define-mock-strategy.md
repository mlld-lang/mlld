# Improved Mocking Strategy for Meld Tests

After analyzing the current mocking practices in the Meld codebase, I'm proposing a comprehensive strategy to standardize and improve the way tests create, register, and use mocks. This strategy addresses the identified inconsistencies, type safety issues, and complexity in mock creation.

## 1. Core Principles

- **Type Safety**: All mocks should be properly typed to catch interface mismatches at compile time
- **Consistency**: Standardize mock creation and registration across all test files
- **Reusability**: Minimize duplication through shared mock factories and helpers
- **Simplicity**: Make common test patterns easy to implement with minimal boilerplate
- **Maintainability**: Ensure mocks can be easily updated when interfaces change

## 2. Strategy Components

### 2.1. Enhanced TestContextDI with Minimal Default Mocks

```typescript
// Enhanced TestContextDI.createTestHelpers
static createTestHelpers() {
  return {
    // Existing methods...
    
    /**
     * Creates a minimal test context with only essential infrastructure mocks
     */
    setupMinimal: () => {
      const context = TestContextDI.create();
      // Only register essential infrastructure (filesystem, etc.)
      return context;
    },
    
    /**
     * Creates a context with standardized mock service implementations
     */
    setupWithStandardMocks: (customMocks = {}) => {
      const context = TestContextDI.create();
      
      // Register standard mocks from MockFactory
      for (const [token, factory] of Object.entries(MockFactory.standardFactories)) {
        if (!(token in customMocks)) {
          context.registerMock(token, factory());
        }
      }
      
      // Register custom mocks that override standards
      for (const [token, mock] of Object.entries(customMocks)) {
        context.registerMock(token, mock);
      }
      
      return context;
    }
  };
}
```

### 2.2. Centralized Mock Factory

```typescript
// tests/utils/mocks/MockFactory.ts
export class MockFactory {
  /**
   * Map of standard mock factories for core services
   */
  static standardFactories: Record<string, () => any> = {
    'IStateService': () => MockFactory.createStateService(),
    'IResolutionService': () => MockFactory.createResolutionService(),
    'IFileSystemService': () => MockFactory.createFileSystemService(),
    'IPathService': () => MockFactory.createPathService(),
    'IDirectiveService': () => MockFactory.createDirectiveService(),
    'IInterpreterService': () => MockFactory.createInterpreterService(),
    'IParserService': () => MockFactory.createParserService(),
    // Add other core services
  };

  /**
   * Create a typed mock state service with standard implementations
   */
  static createStateService(overrides: Partial<IStateService> = {}): IStateService {
    // Create a comprehensive base mock with all methods
    const baseMock: IStateService = {
      // Text variables
      getTextVar: vi.fn(),
      setTextVar: vi.fn().mockResolvedValue({ name: 'mockText', value: 'value' }),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getLocalTextVars: vi.fn().mockReturnValue(new Map()),
      
      // Data variables
      getDataVar: vi.fn(),
      setDataVar: vi.fn().mockResolvedValue({ name: 'mockData', value: {} }),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getLocalDataVars: vi.fn().mockReturnValue(new Map()),
      
      // Path variables
      getPathVar: vi.fn(),
      setPathVar: vi.fn().mockResolvedValue({ name: 'mockPath', value: { path: '/test' } }),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      
      // Command variables
      getCommandVar: vi.fn(),
      setCommandVar: vi.fn().mockResolvedValue({ name: 'mockCmd', value: { command: 'test' } }),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      
      // General variable methods
      getVariable: vi.fn(),
      setVariable: vi.fn().mockImplementation(async (v) => v),
      hasVariable: vi.fn().mockReturnValue(false),
      removeVariable: vi.fn().mockResolvedValue(false),
      
      // Nodes and content
      getNodes: vi.fn().mockReturnValue([]),
      addNode: vi.fn(),
      appendContent: vi.fn(),
      getTransformedNodes: vi.fn().mockReturnValue([]),
      setTransformedNodes: vi.fn(),
      transformNode: vi.fn(),
      
      // State hierarchy
      createChildState: vi.fn().mockImplementation(function() { return this; }),
      mergeChildState: vi.fn(),
      clone: vi.fn().mockImplementation(function() { return this; }),
      getParentState: vi.fn(),
      
      // Transformation
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      setTransformationEnabled: vi.fn(),
      getTransformationOptions: vi.fn().mockReturnValue({}),
      setTransformationOptions: vi.fn(),
      hasTransformationSupport: vi.fn().mockReturnValue(true),
      shouldTransform: vi.fn().mockReturnValue(false),
      
      // Imports
      addImport: vi.fn(),
      removeImport: vi.fn(),
      hasImport: vi.fn().mockReturnValue(false),
      getImports: vi.fn().mockReturnValue(new Set()),
      
      // File path
      getCurrentFilePath: vi.fn().mockReturnValue('/mock/path.meld'),
      setCurrentFilePath: vi.fn(),
      
      // Events and tracking
      setEventService: vi.fn(),
      setTrackingService: vi.fn(),
      
      // State management
      getStateId: vi.fn().mockReturnValue('mock-state-id'),
      hasLocalChanges: vi.fn().mockReturnValue(false),
      getLocalChanges: vi.fn().mockReturnValue([]),
      setImmutable: vi.fn(),
      get isImmutable() { return false; },
      
      // Command output
      getCommand: vi.fn(),
      getCommandOutput: vi.fn(),
      
      // Internal state
      getInternalStateNode: vi.fn().mockReturnValue({})
    };
    
    // Apply any overrides
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock resolution service
   */
  static createResolutionService(overrides: Partial<IResolutionService> = {}): IResolutionService {
    const baseMock: IResolutionService = {
      resolveText: vi.fn().mockImplementation(async (text) => text),
      resolveData: vi.fn().mockResolvedValue({}),
      resolvePath: vi.fn().mockResolvedValue({ path: '/mock/path', type: 'file' }),
      resolveCommand: vi.fn().mockResolvedValue('command output'),
      resolveFile: vi.fn().mockResolvedValue('file content'),
      resolveContent: vi.fn().mockResolvedValue(''),
      resolveNodes: vi.fn().mockResolvedValue('resolved nodes'),
      resolveInContext: vi.fn().mockImplementation(async (value) => 
        typeof value === 'string' ? value : 'resolved value'),
      resolveFieldAccess: vi.fn().mockResolvedValue({ success: true, value: {} }),
      validateResolution: vi.fn().mockResolvedValue({ path: '/validated/path', type: 'file' }),
      extractSection: vi.fn().mockResolvedValue('section content'),
      detectCircularReferences: vi.fn(),
      convertToFormattedString: vi.fn().mockImplementation(async (value) => 
        typeof value === 'string' ? value : JSON.stringify(value)),
      enableResolutionTracking: vi.fn(),
      getResolutionTracker: vi.fn()
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock file system service
   */
  static createFileSystemService(overrides: Partial<IFileSystemService> = {}): IFileSystemService {
    const baseMock: IFileSystemService = {
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 0,
        mtime: new Date()
      }),
      isFile: vi.fn().mockResolvedValue(true),
      readDir: vi.fn().mockResolvedValue([]),
      ensureDir: vi.fn().mockResolvedValue(undefined),
      isDirectory: vi.fn().mockResolvedValue(false),
      watch: vi.fn().mockImplementation(function*() {}),
      getCwd: vi.fn().mockReturnValue('/mock/cwd'),
      dirname: vi.fn().mockImplementation(path => path.split('/').slice(0, -1).join('/')),
      executeCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      setFileSystem: vi.fn(),
      getFileSystem: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined)
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock path service
   */
  static createPathService(overrides: Partial<IPathService> = {}): IPathService {
    const baseMock: IPathService = {
      initialize: vi.fn(),
      enableTestMode: vi.fn(),
      disableTestMode: vi.fn(),
      isTestMode: vi.fn().mockReturnValue(true),
      setHomePath: vi.fn(),
      setProjectPath: vi.fn(),
      getHomePath: vi.fn().mockReturnValue('/mock/home'),
      getProjectPath: vi.fn().mockReturnValue('/mock/project'),
      resolveProjectPath: vi.fn().mockResolvedValue('/mock/project'),
      resolvePath: vi.fn().mockImplementation(path => typeof path === 'string' ? path : '/mock/resolved/path'),
      validatePath: vi.fn().mockResolvedValue({ path: '/mock/validated/path', type: 'file' }),
      joinPaths: vi.fn().mockImplementation((...paths) => paths.join('/')),
      dirname: vi.fn().mockImplementation(path => path.split('/').slice(0, -1).join('/')),
      basename: vi.fn().mockImplementation(path => path.split('/').pop() || ''),
      normalizePath: vi.fn().mockImplementation(path => path),
      isURL: vi.fn().mockImplementation(path => path.startsWith('http')),
      validateURL: vi.fn().mockResolvedValue('https://example.com'),
      fetchURL: vi.fn().mockResolvedValue({
        content: 'mock content',
        metadata: { statusCode: 200, contentType: 'text/plain' },
        fromCache: false,
        url: 'https://example.com'
      })
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock directive service
   */
  static createDirectiveService(overrides: Partial<IDirectiveService> = {}): IDirectiveService {
    const baseMock: IDirectiveService = {
      initialize: vi.fn(),
      updateInterpreterService: vi.fn(),
      handleDirective: vi.fn().mockResolvedValue({}),
      registerHandler: vi.fn(),
      hasHandler: vi.fn().mockReturnValue(true),
      validateDirective: vi.fn(),
      createChildContext: vi.fn(),
      processDirective: vi.fn().mockResolvedValue({}),
      processDirectives: vi.fn().mockResolvedValue({}),
      supportsDirective: vi.fn().mockReturnValue(true),
      getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data', 'path', 'define', 'run', 'embed', 'import'])
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock interpreter service
   */
  static createInterpreterService(overrides: Partial<IInterpreterService> = {}): IInterpreterService {
    const baseMock: IInterpreterService = {
      canHandleTransformations: vi.fn().mockReturnValue(true),
      initialize: vi.fn(),
      interpret: vi.fn().mockResolvedValue({}),
      interpretNode: vi.fn().mockResolvedValue({}),
      createChildContext: vi.fn().mockResolvedValue({})
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock parser service
   */
  static createParserService(overrides: Partial<IParserService> = {}): IParserService {
    const baseMock: IParserService = {
      parseString: vi.fn().mockResolvedValue([]),
      parseFile: vi.fn().mockResolvedValue([]),
      parse: vi.fn().mockResolvedValue([]),
      parseWithLocations: vi.fn().mockResolvedValue([])
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a mock for a client factory
   */
  static createClientFactory<T>(
    clientImpl: T, 
    factoryToken: string
  ): { factory: any, client: T } {
    const client = clientImpl;
    const factory = {
      createClient: vi.fn().mockReturnValue(client)
    };
    
    return { factory, client };
  }
  
  /**
   * Create a chain of mock state services for testing state transitions
   */
  static createStateChain(count: number): IStateService[] {
    const states: IStateService[] = [];
    
    for (let i = 0; i < count; i++) {
      states.push(MockFactory.createStateService({
        getStateId: vi.fn().mockReturnValue(`state-${i}`),
      }));
    }
    
    // Set up parent-child relationships
    for (let i = 0; i < count - 1; i++) {
      const parentState = states[i];
      const childState = states[i + 1];
      
      // Make createChildState return the next state
      vi.spyOn(parentState, 'createChildState').mockReturnValue(childState);
      
      // Make getParentState return the previous state
      vi.spyOn(childState, 'getParentState').mockReturnValue(parentState);
    }
    
    return states;
  }
}
```

### 2.3. Client Factory Test Helpers

```typescript
// tests/utils/mocks/ClientFactoryHelpers.ts
export class ClientFactoryHelpers {
  /**
   * Register a factory and its client for a service with circular dependencies
   */
  static registerClientFactory<T>(
    context: TestContextDI,
    factoryToken: string,
    clientImpl: T
  ): { factory: any, client: T } {
    const { factory, client } = MockFactory.createClientFactory(clientImpl, factoryToken);
    context.registerMock(factoryToken, factory);
    return { factory, client };
  }
  
  /**
   * Register all standard client factories for a test
   */
  static registerStandardClientFactories(context: TestContextDI): Record<string, any> {
    const factories: Record<string, any> = {};
    
    // Path service client
    const pathClient = {
      resolvePath: vi.fn().mockImplementation((path: string) => path),
      normalizePath: vi.fn().mockImplementation((path: string) => path)
    };
    factories.pathClient = ClientFactoryHelpers.registerClientFactory(
      context, 'PathServiceClientFactory', pathClient
    );
    
    // File system client
    const fsClient = {
      exists: vi.fn().mockResolvedValue(false),
      isDirectory: vi.fn().mockResolvedValue(false)
    };
    factories.fsClient = ClientFactoryHelpers.registerClientFactory(
      context, 'FileSystemServiceClientFactory', fsClient
    );
    
    // Variable reference resolver client
    const vrClient = {
      resolve: vi.fn().mockImplementation(async (text: string) => text),
      setResolutionTracker: vi.fn()
    };
    factories.vrClient = ClientFactoryHelpers.registerClientFactory(
      context, 'VariableReferenceResolverClientFactory', vrClient
    );
    
    // Directive service client
    const dsClient = {
      supportsDirective: vi.fn().mockReturnValue(true),
      getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data', 'path', 'define', 'run', 'embed', 'import'])
    };
    factories.dsClient = ClientFactoryHelpers.registerClientFactory(
      context, 'DirectiveServiceClientFactory', dsClient
    );
    
    // Resolution service client for directive
    const rsClient = {
      resolveText: vi.fn().mockImplementation(async (text: string) => text),
      resolveData: vi.fn().mockImplementation(async (ref: string) => ref),
      resolvePath: vi.fn().mockImplementation(async (path: string) => path),
      resolveContent: vi.fn().mockResolvedValue(''),
      resolveInContext: vi.fn().mockImplementation(async (value: any) => 
        typeof value === 'string' ? value : JSON.stringify(value))
    };
    factories.rsClient = ClientFactoryHelpers.registerClientFactory(
      context, 'ResolutionServiceClientForDirectiveFactory', rsClient
    );
    
    // State service client
    const ssClient = {
      getStateId: vi.fn().mockReturnValue('test-state-id'),
      getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld'),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    };
    factories.ssClient = ClientFactoryHelpers.registerClientFactory(
      context, 'StateServiceClientFactory', ssClient
    );
    
    // State tracking service client
    const stClient = {
      registerState: vi.fn(),
      addRelationship: vi.fn(),
      registerRelationship: vi.fn()
    };
    factories.stClient = ClientFactoryHelpers.registerClientFactory(
      context, 'StateTrackingServiceClientFactory', stClient
    );
    
    return factories;
  }
  
  /**
   * Verify a factory was used correctly
   */
  static verifyFactoryUsage(factory: any, expectedCalls: number = 1): void {
    expect(factory.createClient).toHaveBeenCalledTimes(expectedCalls);
  }
}
```

### 2.4. Test Fixtures for Common Scenarios

```typescript
// tests/utils/fixtures/DirectiveTestFixture.ts
export interface DirectiveTestOptions {
  stateOverrides?: Partial<IStateService>;
  resolutionOverrides?: Partial<IResolutionService>;
  directiveOverrides?: Partial<IDirectiveService>;
  validationOverrides?: Partial<IValidationService>;
  handler?: IDirectiveHandler;
}

export class DirectiveTestFixture {
  context: TestContextDI;
  stateService: IStateService;
  resolutionService: IResolutionService;
  directiveService: IDirectiveService;
  validationService: IValidationService;
  handler?: IDirectiveHandler;
  
  static async create(options: DirectiveTestOptions = {}): Promise<DirectiveTestFixture> {
    const fixture = new DirectiveTestFixture();
    fixture.context = TestContextDI.create();
    
    // Register client factories first (for circular dependencies)
    ClientFactoryHelpers.registerStandardClientFactories(fixture.context);
    
    // Register mock services with appropriate overrides
    fixture.context.registerMock(
      'IStateService', 
      MockFactory.createStateService(options.stateOverrides)
    );
    
    fixture.context.registerMock(
      'IResolutionService',
      MockFactory.createResolutionService(options.resolutionOverrides)
    );
    
    fixture.context.registerMock(
      'IValidationService',
      {
        validateDirective: vi.fn().mockReturnValue(true),
        registerValidator: vi.fn(),
        ...options.validationOverrides
      }
    );
    
    if (options.handler) {
      fixture.handler = options.handler;
      fixture.context.registerMock('directiveHandler', options.handler);
    }
    
    // Register directive service last (it depends on other services)
    fixture.context.registerMock(
      'IDirectiveService',
      MockFactory.createDirectiveService(options.directiveOverrides)
    );
    
    // Resolve services
    fixture.directiveService = await fixture.context.resolve('IDirectiveService');
    fixture.stateService = await fixture.context.resolve('IStateService');
    fixture.resolutionService = await fixture.context.resolve('IResolutionService');
    fixture.validationService = await fixture.context.resolve('IValidationService');
    
    return fixture;
  }
  
  async cleanup(): Promise<void> {
    await this.context.cleanup();
  }
  
  /**
   * Create a directive node for testing
   */
  createDirectiveNode(
    kind: string, 
    name: string, 
    value: any, 
    options: Partial<DirectiveNode> = {}
  ): DirectiveNode {
    return {
      type: 'Directive',
      kind,
      name,
      value,
      location: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 20, offset: 19 },
        source: 'test.meld'
      },
      ...options
    };
  }
  
  /**
   * Process a directive using the service
   */
  async processDirective(node: DirectiveNode): Promise<IStateService> {
    return this.directiveService.processDirective(node);
  }
  
  /**
   * Execute a directive handler directly
   */
  async executeHandler(
    node: DirectiveNode, 
    contextOverrides: Partial<DirectiveProcessingContext> = {}
  ): Promise<DirectiveResult | IStateService> {
    if (!this.handler) {
      throw new Error('No directive handler registered. Use options.handler when creating the fixture.');
    }
    
    const context: DirectiveProcessingContext = {
      state: this.stateService,
      resolution: {
        strict: true,
        filePath: '/test/file.meld',
      },
      node,
      ...contextOverrides
    };
    
    return this.handler.execute(context);
  }
}
```

### 2.5. Enhanced TestContextDI Usage Examples

```typescript
describe('TextDirectiveHandler', () => {
  let fixture: DirectiveTestFixture;
  let handler: TextDirectiveHandler;
  
  beforeEach(async () => {
    handler = new TextDirectiveHandler();
    fixture = await DirectiveTestFixture.create({ handler });
  });
  
  afterEach(async () => {
    await fixture.cleanup();
  });
  
  it('should set a text variable', async () => {
    // Create a directive node
    const node = fixture.createDirectiveNode('text', 'greeting', 'Hello, world!');
    
    // Execute the handler directly
    await fixture.executeHandler(node);
    
    // Verify the state service was called correctly
    expect(fixture.stateService.setTextVar).toHaveBeenCalledWith(
      'greeting', 
      'Hello, world!',
      expect.any(Object)
    );
  });
  
  it('should handle variable interpolation', async () => {
    // Create a directive node with interpolation
    const node = fixture.createDirectiveNode('text', 'greeting', 'Hello, {{name}}!');
    
    // Configure resolution service to handle interpolation
    vi.spyOn(fixture.resolutionService, 'resolveInContext')
      .mockResolvedValueOnce('Hello, User!');
    
    // Execute the handler
    await fixture.executeHandler(node);
    
    // Verify resolution was called
    expect(fixture.resolutionService.resolveInContext).toHaveBeenCalledWith(
      'Hello, {{name}}!',
      expect.objectContaining({ strict: true })
    );
    
    // Verify state was updated with resolved value
    expect(fixture.stateService.setTextVar).toHaveBeenCalledWith(
      'greeting', 
      'Hello, User!',
      expect.any(Object)
    );
  });
});
```

### 2.6. Testing Circular Dependencies

```typescript
describe('Circular Dependency Resolution', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.createIsolated();
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should resolve circular dependencies between FileSystemService and PathService', async () => {
    // Don't register mocks - use real implementations
    // This test verifies that the DI container correctly handles circular dependencies
    
    // Resolve services with circular dependencies
    const fileSystem = await context.resolve<IFileSystemService>('IFileSystemService');
    const pathService = await context.resolve<IPathService>('IPathService');
    
    // Verify both services were created
    expect(fileSystem).toBeDefined();
    expect(pathService).toBeDefined();
    
    // Spy on methods to verify they can be called without circular reference errors
    const existsSpy = vi.spyOn(fileSystem, 'exists').mockResolvedValue(true);
    const normalizeSpy = vi.spyOn(pathService, 'normalizePath').mockReturnValue('/normalized/path');
    
    // Test interaction between services
    const testPath = '/test/path';
    await fileSystem.exists(testPath);
    pathService.normalizePath(testPath);
    
    // Verify methods were called
    expect(existsSpy).toHaveBeenCalledWith(testPath);
    expect(normalizeSpy).toHaveBeenCalledWith(testPath);
  });
});
```

## 3. Implementation Plan

### Phase 1: Foundation
1. Create the `MockFactory` class with factories for core services
2. Enhance `TestContextDI` with the new helper methods
3. Create `ClientFactoryHelpers` for circular dependency testing

### Phase 2: Test Fixtures
1. Create the `DirectiveTestFixture` for directive testing
2. Develop additional fixtures for other common test scenarios

### Phase 3: Migration
1. Update one test file as a proof of concept
2. Create a migration guide for updating existing tests
3. Gradually migrate all test files to the new pattern

### Phase 4: Validation
1. Add specific tests for the DI container and circular dependencies
2. Verify that all previously skipped tests now pass
3. Run comprehensive test coverage analysis

## 4. Recommendations for Test Authors

1. **For Simple Tests**:
   ```typescript
   // Use the standard helpers
   const helpers = TestContextDI.createTestHelpers();
   const context = helpers.setupWithStandardMocks();
   
   // Resolve and customize the services you need
   const stateService = await context.resolve<IStateService>('IStateService');
   vi.spyOn(stateService, 'getTextVar').mockReturnValue({ name: 'test', value: 'custom' });
   ```

2. **For Tests Needing Specific Mock Behavior**:
   ```typescript
   // Create custom mocks with the factory
   const customState = MockFactory.createStateService({
     getTextVar: vi.fn().mockReturnValue({ name: 'greeting', value: 'Hello' }),
     hasVariable: vi.fn().mockReturnValue(true)
   });
   
   // Use setupWithStandardMocks with overrides
   const context = helpers.setupWithStandardMocks({
     'IStateService': customState
   });
   ```

3. **For Directive Tests**:
   ```typescript
   // Use the directive test fixture
   const fixture = await DirectiveTestFixture.create({
     handler: new TextDirectiveHandler(),
     stateOverrides: {
       // Custom state behavior
     }
   });
   
   // Create and test directives
   const node = fixture.createDirectiveNode('text', 'greeting', 'Hello');
   await fixture.executeHandler(node);
   ```

4. **For Testing Circular Dependencies**:
   ```typescript
   // Register client factories
   const context = TestContextDI.create();
   const factories = ClientFactoryHelpers.registerStandardClientFactories(context);
   
   // Test that factory was used
   const service = await context.resolve('ServiceWithCircularDeps');
   ClientFactoryHelpers.verifyFactoryUsage(factories.pathClient.factory);
   ```

By following this strategy, we can significantly improve the consistency, type safety, and maintainability of the test suite while reducing the amount of boilerplate code needed for common test scenarios.