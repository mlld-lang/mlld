# Testing with DI: Patterns and Best Practices

This document outlines recommended patterns for testing with dependency injection in the Meld codebase.

## Core Testing Utilities

### TestContextDI

The `TestContextDI` class provides a consistent interface for setting up test environments with or without DI:

```typescript
// Create a test context with DI enabled
const context = TestContextDI.withDI();

// Create a test context without DI
const context = TestContextDI.withoutDI();

// Or explicitly specify the mode
const context = TestContextDI.create({ useDI: true });
```

### Service Resolution

```typescript
// Get a service instance with the appropriate resolution strategy
const service = context.resolve<IMyService>('IMyService');

// Register a mock implementation
context.registerMock('IDependencyService', mockImplementation);

// Clean up after test
await context.cleanup();
```

### TestServiceUtilities

This utility class provides helper methods for working with services in both DI and non-DI modes:

```typescript
import { TestServiceUtilities } from '../../utils/di';

// Get a service with fallback for non-DI mode
const service = TestServiceUtilities.getService<IMyService>(
  context,
  'IMyService',
  () => new MyService() // Fallback factory for non-DI mode
);

// Register a mock that works in both modes
TestServiceUtilities.registerMock(
  context,
  'IMyDependency',
  mockDependency
);
```

## Testing with Circular Dependencies

When testing services that may have circular dependencies, use the `CircularDependencyTestHelper`:

```typescript
import { CircularDependencyTestHelper } from '../../utils/di';

// Set up a test container with circular dependencies
const container = CircularDependencyTestHelper.createCircularContainer();

// Test handling of circular dependencies
try {
  CircularDependencyTestHelper.createDependencyCycle(container);
} catch (error) {
  // Expect appropriate error handling
}

// For safe lazy circular references
CircularDependencyTestHelper.setupSafeLazyCircularDependencies(container);
const success = CircularDependencyTestHelper.testLazyCircularDependencies(container);
```

## Parameterized Testing (Both DI Modes)

To ensure services work correctly in both DI and non-DI modes:

```typescript
describe('MyService', () => {
  describe.each([
    { useDI: true, name: 'with DI' },
    { useDI: false, name: 'without DI' },
  ])('$name', ({ useDI }) => {
    let context: TestContextDI;
    let service: IMyService;

    beforeEach(() => {
      context = TestContextDI.create({ useDI });
      service = context.resolve<IMyService>('IMyService');
    });

    afterEach(async () => {
      await context.cleanup();
    });

    // Tests that work in both modes...
  });
});
```

## Mocking Dependencies

For consistent mocking across both modes:

```typescript
// Create mock that works in both modes
const mockDependency = TestServiceUtilities.createMockService({
  methodA: vi.fn().mockReturnValue('test'),
  methodB: vi.fn().mockResolvedValue(true)
});

// Register it consistently
context.registerMock('IDependency', mockDependency);
```

## Testing Factory Functions

When testing services that use factory functions:

```typescript
// Register a factory function
context.container.register('IFactoryService', {
  useFactory: (c) => {
    const dependency = c.resolve('IDependency');
    return new FactoryService(dependency);
  }
});

// Resolve and test
const service = context.resolve<IFactoryService>('IFactoryService');
```

## Child Containers for Test Isolation

To prevent test interference:

```typescript
// Create isolated child container
const childContext = context.createChildContext();

// Register test-specific overrides
childContext.registerMock('IService', testSpecificMock);

// Use the child context for this test
const service = childContext.resolve<IMyService>('IMyService');

// Clean up both contexts
await childContext.cleanup();
await context.cleanup();
```

## Example Test Implementation

Here's a complete example showing recommended patterns:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI, TestServiceUtilities } from '../../utils/di';
import { IMyService } from './IMyService';
import { MyService } from './MyService';
import { IDependency } from '../dependencies/IDependency';

describe('MyService', () => {
  describe.each([
    { useDI: true, name: 'with DI' },
    { useDI: false, name: 'without DI' },
  ])('$name', ({ useDI }) => {
    let context: TestContextDI;
    let service: IMyService;
    let mockDependency: IDependency;

    beforeEach(() => {
      // Set up context
      context = TestContextDI.create({ useDI });
      
      // Create mock dependency
      mockDependency = TestServiceUtilities.createMockService<IDependency>({
        getData: vi.fn().mockReturnValue('test data'),
        processRequest: vi.fn().mockResolvedValue({ success: true })
      });
      
      // Register mocks
      context.registerMock('IDependency', mockDependency);
      
      // Resolve service under test
      service = context.resolve<IMyService>('IMyService');
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it('should retrieve data from dependency', () => {
      const result = service.getData();
      expect(result).toBe('test data');
      expect(mockDependency.getData).toHaveBeenCalled();
    });

    it('should process requests asynchronously', async () => {
      const result = await service.processRequest({ id: '123' });
      expect(result.success).toBe(true);
      expect(mockDependency.processRequest).toHaveBeenCalledWith({ id: '123' });
    });
  });
});
```

## Dealing with Complex Initialization

For services with complex initialization requirements:

```typescript
// Handle async initialization
beforeEach(async () => {
  context = TestContextDI.create({ useDI });
  context.registerMock('IDependency', mockDependency);
  
  service = context.resolve<IMyService>('IMyService');
  await service.initialize(); // Call explicit initialize method if needed
});
```

## Testing Error Scenarios

For testing error handling:

```typescript
it('should handle dependency errors gracefully', async () => {
  // Set up error scenario
  mockDependency.processRequest.mockRejectedValue(new Error('Test error'));
  
  // Expect service to handle the error appropriately
  await expect(service.safeProcessRequest({ id: '123' }))
    .resolves.toEqual({ success: false, error: 'Test error' });
});
```