Based on my analysis of mock usage patterns across multiple test suites in the Meld codebase, I've prepared a comprehensive report on current practices and recommendations for improvement.

# Mock Usage Analysis in Meld Tests

## Current State Analysis

### Common Patterns

1. **TestContextDI Usage**
   - Most tests use `TestContextDI.create()` to create isolated test containers
   - Services are typically resolved with `context.resolveSync<T>('IServiceName')`
   - `await context.cleanup()` is properly called in `afterEach` blocks
   - Some tests use `TestContextDI.createIsolated()` for complete isolation

2. **Mock Creation Approaches**
   - **Manual Mocks**: Handcrafted objects with `vi.fn()` implementations
   - **Factory Mocks**: Functions returning client interface implementations
   - **Spy-Based Mocks**: Real objects with methods replaced via `vi.spyOn()`
   - **Helper Functions**: Some tests use helper functions to create typed mocks

3. **Mock Registration Methods**
   - `context.registerMock('IServiceName', mockImpl)` for interface mocks
   - `context.registerMockClass('ServiceName', MockClass)` for class mocks
   - Direct assignment to service properties for some circular dependencies

4. **Spy Usage**
   - `vi.fn()` for simple method mocks with implementation
   - `vi.spyOn()` for modifying methods on real objects
   - `vi.mocked()` occasionally used for type safety

### Inconsistencies

1. **Mock Creation Approaches**
   - Some tests create comprehensive mocks of entire interfaces
   - Others create minimal mocks with only required methods
   - Mix of manual mocks and TestContextDI-provided default mocks

2. **Circular Dependency Handling**
   - Some tests use the client factory pattern correctly
   - Others bypass it by directly assigning properties
   - Inconsistent testing of factory creation vs. direct assignment

3. **Type Safety Approaches**
   - Some tests use proper typing for mocks
   - Others rely on `as any` type assertions
   - Inconsistent use of `vi.mocked()` for type-safe spies

4. **Test Structure**
   - Varying levels of setup complexity
   - Some tests have helper functions, others have inline setup
   - Inconsistent patterns for state manipulation in tests

### Key Problem Areas

1. **Circular Dependency Mocking**
   - Complex setup required for services with circular dependencies
   - Client factory pattern adds complexity to tests
   - Inconsistent approach to testing circular dependency resolution

2. **Type Safety Issues**
   - Frequent use of `as any` type assertions
   - Complex interfaces lead to incomplete mock implementations
   - Type errors when accessing mock functions

3. **Manual Mock Complexity**
   - Extensive boilerplate for creating manual mocks
   - Large, complex mock objects that are difficult to maintain
   - Duplication of mock setup across test files

4. **Test Reliability**
   - Skipped tests due to complex mocking requirements
   - Brittle tests that break when implementation changes
   - Debug console.log statements left in tests

5. **State Management**
   - Complex state transition testing with multiple mock states
   - Manual tracking of state changes in tests
   - Inconsistent approach to state cloning and manipulation

### Skipped Tests (Mock-Related)

1. **InterpreterService**
   - `'should handle clone state with transformation enabled'`
   - `'should create child context with transformation options'`
   - `'should handle directive node with state tracking'`
   - `'should handle text node with transformation'`
   - `'should handle node transformation with multiple nodes'`
   - `'should handle transformation options'`

2. **DirectiveService**
   - `'should handle variable interpolation in text directive'`
   - `'should handle imports with circular reference detection'`
   - `'should handle embedded content with variable resolution'`
   - `'should execute command with variable interpolation'`

3. **ResolutionService**
   - Test for circular references detection (commented out)

## Recommendations

### 1. Standardize Mock Creation

Create a centralized mock factory system to standardize mock creation:

```typescript
// tests/utils/mocks/MockFactory.ts
export class MockFactory {
  /**
   * Create a mock state service with common methods
   */
  static createStateService(overrides: Partial<IStateService> = {}): IStateService {
    const defaultMock = {
      getTextVar: vi.fn(),
      setTextVar: vi.fn().mockResolvedValue({ name: 'test', value: 'value' }),
      getDataVar: vi.fn(),
      setDataVar: vi.fn().mockResolvedValue({ name: 'test', value: {} }),
      getPathVar: vi.fn(),
      setPathVar: vi.fn().mockResolvedValue({ name: 'test', value: { path: '/test' } }),
      getCommandVar: vi.fn(),
      setCommandVar: vi.fn().mockResolvedValue({ name: 'test', value: { command: 'test' } }),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      createChildState: vi.fn().mockImplementation(function() { return this; }),
      getImmutable: vi.fn().mockReturnValue(false),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      // Add other common methods
    };
    
    return { ...defaultMock, ...overrides };
  }
  
  /**
   * Create a mock resolution service
   */
  static createResolutionService(overrides: Partial<IResolutionService> = {}): IResolutionService {
    // Similar implementation
  }
  
  // Add factories for other commonly mocked services
}
```

### 2. Improve Client Factory Testing

Create helpers for testing with the client factory pattern:

```typescript
// tests/utils/di/FactoryTestHelpers.ts
export class FactoryTestHelpers {
  /**
   * Register a factory and its client for a service with circular dependencies
   */
  static registerClientFactory<T>(
    context: TestContextDI,
    factoryToken: string,
    clientImpl: T
  ): { factory: any, client: T } {
    const mockClient = clientImpl;
    const mockFactory = {
      createClient: vi.fn().mockReturnValue(mockClient)
    };
    
    context.registerMock(factoryToken, mockFactory);
    
    return { factory: mockFactory, client: mockClient };
  }
  
  /**
   * Verify a factory was used correctly
   */
  static verifyFactoryUsage(factory: any, expectedCalls: number = 1): void {
    expect(factory.createClient).toHaveBeenCalledTimes(expectedCalls);
  }
}
```

