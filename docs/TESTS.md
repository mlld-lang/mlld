# Testing in Meld

This document outlines the testing infrastructure and best practices for the Meld codebase. It serves as a practical guide for writing and maintaining tests.

## Directory Structure

Tests are organized following these conventions:

```
project-root/
├─ tests/                    # Test infrastructure and shared resources
│  ├─ utils/                # Test utilities and factories
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

1. **TestContext**
   - Central test harness providing access to all test utilities
   - Manages test state and cleanup
   - Available globally in tests as `testContext`

2. **Test Factories**
   - Located in `tests/utils/testFactories.ts`
   - Provides helper functions for creating test nodes and mocks
   - Ensures consistent test data creation

Example usage:
```typescript
import { 
  createDefineDirective,
  createLocation,
  createMockStateService 
} from '@tests/utils/testFactories';

const node = createDefineDirective(
  'greet',
  'echo "Hello"',
  [],
  createLocation(1, 1, 1, 20)
);

const mockState = createMockStateService();
```

### Mock Services

The test factories provide mock implementations for all core services:

```typescript
const mockServices = {
  stateService: createMockStateService(),
  validationService: createMockValidationService(),
  resolutionService: createMockResolutionService(),
  fileSystemService: createMockFileSystemService(),
  // ... etc
};
```

Each mock service implements the corresponding interface and provides sensible defaults.

## Writing Tests

### Service Tests

Service tests should follow this structure:

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let dependencies: {
    stateService: IStateService;
    // ... other dependencies
  };

  beforeEach(() => {
    dependencies = {
      stateService: createMockStateService(),
      // ... initialize other dependencies
    };
    service = new ServiceName(dependencies);
  });

  describe('core functionality', () => {
    it('should handle basic operations', async () => {
      // Arrange
      const input = // ... test input
      
      // Act
      const result = await service.operation(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(dependencies.stateService.someMethod)
        .toHaveBeenCalledWith(expectedArgs);
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
describe('HandlerName', () => {
  let handler: HandlerName;
  let dependencies: {
    validationService: IValidationService;
    stateService: IStateService;
    resolutionService: IResolutionService;
  };

  beforeEach(() => {
    dependencies = {
      validationService: createMockValidationService(),
      stateService: createMockStateService(),
      resolutionService: createMockResolutionService()
    };
    handler = new HandlerName(dependencies);
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
describe('Service Integration', () => {
  let services: {
    directiveService: DirectiveService;
    stateService: StateService;
    // ... other real service instances
  };

  beforeEach(() => {
    services = {
      directiveService: new DirectiveService(),
      stateService: new StateService(),
      // ... initialize other services
    };
    
    // Initialize service relationships
    services.directiveService.initialize(
      services.validationService,
      services.stateService,
      services.resolutionService
    );
  });

  it('should process complex scenarios', async () => {
    // Test end-to-end flows
  });

  it('should generate clean output without directives', async () => {
    const input = `
      @text greeting = "Hello"
      @run [echo ${greeting}]
      Regular text
    `;
    
    const result = await processDocument(input);
    
    expect(result).not.toContain('@text');
    expect(result).not.toContain('@run');
    expect(result).toContain('Hello');
    expect(result).toContain('Regular text');
  });

  it('should maintain both original and transformed states', async () => {
    const state = await processDocument(input);
    
    expect(state.getOriginalNodes()).toHaveLength(3);
    expect(state.getTransformedNodes()).toHaveLength(2);
  });
});
```

## Best Practices

1. **Test Organization**
   - Co-locate tests with implementation files
   - Use clear, descriptive test names
   - Group related tests using `describe` blocks
   - Follow the Arrange-Act-Assert pattern

2. **Mock Usage**
   - Use the provided mock factories
   - Set up specific mock implementations in beforeEach
   - Clear all mocks between tests
   - Be explicit about mock expectations

3. **Error Testing**
   - Test both expected and unexpected errors
   - Verify error messages and types
   - Test error propagation
   - Include location information in errors

4. **Location Handling**
   - Always include location information in test nodes
   - Use `createLocation` helper for consistency
   - Test location propagation in errors
   - Verify location preservation in transformed nodes

5. **State Management**
   - Test state immutability
   - Verify state cloning
   - Test parent/child state relationships
   - Validate state updates
   - Test both original and transformed node states
   - Verify transformation state persistence

6. **Transformation Testing**
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
