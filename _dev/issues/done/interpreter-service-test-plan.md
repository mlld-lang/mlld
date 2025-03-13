# InterpreterService Unit Test Implementation Plan

This document outlines the specific steps to update the `InterpreterService.unit.test.ts` file to comply with TESTS.md standards and fix current test failures.

## Current Issues

1. Improper initialization of the `DirectiveServiceClientFactory` mock
2. Missing registration for the factory mock
3. Type issues with mock factory implementation

## Implementation Steps

### 1. Fix Mock Factory Implementation

```typescript
// Current problematic mock
mockDirectiveServiceClientFactory = {
  getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
} as unknown as DirectiveServiceClientFactory;

// Updated implementation with proper typing
mockDirectiveServiceClientFactory = {
  getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
} as unknown as DirectiveServiceClientFactory;

// Register the factory in the container
context.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
```

### 2. Update Service Resolution

```typescript
// Current problematic resolution
service = await context.container.resolve(InterpreterService);

// Updated implementation
service = await context.resolve(InterpreterService);
```

### 3. Update Test Setup

```typescript
beforeEach(async () => {
  // Create TestContextDI with isolated container
  context = TestContextDI.createIsolated();
  await context.initialize();
  
  // Create mocks
  mockDirectiveService = createMockDirectiveService();
  mockStateService = createMockStateService();
  
  // Register mocks with proper service identifiers
  context.registerMock('IDirectiveService', mockDirectiveService);
  context.registerMock('DirectiveService', mockDirectiveService);
  context.registerMock('IStateService', mockStateService);
  context.registerMock('StateService', mockStateService);
  
  // Create a mock factory that returns the directive service
  mockDirectiveServiceClientFactory = {
    getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
  } as unknown as DirectiveServiceClientFactory;
  
  // Register the factory mock
  context.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
  
  // Resolve the interpreter service
  service = await context.resolve(InterpreterService);
});
```

### 4. Update Error Handling Tests

Current error handling tests use a try-catch pattern. Update to use the recommended error testing utility:

```typescript
// Current implementation
try {
  await service.interpret([directiveNode]);
  expect.fail('Should have thrown an error');
} catch (e: unknown) {
  expect(e).toBeInstanceOf(MeldInterpreterError);
  if (e instanceof MeldInterpreterError) {
    expect(e.message).toContain('Generic error');
    expect(e.code).toBe('directive_handling');
  }
}

// Updated implementation
await expectToThrowWithConfig(async () => {
  await service.interpret([directiveNode]);
}, {
  errorType: MeldInterpreterError,
  code: 'directive_handling',
  messageIncludes: 'Generic error'
});
```

### 5. Fix Lazy Initialization Tests

Update tests that check initialization to account for factory-based lazy initialization:

```typescript
it('can be initialized with factory', async () => {
  const newService = new InterpreterService();
  
  // Create mock factory
  const mockFactory = {
    getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
  } as unknown as DirectiveServiceClientFactory;
  
  // Initialize with factory
  newService.initialize(mockFactory, mockStateService);
  
  // Verify service is initialized
  expect(newService).toBeDefined();
  
  // Test basic functionality to ensure initialization worked
  const textNode = { type: 'Text', content: 'Test' } as TextNode;
  await newService.interpret([textNode]);
  expect(mockStateService.addNode).toHaveBeenCalled();
});
```

### 6. Update Test File Header

Add a header to document migration status:

```typescript
/**
 * InterpreterService Unit Test Status
 * ----------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standard mock factories
 * - Factory pattern for service resolution
 * 
 * COMPLETED:
 * - Using TestContextDI for test environment setup
 * - Using standardized mock factories for service mocks
 * - Adding proper cleanup for container management
 * - Proper handling of DirectiveServiceClientFactory
 */
```

## Testing Strategy

1. Update the test file according to the steps above
2. Run the test to identify any remaining issues
3. Fix any type errors or runtime errors
4. Ensure all tests pass without modifying the test logic
5. Verify that no regression is introduced 