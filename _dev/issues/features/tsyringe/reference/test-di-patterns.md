# Testing Patterns for DI in Meld

This document outlines the recommended patterns for testing with dependency injection (DI) in the Meld codebase.

## Setting Up Tests with TestContextDI

### Basic Test Setup

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di';

describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    // Create a test context with DI enabled
    context = TestContextDI.create({ useDI: true });
  });
  
  afterEach(async () => {
    // Clean up after each test
    await context.cleanup();
  });
  
  it('should do something', () => {
    // Get the service under test
    const service = context.resolve('MyService');
    
    // Test the service
    expect(service.doSomething()).toBe(true);
  });
});
```

### Testing in Both DI and Non-DI Modes

We recommend testing your services in both DI and non-DI modes to ensure compatibility during the transition period:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testInBothModes } from '@tests/utils/di';

testInBothModes('MyService', (context) => {
  // Get the service under test
  const service = context.resolve('MyService');
  
  // Test the service
  expect(service.doSomething()).toBe(true);
});
```

## Mocking Dependencies

### Registering Mock Services

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI, createServiceMock } from '@tests/utils/di';

describe('ServiceWithDependencies', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.create({ useDI: true });
    
    // Register mock dependencies
    context.registerMock('DependencyService', {
      doSomething: vi.fn().mockReturnValue(true)
    });
    
    // Alternative using the utility function
    createServiceMock(context, 'AnotherDependency', {
      getValue: vi.fn().mockReturnValue('test')
    });
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should use dependencies correctly', () => {
    // Get the service under test
    const service = context.resolve('ServiceWithDependencies');
    
    // Test the service
    expect(service.usesDependencies()).toBe(true);
  });
});
```

### Using Mock Service Classes

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di';
import { MockValidationService } from '@tests/utils/di/MockServices';

describe('ValidatingService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.create({ useDI: true });
    
    // Register a mock service class
    context.registerMockClass('ValidationService', MockValidationService);
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should validate correctly', () => {
    // Get mock to verify calls
    const mockValidation = context.resolve('ValidationService');
    
    // Get service under test
    const service = context.resolve('ValidatingService');
    
    // Test the service
    service.doValidation();
    
    // Verify the mock was called
    expect(mockValidation.validate).toHaveBeenCalled();
  });
});
```

## Managing Test Isolation

### Creating Isolated Test Containers

When you need to ensure complete isolation between tests:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di';

describe('IsolatedTests', () => {
  it('should run isolated test A', () => {
    // Create completely isolated context
    const contextA = TestContextDI.create({ 
      useDI: true, 
      isolatedContainer: true 
    });
    
    // Register mock for this test only
    contextA.registerMock('TestService', { value: 'A' });
    
    // Test with isolation
    expect(contextA.resolve('TestService').value).toBe('A');
    
    // Clean up
    contextA.cleanup();
  });
  
  it('should run isolated test B', () => {
    // Create another isolated context
    const contextB = TestContextDI.create({ 
      useDI: true, 
      isolatedContainer: true 
    });
    
    // Register different mock for this test
    contextB.registerMock('TestService', { value: 'B' });
    
    // Test with isolation
    expect(contextB.resolve('TestService').value).toBe('B');
    
    // Clean up
    contextB.cleanup();
  });
});
```

### Creating Child Contexts

When you need to create related contexts:

```typescript
import { describe, it, expect } from 'vitest';
import { TestContextDI } from '@tests/utils/di';

describe('ChildContexts', () => {
  it('should support child contexts', () => {
    // Create parent context
    const parent = TestContextDI.create({ useDI: true });
    
    // Register a service in parent
    parent.registerMock('ParentService', { value: 'parent' });
    
    // Create child context (inherits parent registrations)
    const child = parent.createChildScope();
    
    // Register a service only in child
    child.registerMock('ChildService', { value: 'child' });
    
    // Child can access parent registrations
    expect(child.resolve('ParentService').value).toBe('parent');
    
    // Parent cannot access child registrations
    expect(() => parent.resolve('ChildService')).toThrow();
    
    // Clean up (will clean up child contexts automatically)
    parent.cleanup();
  });
});
```

## Diagnostic Tools

When you encounter issues with DI in tests, use the diagnostic tools:

```typescript
import { describe, it } from 'vitest';
import { TestContextDI, createDiagnosticReport } from '@tests/utils/di';

describe('DiagnosticTools', () => {
  it('should provide diagnostic information', () => {
    const context = TestContextDI.create({ useDI: true });
    
    // Register some mocks
    context.registerMock('Service1', {});
    context.registerMock('Service2', {});
    
    // Generate a diagnostic report
    const report = createDiagnosticReport(context, {
      includeServices: true,
      includeMocks: true,
      includeContainerState: true
    });
    
    // Output or examine the report
    console.log(report);
    
    // Clean up
    context.cleanup();
  });
});
```

## Best Practices

1. **Always clean up**: Always call `context.cleanup()` after your tests to prevent memory leaks and test pollution.

2. **Prefer isolation**: Use isolated containers when tests might affect each other.

3. **Test both modes**: Use `testInBothModes` to ensure services work correctly in both DI and non-DI modes.

4. **Mock carefully**: Only mock the dependencies you need to test your service.

5. **Use diagnostic tools**: When you have DI-related issues, use diagnostic reports to understand the container state.

6. **Prefer helper methods**: Use utilities like `createServiceMock` and `getService` for consistency.

7. **Register interface tokens**: When registering a mock, consider if you need to register both class and interface tokens.

8. **Keep tests focused**: Each test should focus on a single aspect of a service.

By following these patterns, you'll ensure that your tests are reliable and maintainable during the migration to DI.