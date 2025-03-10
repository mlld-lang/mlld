# Test Standards and Best Practices

This document outlines standardized patterns for writing and maintaining tests in the Meld codebase. Consistent test patterns help ensure maintainability, readability, and reliability of our test suite.

## Dependency Injection in Tests

### Container Initialization Pattern

Always use the isolated container pattern through `TestContextDI.createIsolated()`:

```typescript
// STANDARD PATTERN ✅
const context = TestContextDI.createIsolated();

// NOT RECOMMENDED ❌
const context = TestContextDI.create({ isolatedContainer: true });
```

### Proper Async Initialization

Tests must properly initialize the context with await:

```typescript
describe('ServiceName', () => {
  let context: TestContextDI;
  let service: IServiceName;

  beforeEach(async () => {
    // Create isolated test context
    context = TestContextDI.createIsolated();
    
    // Initialize context
    await context.initialize();
    
    // Register mocks as needed
    // ...
    
    // Resolve service with proper await
    service = await context.resolve('IServiceName');
  });
  
  afterEach(async () => {
    // Use null check for robustness
    await context?.cleanup();
  });
});
```

### Mock Registration Pattern

Register dependencies using the context's registerMock method:

```typescript
// STANDARD PATTERN ✅
// Create mock dependencies
const mockDependency = mockDeep<IDependencyService>();
// Or use factory functions
const mockService = createServiceMock();

// Register mock with the DI container
context.registerMock('IDependencyService', mockDependency);

// For class-based dependencies, you can register class instances directly
context.registerMock('IService', new ServiceImpl());
```

### Service Resolution Pattern

Always use `await` with service resolution to ensure services are fully initialized before use:

```typescript
// STANDARD PATTERN ✅
service = await context.resolve('IServiceName');
// or
service = await context.container.resolve(ServiceName);

// NOT RECOMMENDED ❌
service = context.resolveSync('IServiceName');
// or
service = context.container.resolve(ServiceName); // missing await
```

Using `await` is critical because:
1. It ensures services are fully initialized before use
2. It prevents race conditions where services might be used before initialization completes
3. It properly handles any async operations in service constructors or initialization methods
4. It makes tests more reliable and consistent

### Context Cleanup Pattern

Always use null checks when cleaning up contexts to prevent errors if context creation failed:

```typescript
// STANDARD PATTERN ✅
afterEach(async () => {
  await context?.cleanup();
});

// NOT RECOMMENDED ❌
afterEach(async () => {
  await context.cleanup();
});
```

This pattern makes tests more robust by:
1. Preventing errors if context creation failed for any reason
2. Ensuring cleanup is safely skipped if context is undefined or null
3. Making tests more resilient to setup failures

## Mock Type Definitions

### Standard Mock Type Pattern

```typescript
// Import the vitest-mock-extended library (NOT jest-mock-deep)
import { mockDeep, mockReset } from 'vitest-mock-extended';

// STANDARD PATTERN ✅
// For interfaces with factory functions
let mockService: ReturnType<typeof createServiceMock>;

// For modules or interfaces without factories
let mockFs: ReturnType<typeof mockDeep<typeof fs>>;

// NOT RECOMMENDED ❌
let mockService: jest.Mocked<IService>;
// Or using jest-mock-deep (outdated and incompatible with Vitest)
import { mockDeep } from 'jest-mock-deep'; // ❌ WRONG!
```

Always use `vitest-mock-extended` for mocking instead of Jest-based mocking libraries. This ensures proper compatibility with Vitest and provides better TypeScript type safety.

## Import Statements

### Standard Import Pattern

```typescript
// STANDARD PATTERN ✅
// Type imports
import type { IService } from '@services/path/IService.js';
// Regular imports
import { Service } from '@services/path/Service.js';
// Test utilities
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
// Use aliased paths with .js extension

// NOT RECOMMENDED ❌
import { IService } from '../../services/path/IService';
// Avoid relative paths when possible
// Always include .js extension for ESM compatibility
```

