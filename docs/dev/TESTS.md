# Testing in Meld

This document outlines the testing infrastructure and best practices for the Meld codebase. It serves as a practical guide for writing and maintaining tests.

## DI-Only Approach

As part of Phase 2 of our DI cleanup plan, we've moved to a DI-only approach for tests, removing the dual-mode support that was previously in place. This simplifies our testing infrastructure and reduces the complexity of managing multiple initialization paths.

### What Changed

1. **Removed Dual-Mode Support**:
   - `TestContextDI.withDI()` and `TestContextDI.withoutDI()` methods are deprecated
   - All tests now use `TestContextDI.create()` which always creates a DI container
   - Legacy initialization paths are no longer supported
   - Removed conditional checks for DI mode in test utilities

2. **Test Structure Updates**:
   - Tests no longer need to handle both DI and non-DI modes
   - No more conditional logic in test setup
   - Clean separation of test context creation, mock registration, and service resolution

3. **Testing Benefits**:
   - More consistent test setup
   - Clearer service dependency relationships
   - Isolated container state between tests
   - Easier mock registration and service resolution
   - Better cleanup of resources between tests

### Migrating Existing Tests

If you have tests using the dual-mode approach, here's how to update them:

**Before**:
```typescript
describe.each([
  { useDI: true, name: 'with DI' },
  { useDI: false, name: 'without DI' },
])('$name', ({ useDI }) => {
  let context: TestContextDI;
  let service: IMyService;

  beforeEach(async () => {
    // Create context based on mode
    context = useDI 
      ? TestContextDI.withDI() 
      : TestContextDI.withoutDI();
    
    // Initialize service differently based on mode
    if (useDI) {
      service = context.container.resolve('IMyService');
    } else {
      service = new MyService();
      service.initialize(dependencies);
    }
  });
  
  // Tests...
});
```

**After**:
```typescript
describe('MyService', () => {
  let context: TestContextDI;
  let service: IMyService;

  beforeEach(async () => {
    // Always use DI
    context = TestContextDI.create();
    
    // Register any mocks needed
    context.registerMock('IDependencyService', mockDependency);
    
    // Resolve service from container
    service = context.container.resolve('IMyService');
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  // Tests...
});
```

### Container Isolation and Management

One of the key improvements in our testing infrastructure is better container isolation and management. This helps prevent test contamination and ensures reliable, repeatable test results.

#### Container Isolation

Each test should have its own isolated container environment:

```typescript
// Create an isolated container that won't affect other tests
const context = TestContextDI.createIsolated();

// Alternatively, for more control, create a child container
const parentContext = TestContextDI.create();
const childContext = parentContext.createChildContext();
```

Using isolated containers prevents:
- Tests affecting each other through shared container state
- Order-dependent test behavior
- Difficult-to-debug test failures due to container contamination

#### Container Cleanup

Always clean up containers to prevent memory leaks and state contamination:

```typescript
describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.create();
  });
  
  afterEach(async () => {
    // IMPORTANT: Always clean up after each test
    await context.cleanup();
  });
  
  // Tests...
});
```

The `cleanup()` method:
- Unregisters mock services
- Releases container resources
- Cleans up child contexts
- Resets container state
- Helps prevent memory leaks in long-running test suites

#### Container State Diagnostics

If you're experiencing issues with container state, use diagnostic tools:

```typescript
const report = context.createDiagnosticReport();
console.log(report);
// Shows registered mocks, child contexts, service registrations, etc.
```

This can help identify issues like:
- Missing service registrations
- Unexpected mock implementations
- Container state leaks
- Cleanup failures

## Directory Structure

Tests are organized following these conventions:

```
project-root/
├─ tests/                    # Test infrastructure and shared resources
│  ├─ utils/                # Test utilities and factories
│  │  ├─ di/                # Dependency injection test utilities
│  │  │  └─ TestContextDI.ts # DI-based test context
│  ├─ mocks/                # Shared mock implementations
│  ├─ fixtures/             # Test fixture data
│  └─ setup.ts             # Global test setup
└─ services/               # Service implementations with co-located tests
   └─ ServiceName/
      ├─ ServiceName.test.ts           # Unit tests
      ├─ ServiceName.integration.test.ts # Integration tests
      └─ handlers/
         └─ HandlerName.test.ts        # Handler-specific tests
```

## Test Infrastructure

### Core Testing Utilities

1. **TestContextDI**
   - Central test harness providing access to all test utilities
   - Uses dependency injection for service creation and management
   - Provides isolated test containers to prevent state leakage
   - Handles proper cleanup of resources between tests
   - Offers utilities for mocking and service registration

