# Factory Mock Patterns for Test Updates

This document provides detailed patterns for mocking factory classes in tests, focusing on the most common factory patterns in the codebase.

## Common Factory Types

### 1. ServiceClientFactory Pattern

Services like `InterpreterService` and `DirectiveService` use a client factory pattern. These typically need special handling in tests.

#### Example: DirectiveServiceClientFactory

```typescript
// Mock implementation
const mockDirectiveService = createServiceMock();
mockDirectiveService.executeDirective.mockResolvedValue({
  state: {},
  replacement: { type: 'Text', content: 'Replaced content' }
});

const mockDirectiveServiceClientFactory = {
  getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
} as unknown as DirectiveServiceClientFactory;

// Registration
context.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
```

#### Example: InterpreterServiceClientFactory

```typescript
// Mock implementation
const mockInterpreterService = createServiceMock();
mockInterpreterService.interpret.mockResolvedValue({});

const mockInterpreterServiceClientFactory = {
  getInterpreterService: vi.fn().mockReturnValue(mockInterpreterService)
} as unknown as InterpreterServiceClientFactory;

// Registration
context.registerMock('InterpreterServiceClientFactory', mockInterpreterServiceClientFactory);
```

### 2. Factory with Lazy Initialization

Some factories implement lazy initialization, where the service is created on first access.

```typescript
// Mock implementation with lazy initialization
const mockFactory = {
  service: null as any,
  getService: vi.fn().mockImplementation(function() {
    if (!this.service) {
      this.service = createServiceMock();
      this.service.method.mockResolvedValue(expectedResult);
    }
    return this.service;
  })
} as unknown as IServiceFactory;

// Registration
context.registerMock('IServiceFactory', mockFactory);
```

### 3. Test-Only Fallback Factory

For integration tests, creating a test-specific fallback can be helpful:

```typescript
// Mock implementation with test environment detection
const mockFactory = {
  getService: vi.fn().mockImplementation(() => {
    if (process.env.NODE_ENV === 'test') {
      return createTestMockService();
    }
    throw new Error('Factory not initialized');
  })
} as unknown as IServiceFactory;

// Registration
context.registerMock('IServiceFactory', mockFactory);
```

## Specific Patterns for Key Services

### InterpreterService Tests

When testing services that use the `InterpreterService`, you'll need to mock the `DirectiveServiceClientFactory`:

```typescript
beforeEach(async () => {
  context = TestContextDI.createIsolated();
  await context.initialize();
  
  // Create mocks
  mockDirectiveService = createMockDirectiveService();
  mockStateService = createMockStateService();
  
  // Register service mocks
  context.registerMock('IDirectiveService', mockDirectiveService);
  context.registerMock('DirectiveService', mockDirectiveService);
  context.registerMock('IStateService', mockStateService);
  context.registerMock('StateService', mockStateService);
  
  // Create and register factory mock
  mockDirectiveServiceClientFactory = {
    getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
  } as unknown as DirectiveServiceClientFactory;
  
  context.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
  
  // Resolve service
  service = await context.resolve(InterpreterService);
});
```

### Directive Handler Tests

When testing directive handlers like `ImportDirectiveHandler` or `EmbedDirectiveHandler` that use the `InterpreterService`, you'll need to mock the `InterpreterServiceClientFactory`:

```typescript
beforeEach(async () => {
  context = TestContextDI.createIsolated();
  await context.initialize();
  
  // Create service mocks
  mockInterpreterService = createMockInterpreterService();
  mockStateService = createMockStateService();
  
  // Register service mocks
  context.registerMock('IInterpreterService', mockInterpreterService);
  context.registerMock('InterpreterService', mockInterpreterService);
  context.registerMock('IStateService', mockStateService);
  context.registerMock('StateService', mockStateService);
  
  // Create and register factory mock
  mockInterpreterServiceClientFactory = {
    getInterpreterService: vi.fn().mockReturnValue(mockInterpreterService)
  } as unknown as InterpreterServiceClientFactory;
  
  context.registerMock('InterpreterServiceClientFactory', mockInterpreterServiceClientFactory);
  
  // Resolve handler
  handler = await context.resolve(ImportDirectiveHandler);
});
```

## Integration Test Patterns

For integration tests, you may need to create a more comprehensive mock that handles initialization and state:

```typescript
// Testing environment detection
const isTestEnv = process.env.NODE_ENV === 'test';

// Mock factory with fallback for tests
const mockFactory = {
  _service: null as any,
  getService: vi.fn().mockImplementation(function() {
    if (this._service) {
      return this._service;
    }
    
    if (isTestEnv) {
      this._service = createTestMockService();
      return this._service;
    }
    
    throw new Error('Factory not properly initialized for test');
  })
} as unknown as IServiceFactory;

// Ensure tests run with NODE_ENV=test
beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  process.env.NODE_ENV = 'production'; // Restore
});
```

## Common Mistakes to Avoid

1. **Missing Type Casting**: Always use `as unknown as FactoryType` to ensure proper typing.

2. **Forgetting to Register**: Always register the factory mock with the container.

3. **Using Direct References**: Use `this.service` instead of a closure reference to properly simulate lazy initialization.

4. **Not Mocking All Methods**: Ensure all methods used by the service under test are properly mocked.

5. **Missing Method Implementations**: Return appropriate values from mock methods.

## Troubleshooting Factory Mock Issues

### "Cannot read property of undefined"

This usually indicates that the factory mock isn't returning the expected service, or the service mock is missing methods.

Solution:
```typescript
// Ensure the mock service is complete
const mockService = {
  method1: vi.fn(),
  method2: vi.fn(),
  // Include ALL methods that might be called
};

// Ensure the factory returns this service
mockFactory.getService.mockReturnValue(mockService);
```

### "X is not a function"

This indicates that a method hasn't been properly mocked.

Solution:
```typescript
// Explicitly mock all methods
mockService.method.mockImplementation(() => {
  // Implement behavior
  return expectedResult;
});
```

### Circular Reference Issues

When mocking factories involved in circular dependencies:

```typescript
// Register all dependencies first
context.registerMock('IDep1', mockDep1);
context.registerMock('IDep2', mockDep2);

// Use asynchronous resolution to break cycles
const servicePromise = context.resolveAsync<MyService>('MyService');

// Wait for resolution when needed
const service = await servicePromise;
```