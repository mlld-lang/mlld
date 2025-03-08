# Strategic Plan for Circular Dependencies and Timeout Issues

This document outlines a comprehensive approach to addressing the circular dependencies and test timeout issues that are currently blocking the TSyringe migration.

## The Core Problems

1. **Circular Dependencies** - Several key services depend on each other in circular ways that TSyringe cannot resolve automatically:
   - FileSystemService ↔ PathService
   - ParserService ↔ ResolutionService
   - InterpreterService ↔ multiple directive handler dependencies
   
2. **Test Infrastructure** - Tests are not properly set up for DI-only mode:
   - Don't handle circular dependencies well
   - Don't properly initialize services in the right order
   - Don't release references after test completion
   
3. **Memory Management** - Memory leaks in the test suite:
   - DI container instances aren't properly cleaned up between tests
   - Circular references prevent garbage collection
   - Dynamic imports create persistent references
   
4. **Timeout Issues** - Complex tests with transformation features:
   - Embed directive transformation tests consistently time out
   - Nested array access tests show memory errors
   - Parser and resolution service integration tests hang

## Strategic Approach

Rather than continuing to fix issues one file at a time, we'll implement a more systematic approach:

### 1. Service Mediator Pattern Implementation

We'll introduce a dedicated mediator service to break circular dependencies:

```typescript
@singleton()
export class ServiceMediator {
  private parserService?: IParserService;
  private resolutionService?: IResolutionService;
  private fileSystemService?: IFileSystemService;
  private pathService?: IPathService;

  // Setters for each service
  setParserService(service: IParserService): void {
    this.parserService = service;
  }
  
  setResolutionService(service: IResolutionService): void {
    this.resolutionService = service;
  }
  
  setFileSystemService(service: IFileSystemService): void {
    this.fileSystemService = service;
  }
  
  setPathService(service: IPathService): void {
    this.pathService = service;
  }

  // Mediated methods for parser ↔ resolution interaction
  async resolveVariableForParser(variable: string, context: any): Promise<string> {
    if (!this.resolutionService) {
      throw new Error('ResolutionService not initialized in mediator');
    }
    return this.resolutionService.resolveInContext(variable, context);
  }

  async parseForResolution(content: string): Promise<any[]> {
    if (!this.parserService) {
      throw new Error('ParserService not initialized in mediator');
    }
    return this.parserService.parse(content);
  }
  
  // Mediated methods for filesystem ↔ path interactions
  resolvePath(path: string): string {
    if (!this.pathService) {
      throw new Error('PathService not initialized in mediator');
    }
    return this.pathService.resolvePath(path);
  }
  
  async isDirectory(path: string): Promise<boolean> {
    if (!this.fileSystemService) {
      throw new Error('FileSystemService not initialized in mediator');
    }
    return this.fileSystemService.isDirectory(path);
  }
}
```

### 2. Enhanced DI Container Configuration

We'll rewrite the core DI configuration to use the mediator pattern:

```typescript
// Register the mediator first
const serviceMediator = new ServiceMediator();
container.registerInstance('ServiceMediator', serviceMediator);

// Create services in dependency order
const fileSystemService = new FileSystemService(/* minimal deps */);
const pathService = new PathService(/* minimal deps */);
const parserService = new ParserService();
const resolutionService = new ResolutionService(/* minimal deps */);

// Register services in the container
container.registerInstance('FileSystemService', fileSystemService);
container.registerInstance('IFileSystemService', fileSystemService);
container.registerInstance('PathService', pathService);
container.registerInstance('IPathService', pathService);
container.registerInstance('ParserService', parserService);
container.registerInstance('IParserService', parserService);
container.registerInstance('ResolutionService', resolutionService);
container.registerInstance('IResolutionService', resolutionService);

// Connect services through the mediator
serviceMediator.setFileSystemService(fileSystemService);
serviceMediator.setPathService(pathService);
serviceMediator.setParserService(parserService);
serviceMediator.setResolutionService(resolutionService);

// Update services to use the mediator
fileSystemService.setMediator(serviceMediator);
pathService.setMediator(serviceMediator);
parserService.setMediator(serviceMediator);
resolutionService.setMediator(serviceMediator);
```

### 3. Improved Test Framework

We'll enhance the test framework to better handle circular dependencies:

```typescript
// In tests/setup.ts
beforeEach(() => {
  // Clear container at the start of each test
  container.clearInstances();
  
  // Set test timeout to a reasonable value (adjust per test type)
  vi.setConfig({ testTimeout: 10000 });
});

afterEach(async () => {
  // Clear all container instances
  container.clearInstances();
  
  // Break circular references
  if (globalThis.testContext) {
    // Explicitly nullify service references
    Object.keys(globalThis.testContext.services).forEach(key => {
      globalThis.testContext.services[key] = null;
    });
    
    // Clean up context
    await globalThis.testContext.cleanup();
  }
  
  // Small delay to allow async cleanup
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
  }
});
```

### 4. Test-Specific Timeouts

For long-running transformation tests:

```typescript
// In specific test files
describe('Transformation Tests', () => {
  // Set longer timeout for these tests
  vi.setConfig({ testTimeout: 30000 });
  
  // Use test-specific setup
  beforeEach(() => {
    // Create simplified mock services instead of full implementations
    const mockParser = createLightweightParserMock();
    const mockResolver = createLightweightResolverMock();
    
    // Register in container
    container.registerInstance('IParserService', mockParser);
    container.registerInstance('IResolutionService', mockResolver);
  });
  
  // Test cases...
});
```