2. **Test Factories**
   - Located in `tests/utils/testFactories.ts`
   - Provides helper functions for creating test nodes and mocks
   - Ensures consistent test data creation

Example usage:
```typescript
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { createDefineDirective, createLocation } from '@tests/utils/testFactories';

// Create a test context with dependency injection
const context = TestContextDI.create();

// Create a test node
const node = createDefineDirective(
  'greet',
  'echo "Hello"',
  [],
  createLocation(1, 1, 1, 20)
);

// Get a service from the DI container
const service = context.container.resolve('IMyService');
```

### Mock Services with DI

TestContextDI provides methods for registering mock implementations with the DI container:

```typescript
// Create test context
const context = TestContextDI.create();

// Register a mock service
const mockStateService = {
  getVariable: vi.fn().mockReturnValue('test value'),
  setVariable: vi.fn(),
  // Other methods...
};
context.registerMock('IStateService', mockStateService);

// Get a service that depends on the mock
const directiveService = context.container.resolve('IDirectiveService');

// Test with the mock
await directiveService.processDirective(node);
expect(mockStateService.setVariable).toHaveBeenCalledWith('name', 'value');
```

### Class Identity with vitest-mock-extended

To address issues with `instanceof` checks in tests, we use [vitest-mock-extended](https://github.com/marchaos/jest-mock-extended) which maintains proper prototype chains:

```typescript
import { mock } from 'vitest-mock-extended';
import { PathValidationError } from '@services/fs/PathService/errors/PathValidationError';

// Create a factory function for properly mocked errors
const createPathValidationError = (message, details, location) => {
  const error = mock<PathValidationError>();
  
  Object.defineProperties(error, {
    message: { value: message, writable: true, configurable: true },
    name: { value: 'PathValidationError', writable: true, configurable: true },
    code: { value: details.code, writable: true, configurable: true },
    path: { value: details.path, writable: true, configurable: true },
    // Other properties...
  });
  
  return error;
};

// Use in tests
const error = createPathValidationError('Invalid path', { code: 'INVALID_PATH' }, location);
expect(error instanceof PathValidationError).toBe(true); // Passes!
```

This approach ensures mock objects pass `instanceof` checks, which is especially important for error handling tests.

## Writing Tests

### Service Tests with DI

Service tests should follow this structure:

```typescript
import { TestContextDI } from '@tests/utils/di/TestContextDI';

describe('ServiceName', () => {
  let context: TestContextDI;
  let service: IServiceName;
  
  beforeEach(() => {
    // Create a test context
    context = TestContextDI.create();
    
    // Register mocks for dependencies
    context.registerMock('IDependencyService', { 
      method: vi.fn().mockReturnValue('result')
    });
    
    // Get the service from the container
    service = context.container.resolve('IServiceName');
  });
  
  afterEach(async () => {
    // Clean up resources
    await context.cleanup();
  });

  describe('core functionality', () => {
    it('should handle basic operations', async () => {
      // Arrange
      const input = // ... test input
      
      // Act
      const result = await service.operation(input);
      
      // Assert
      expect(result).toBeDefined();
      // Test specific expectations
    });
  });

  describe('error handling', () => {
    it('should handle errors appropriately', async () => {
      // ... error test cases
    });
  });
});
```

### Directive Handler Tests

Directive handler tests should cover:

1. Value Processing
   - Basic value handling
   - Parameter processing
   - Edge cases

2. Validation Integration
   - Integration with ValidationService
   - Validation error handling

3. State Management
   - State updates
   - Command/variable storage
   - Original and transformed node states
   - Node replacement handling

4. Transformation Behavior
   - Node replacement generation
   - Transformation state preservation
   - Clean output verification

5. Error Handling
   - Validation errors
   - Resolution errors
   - State errors
   - Transformation errors

Example structure:
```typescript
import { TestContextDI } from '@tests/utils/di/TestContextDI';

describe('HandlerName', () => {
  let context: TestContextDI;
  let handler: IHandlerName;

  beforeEach(() => {
    context = TestContextDI.create();
    
    // Register mocks
    context.registerMock('IValidationService', {
      validateDirective: vi.fn().mockReturnValue(true)
    });
    context.registerMock('IStateService', {
      setVariable: vi.fn(),
      getVariable: vi.fn()
    });
    
    // Get the handler from the container
    handler = context.container.resolve('HandlerName');
  });
  
  afterEach(async () => {
    await context.cleanup();
  });

  describe('value processing', () => {
    // Value processing tests
  });

  describe('validation', () => {
    // Validation tests
  });

  describe('state management', () => {
    // State management tests
  });

  describe('transformation', () => {
    it('should provide correct replacement nodes', async () => {
      const node = createDirectiveNode('test', { value: 'example' });
      const result = await handler.execute(node, context);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement.type).toBe('Text');
      expect(result.replacement.content).toBe('example');
    });

    it('should preserve location in transformed nodes', async () => {
      const node = createDirectiveNode('test', { value: 'example' });
      const result = await handler.execute(node, context);
      
      expect(result.replacement.location).toEqual(node.location);
    });
  });

  describe('error handling', () => {
    // Error handling tests
  });
});
```

### Integration Tests

Integration tests should focus on real-world scenarios and service interactions:
```typescript
import { TestContextDI } from '@tests/utils/di/TestContextDI';

describe('Service Integration', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    // Create test context with real services
    context = TestContextDI.create();
  });
  
  afterEach(async () => {
    await context.cleanup();
  });

  it('should process complex scenarios', async () => {
    // Get services from the container
    const directiveService = context.container.resolve('IDirectiveService');
    const stateService = context.container.resolve('IStateService');
    const interpreterService = context.container.resolve('IInterpreterService');
    
    // Test end-to-end flows
    // ...
  });

  it('should generate clean output without directives', async () => {
    const input = `
      @text greeting = "Hello"
      @run [echo ${greeting}]
      Regular text
    `;
    
    // Get interpreter service
    const interpreterService = context.container.resolve('IInterpreterService');
    
    // Process the document
    const result = await interpreterService.interpret(input);
    
    expect(result).not.toContain('@text');
    expect(result).not.toContain('@run');
    expect(result).toContain('Hello');
    expect(result).toContain('Regular text');
  });
});
```

## Best Practices

1. **Test Organization**
   - Co-locate tests with implementation files
   - Use clear, descriptive test names
   - Group related tests using `describe` blocks
   - Follow the Arrange-Act-Assert pattern

2. **DI Container Management**
   - Use `TestContextDI.create()` to create isolated containers
   - Clean up resources with `context.cleanup()` after each test
   - Register mocks for dependencies to create focused tests
   - Avoid global container modifications

3. **Mock Usage**
   - Use `context.registerMock()` to register mock services
   - Use vitest-mock-extended for mocks that need to pass instanceof checks
   - Set up specific mock implementations in beforeEach
   - Clear all mocks between tests
   - Be explicit about mock expectations

4. **Error Testing**
   - Test both expected and unexpected errors
   - Use vitest-mock-extended for error classes to ensure instanceof checks work
   - Verify error messages and types
   - Test error propagation
   - Include location information in errors

5. **Location Handling**
   - Always include location information in test nodes
   - Use `createLocation` helper for consistency
   - Test location propagation in errors
   - Verify location preservation in transformed nodes

6. **State Management**
   - Test state immutability
   - Verify state cloning
   - Test parent/child state relationships
   - Validate state updates
   - Test both original and transformed node states
   - Verify transformation state persistence

7. **Transformation Testing**
   - Test node replacement generation
   - Verify clean output formatting
   - Test transformation state inheritance
   - Validate directive removal in output
   - Test complex transformation scenarios

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test services/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run tests with different verbosity levels
MELD_TEST_VERBOSE=true npm test
MELD_TEST_OUTPUT_LEVEL=minimal npm test
```

### Controlling Test Output Verbosity

The Meld testing infrastructure includes a selective test output system that allows for precise control over test verbosity. This is especially useful when debugging complex test failures or when running tests in CI environments.

#### Global Test Output Control

You can control the verbosity of all tests using environment variables:

```bash
# Enable verbose output for all tests
MELD_TEST_VERBOSE=true npm test

# Set a specific output level for all tests
MELD_TEST_OUTPUT_LEVEL=minimal npm test
MELD_TEST_OUTPUT_LEVEL=normal npm test
MELD_TEST_OUTPUT_LEVEL=verbose npm test
MELD_TEST_OUTPUT_LEVEL=debug npm test
```

#### Per-Test Output Control

For more fine-grained control, you can configure output for specific tests:

```typescript
import { withTestOutput } from '@tests/utils/debug/vitest-output-setup';

describe('My test suite', () => {
  it('should test with custom output', async () => {
    await withTestOutput({ level: 'verbose' }, async () => {
      // Your test code here
      // Will run with verbose output regardless of global settings
    });
  });
});
```

#### Filtering Specific Operations or State Fields

You can also filter specific operations or state fields:

```typescript
await withTestOutput({
  level: 'verbose',
  include: ['state.variables', 'resolution.process'],
  exclude: ['validation.details']
}, async () => {
  // Will only show state variables and resolution process
  // Will exclude validation details
});
```

#### Debugging Failed Tests

When debugging complex test failures:

```bash
# Run a specific failing test with maximum verbosity
MELD_TEST_VERBOSE=true npm test path/to/failing.test.ts

# OR use targeted verbosity in the test itself
it('failing test case', async () => {
  await withTestOutput({ 
    level: 'debug',
    include: ['state', 'resolution', 'transformation']
  }, async () => {
    // Test code here with detailed output
  });
});
```

## Test Coverage

The project maintains high test coverage through:
- Unit tests for all services and handlers
- Integration tests for service interactions
- Error case coverage
- Edge case testing

Coverage reports can be generated using:
```bash
npm test -- --coverage
```

## Debugging Tests

1. Use the `debug` logger in tests:
```typescript
import { debug } from '@core/utils/logger';

it('should handle complex case', () => {
  debug('Test state:', someObject);
});
```

2. Use Node.js debugger:
   - Add `debugger` statement in test
   - Run `npm test -- --inspect-brk`
   - Connect Chrome DevTools

3. Use Vitest UI:
```bash
npm test -- --ui
```

## Common Testing Patterns

### Testing with Class Identity (instanceof)

When testing error handling or class identity checks, use vitest-mock-extended:

```typescript
import { mock } from 'vitest-mock-extended';

// Create a mock instance that passes instanceof checks
const mockError = mock<MyErrorClass>();

// Configure properties
Object.defineProperties(mockError, {
  message: { value: 'Error message', writable: true },
  code: { value: 'ERROR_CODE', writable: true },
  // Add other properties...
});

// Use in tests - will pass instanceof checks
expect(mockError instanceof MyErrorClass).toBe(true);
```

### Implementing vitest-mock-extended for PathValidationError

As part of Phase 2 of our DI cleanup plan, we've adopted vitest-mock-extended to solve instanceof checks issues with PathValidationError and similar classes. Here's how to implement it:

1. **Install the package**:
```bash
npm install --save-dev vitest-mock-extended
```

2. **Create a factory function for PathValidationError**:
```typescript
// In tests/utils/errorFactories.ts
import { mock } from 'vitest-mock-extended';
import { PathValidationError } from '@services/fs/PathService/errors/PathValidationError';
import { PathErrorCode } from '@services/fs/PathService/errors/PathErrorCode';
import { Location } from 'meld-spec';

export interface PathValidationErrorDetails {
  code: PathErrorCode;
  path: string;
  resolvedPath?: string;
  baseDir?: string;
  cause?: Error;
}

/**
 * Creates a mock PathValidationError that passes instanceof checks
 */
export function createPathValidationError(
  message: string,
  details: PathValidationErrorDetails,
  location?: Location
): PathValidationError {
  const error = mock<PathValidationError>();
  
  // Define properties to match the real PathValidationError
  Object.defineProperties(error, {
    message: { value: message, writable: true, configurable: true },
    name: { value: 'PathValidationError', writable: true, configurable: true },
    code: { value: details.code, writable: true, configurable: true },
    path: { value: details.path, writable: true, configurable: true },
    resolvedPath: { value: details.resolvedPath, writable: true, configurable: true },
    baseDir: { value: details.baseDir, writable: true, configurable: true },
    cause: { value: details.cause, writable: true, configurable: true },
    location: { value: location, writable: true, configurable: true },
    stack: { value: new Error().stack, writable: true, configurable: true }
  });
  
  return error;
}
```

3. **Update TestContextDI to use the factory function**:
```typescript
// In TestContextDI.ts, replace the current PathValidationError implementation:

private registerPathService(): void {
  // Register the mock PathService
  const mockPathService = {
    validatePath: vi.fn().mockImplementation(async (path) => {
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
    // ... other methods
  };
  
  this.container.register('IPathService', { useValue: mockPathService });
}
```

4. **Use in tests**:
```typescript
import { PathValidationError } from '@services/fs/PathService/errors/PathValidationError';

it('validates empty path', async () => {
  // This test will now pass the instanceof check
  await expect(service.validatePath('')).rejects.toThrow(PathValidationError);
});
```

This approach can be extended to other error classes or any class that requires instanceof checks in tests.

### Creating Child Contexts

For tests that need to simulate nested contexts:

```typescript
const parentContext = TestContextDI.create();
const childContext = parentContext.createChildContext();

// Child inherits parent's state but has isolated container
const parentService = parentContext.container.resolve('IMyService');
const childService = childContext.container.resolve('IMyService');

// Clean up both contexts
await childContext.cleanup();
await parentContext.cleanup();
```

### Isolated Test Environments

For tests that need complete isolation:

```typescript
const context = TestContextDI.createIsolated();

// This context has its own container that doesn't affect other tests
const service = context.container.resolve('IMyService');

// Always clean up
await context.cleanup();
```