### 3. Create Standard Test Fixtures

Develop reusable test fixtures for common test scenarios:

```typescript
// tests/utils/fixtures/DirectiveTestFixture.ts
export class DirectiveTestFixture {
  context: TestContextDI;
  stateService: IStateService;
  resolutionService: IResolutionService;
  directiveService: IDirectiveService;
  // Other services
  
  static async create(options: DirectiveTestOptions = {}): Promise<DirectiveTestFixture> {
    const fixture = new DirectiveTestFixture();
    fixture.context = TestContextDI.create();
    
    // Register mock services with appropriate overrides
    fixture.context.registerMock('IStateService', 
      MockFactory.createStateService(options.stateOverrides));
    
    // Register other mocks
    
    // Initialize the context
    await fixture.context.initialize();
    
    // Resolve services
    fixture.directiveService = await fixture.context.resolve('IDirectiveService');
    fixture.stateService = await fixture.context.resolve('IStateService');
    fixture.resolutionService = await fixture.context.resolve('IResolutionService');
    
    return fixture;
  }
  
  async cleanup(): Promise<void> {
    await this.context.cleanup();
  }
  
  // Helper methods for common test operations
  createDirectiveNode(kind: string, name: string, value: any): DirectiveNode {
    // Implementation
  }
  
  async executeDirective(node: DirectiveNode): Promise<DirectiveResult> {
    // Implementation
  }
}
```

### 4. Adopt Type-Safe Mocking

Replace `as any` assertions with proper typing:

```typescript
// Before
const mockState = {
  getTextVar: vi.fn(),
  setTextVar: vi.fn(),
} as any as IStateService;

// After
const mockState: Partial<IStateService> = {
  getTextVar: vi.fn(),
  setTextVar: vi.fn(),
};
context.registerMock<IStateService>('IStateService', mockState as IStateService);
```

### 5. Simplify State Management Testing

Create helpers for state transition testing:

```typescript
// tests/utils/StateTestHelpers.ts
export class StateTestHelpers {
  /**
   * Create a chain of states for testing state transitions
   */
  static createStateChain(count: number): IStateService[] {
    const states: IStateService[] = [];
    
    for (let i = 0; i < count; i++) {
      states.push(MockFactory.createStateService({
        // Custom properties for this state
        getStateId: vi.fn().mockReturnValue(`state-${i}`),
        // Make each state return the next one when createChildState is called
        createChildState: vi.fn().mockReturnValue(
          i < count - 1 ? states[i + 1] : states[i]
        )
      }));
    }
    
    return states;
  }
  
  /**
   * Verify a state transition occurred correctly
   */
  static verifyStateTransition(
    fromState: IStateService,
    toState: IStateService,
    expectedCalls: any[] = []
  ): void {
    expect(fromState.createChildState).toHaveBeenCalled();
    // Verify expected method calls on both states
    // Implementation
  }
}
```

### 6. Improve TestContextDI Usage

Extend TestContextDI with helpers for common test patterns:

```typescript
// Add to TestContextDI class
/**
 * Set up a service with mocked dependencies
 */
async setupServiceWithMocks<T>(
  serviceToken: string,
  mocks: Record<string, any>
): Promise<T> {
  // Register all mocks
  for (const [token, mock] of Object.entries(mocks)) {
    this.registerMock(token, mock);
  }
  
  // Initialize and resolve the service
  await this.initialize();
  return await this.resolve<T>(serviceToken);
}

/**
 * Create a testing context for a directive handler
 */
static async createDirectiveContext(
  handlerKind: string,
  mocks: Record<string, any> = {}
): Promise<{
  context: TestContextDI;
  handler: IDirectiveHandler;
  state: IStateService;
  resolution: IResolutionService;
}> {
  // Implementation
}
```

### 7. Implement Comprehensive DI Testing

Create tests that specifically verify DI behavior:

```typescript
describe('DI Integration', () => {
  it('should resolve circular dependencies correctly', async () => {
    const context = TestContextDI.create();
    
    // Don't register mocks - use real implementations
    await context.initialize();
    
    // Resolve services with circular dependencies
    const fileSystem = await context.resolve<IFileSystemService>('IFileSystemService');
    const pathService = await context.resolve<IPathService>('IPathService');
    
    // Verify they can interact without circular reference errors
    const testPath = '/test/path';
    await fileSystem.exists(testPath);
    expect(pathService.normalizePath(testPath)).toBeDefined();
    
    await context.cleanup();
  });
});
```

## Implementation Plan

1. **Short-term Improvements**
   - Create basic MockFactory with templates for common services
   - Add helper methods to TestContextDI for easier mock registration
   - Fix skipped tests using improved mocking patterns
   - Remove `as any` type assertions where possible

2. **Medium-term Refactoring**
   - Develop comprehensive test fixtures for different test scenarios
   - Standardize mock creation across all test files
   - Create dedicated tests for DI container and circular dependency resolution
   - Implement FactoryTestHelpers for client factory pattern testing

3. **Long-term Architecture**
   - Consider simplifying the DI architecture to reduce mock complexity
   - Evaluate alternative approaches to circular dependency management
   - Create comprehensive documentation on testing with DI
   - Implement automated linting for test quality and consistency

By implementing these recommendations, we can improve test consistency, reduce boilerplate, and make tests more maintainable while properly testing the DI architecture.