## Error Handling Patterns

### Standard Error Testing Pattern

```typescript
// STANDARD PATTERN ✅ - For synchronous functions
expect(() => service.method()).toThrow(ExpectedError);

// STANDARD PATTERN ✅ - For async functions
await expect(async () => {
  await service.method();
}).rejects.toThrow(ExpectedError);

// For detailed error validation, use expectToThrowWithConfig utility:
await expectToThrowWithConfig(
  async () => service.validate(node),
  {
    type: 'MeldDirectiveError',
    code: DirectiveErrorCode.VALIDATION_FAILED,
    severity: ErrorSeverity.Fatal,
    directiveKind: 'text',
    messageContains: 'identifier'
  }
);

// NOT RECOMMENDED ❌ - Avoid try/catch when utilities are available
try {
  await service.method();
  fail('Expected an error');
} catch (error) {
  expect(error).toBeInstanceOf(ExpectedError);
}
```

## Common Pitfalls to Avoid

1. **Missing await**: Always await context.initialize() and context.cleanup()
2. **Container leaks**: Failing to call cleanup() can cause test instability
3. **Dead containers**: Re-using a container after cleanup() will cause errors
4. **Synchronous resolution**: Using container.resolve() on services requiring async initialization
5. **Incorrect mock registration**: Using container.register() instead of context.registerMock()
6. **Non-isolated containers**: Using TestContextDI.create() without isolation

## Test Migration Checklist

When migrating existing tests:

1. ✅ Replace TestContextDI.create({ isolatedContainer: true }) with TestContextDI.createIsolated()
2. ✅ Add proper async await to context.initialize() and context.cleanup()
3. ✅ Update mock registrations to use context.registerMock()
4. ✅ Use await context.container.resolve() for service resolution
5. ✅ Use context.services for common services
6. ✅ Ensure proper cleanup with null check in afterEach blocks
7. ✅ Replace legacy file system operations with context.services.filesystem methods
8. ✅ Update jest.Mocked types to use ReturnType<typeof mockDeep<T>>

## Directive Handler Test Pattern

For testing directive handlers, use the standardized pattern:

```typescript
describe('DirectiveHandlerName', () => {
  let context: TestContextDI;
  let handler: DirectiveHandlerName;
  let mockFileSystem: ReturnType<typeof createFileSystemServiceMock>;
  let mockResolutionService: ReturnType<typeof createResolutionServiceMock>;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    
    // Create mocks using factory functions or mockDeep
    mockFileSystem = createFileSystemServiceMock();
    mockResolutionService = createResolutionServiceMock();
    
    // Register mocks
    context.registerMock('IFileSystemService', mockFileSystem);
    context.registerMock('IResolutionService', mockResolutionService);
    
    // Initialize context
    await context.initialize();
    
    // Resolve handler
    handler = await context.container.resolve(DirectiveHandlerName);
  });

  afterEach(async () => {
    await context?.cleanup();
  });
  
  // Tests...
});
```

## Transformation Test Pattern

For directive handler transformation tests:

```typescript
// Create test state
const state = createTestState();

// Create directive node from example
const node = createNodeFromExample(directiveExamples.someExample);

// Create execution context
const context: DirectiveContext = {
  filePath: '/test/path.meld',
  state
};

// Execute handler
const result = await handler.execute(node, context);

// Verify expectations
expect(result).toEqual(expectedResult);
expect(mockDependency.method).toHaveBeenCalledWith(expectedArgs);
```

## Helper Functions

The following helper functions should be used for creating standardized test setups:

1. **createTestState()**: Creates a standard state object for directive tests
2. **createNodeFromExample()**: Creates directive nodes from centralized syntax examples
3. **createFileSystemServiceMock()**: Creates a standard mock for the FileSystemService
4. **createResolutionServiceMock()**: Creates a standard mock for the ResolutionService
5. **createStateServiceMock()**: Creates a standard mock for the StateService
6. **createLoggerMock()**: Creates a standard mock for the Logger service 