## Implementation Timeline

### Week 1: Core Infrastructure

1. **Day 1-2: ServiceMediator Implementation**
   - Create ServiceMediator class
   - Update core services to use the mediator
   - Refactor di-config.ts

2. **Day 3-4: DI Container Configuration**
   - Rewrite DI configuration to use the mediator
   - Test basic service resolution
   - Verify foundation services work

3. **Day 5: Documentation Update**
   - Document the mediator pattern
   - Update reference documentation
   - Create examples for service authors

### Week 2: Test Framework Enhancement

1. **Day 1-2: TestDIContext Improvement**
   - Add better cleanup methods
   - Implement reference nullification
   - Add automatic container clearing

2. **Day 3-4: Memory Management**
   - Fix garbage collection in tests
   - Add timeout management
   - Create lightweight service mocks

3. **Day 5: Verification**
   - Test the new framework with basic tests
   - Measure memory usage improvements
   - Document the test pattern

### Week 3: Transformation Tests

1. **Day 1-2: Embed Directive Tests**
   - Create specialized test helpers for embed transformation
   - Implement lightweight transformation mocks
   - Fix timeout issues in embed-transformation-e2e.test.ts

2. **Day 3-4: Array Access Tests**
   - Fix nested array access tests
   - Create test-specific container configuration
   - Add proper cleanup for complex objects

3. **Day 5: Integration Tests**
   - Fix pipeline integration tests
   - Clean up any remaining circular dependencies
   - Document the patterns

## Code Examples

### 1. Service Updates

```typescript
// Updated ParserService.ts
@injectable()
export class ParserService implements IParserService {
  private mediator?: ServiceMediator;

  constructor(@inject('ServiceMediator') mediator?: ServiceMediator) {
    this.mediator = mediator;
  }
  
  setMediator(mediator: ServiceMediator): void {
    this.mediator = mediator;
  }
  
  async transformVariableNode(node: MeldNode, state: IStateService): Promise<MeldNode> {
    // Only transform if transformation mode is enabled
    if (!state.isTransformationEnabled()) {
      return node;
    }

    // Use the mediator instead of direct dependency
    if (!this.mediator) {
      logger.warn('No mediator available for variable transformation');
      return node;
    }

    // Create a simple resolution context
    const context: ResolutionContext = {
      state,
      currentFilePath: '/',
      strict: false,
      allowedVariableTypes: { text: true, data: true, path: true, command: false }
    };

    try {
      // Handle different node types using the mediator
      switch (node.type) {
        case 'TextVar':
        case 'DataVar': {
          // Extract variable name (simplified approach)
          let variableName = extractVariableName(node);
          
          if (!variableName) {
            return node;
          }
          
          // Resolve the variable through the mediator
          const resolved = await this.mediator.resolveVariableForParser(variableName, context);
          
          // Create a new Text node with the resolved value
          return createTextNode(resolved, node.location);
        }
        default:
          return node;
      }
    } catch (error) {
      logger.error('Error transforming variable node:', { error });
      return node;
    }
  }
}
```

### 2. Test Implementation

```typescript
// Example test using the improved pattern
describe('Embed Directive Transformation', () => {
  let context: TestContextDI;
  let mockFileSystem: IFileSystemService;
  let testMediator: ServiceMediator;
  
  beforeEach(() => {
    // Extended timeout for transformation tests
    vi.setConfig({ testTimeout: 30000 });
    
    // Use DI-only mode
    context = TestContextDI.withDIOnlyMode();
    
    // Set up the test filesystem with necessary files
    mockFileSystem = createMockFileSystem();
    
    // Create a test-specific mediator
    testMediator = new ServiceMediator();
    
    // Register everything in the container
    context.registerMock('IFileSystemService', mockFileSystem);
    context.registerMock('ServiceMediator', testMediator);
    
    // Connect the services through the mediator
    testMediator.setFileSystemService(mockFileSystem);
    
    // Add the test files needed for embed transformation
    mockFileSystem.writeFileSync('$PROJECTPATH/embed-source.md', '# Test Section\nThis is test content.');
  });
  
  afterEach(async () => {
    // Clear references explicitly to break circular dependencies
    mockFileSystem = null;
    testMediator = null;
    
    // Container cleanup
    if (context.container) {
      context.container.clearInstances();
    }
    
    // Regular cleanup
    await context.cleanup();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
  });
  
  it('should transform embed directives', async () => {
    // Create simple test content
    const content = '@embed [$PROJECTPATH/embed-source.md]';
    
    // Run through lightweight transformation pipeline
    const result = await context.runMeld({
      input: content,
      transformation: true,
      format: 'markdown',
      inlineContent: true
    });
    
    // Verify transformation worked
    expect(result.stdout).toContain('# Test Section');
    expect(result.stdout).toContain('This is test content.');
    expect(result.stdout).not.toContain('@embed');
  });
});
```

## Success Criteria

The strategic plan will be considered successful when:

1. All tests pass without timeouts or memory errors
2. The embed-transformation-e2e.test.ts completes successfully
3. Tests can be run in parallel without interference
4. Memory usage remains stable during test runs
5. The DI container properly manages all service lifecycles
6. Circular dependencies are properly managed via the mediator

## Conclusion

By implementing this strategic plan, we'll address the root causes of the circular dependency and timeout issues rather than treating the symptoms. The ServiceMediator pattern provides a clean architectural solution that works well with TSyringe, while the enhanced test framework ensures reliable test execution.

This approach will allow us to complete the TSyringe migration more efficiently and leave the codebase in a cleaner, more maintainable state.