# Testing Standards and Best Practices

This document outlines the standard patterns and best practices for testing in the Meld codebase.

## Test Setup

### Using TestContextDI

All tests should use `TestContextDI` for setup:

```typescript
import { TestContextDI } from '@tests/utils/di';

describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(async () => {
    // Create an isolated test context
    context = TestContextDI.createIsolated();
  });
  
  afterEach(async () => {
    // Clean up resources
    await context?.cleanup();
  });
  
  it('should do something', async () => {
    // Register mocks
    context.registerMock('IMyService', mockService);
    
    // Resolve service
    const service = await context.resolve('IMyService');
    
    // Test implementation
    const result = await service.doSomething();
    expect(result).toBe('expected');
  });
});
```

### Service Resolution

Always use async resolution:

```typescript
// CORRECT
const service = await context.resolve<IMyService>('IMyService');

// INCORRECT - Don't use synchronous resolution
const service = context.resolveSync<IMyService>('IMyService');
```

### Mock Registration

Register mocks using the test context:

```typescript
// Register a mock implementation
context.registerMock('IMyService', {
  doSomething: vi.fn().mockReturnValue('mocked result')
});

// Or use the mock helpers
import { createServiceMock } from '@tests/utils/di';
const mockService = createServiceMock();
context.registerMock('IMyService', mockService);
```

### Error Testing

Use the error testing utilities:

```typescript
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils';

it('should handle errors', async () => {
  await expectToThrowWithConfig(async () => {
    await service.methodThatThrows();
  }, {
    errorType: MeldError,
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Expected error message'
  });
});
```

## Best Practices

1. **Use Isolated Containers**: Always use `TestContextDI.createIsolated()` for test setup to prevent test interference.

2. **Proper Cleanup**: Always clean up test contexts in `afterEach` blocks:
   ```typescript
   afterEach(async () => {
     await context?.cleanup();
   });
   ```

3. **Async Resolution**: Always use async/await with `context.resolve()`:
   ```typescript
   const service = await context.resolve<IMyService>('IMyService');
   ```

4. **Mock Registration**: Register mocks before resolving services that depend on them:
   ```typescript
   context.registerMock('IDependency', mockDependency);
   const service = await context.resolve('IService');
   ```

5. **Error Handling**: Use the error testing utilities for consistent error validation:
   ```typescript
   await expectToThrowWithConfig(async () => {
     await service.method();
   }, expectedError);
   ```

## Common Patterns

### Directive Handler Testing

```typescript
import { TestHelpers } from '@tests/utils/di';

describe('MyDirectiveHandler', () => {
  const { context, handler, stateService } = TestHelpers.setupDirectiveTest({
    execute: vi.fn()
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  it('should handle directive', async () => {
    const node = { type: 'directive', value: 'test' };
    await handler.execute(node, stateService);
    // Test assertions...
  });
});
```

### Service Testing

```typescript
import { TestHelpers } from '@tests/utils/di';

describe('MyService', () => {
  const testSetup = TestHelpers.createTestSetup({
    isolatedContainer: true,
    mocks: {
      'IDependency': {
        method: vi.fn()
      }
    }
  });
  
  let context: TestContextDI;
  
  beforeEach(() => {
    context = testSetup.setup();
  });
  
  afterEach(async () => {
    await testSetup.cleanup();
  });
  
  it('should work with dependencies', async () => {
    const service = await context.resolve<IMyService>('IMyService');
    // Test implementation...
  });
});
```

### Container Leak Detection

Enable leak detection in tests that create many services:

```typescript
const context = TestContextDI.create({ leakDetection: true });

// Get diagnostic information
const report = context.createDiagnosticReport();
expect(report.leakDetection.enabled).toBe(true);
```

## Migration Checklist

When migrating existing tests:

1. ✅ Replace `new TestContext()` with `TestContextDI.createIsolated()`
2. ✅ Update imports to use `@tests/utils/di`
3. ✅ Replace direct service creation with container resolution
4. ✅ Add proper async/await for service resolution
5. ✅ Add proper cleanup in afterEach blocks
6. ✅ Update error testing to use `expectToThrowWithConfig`
7. ✅ Replace manual mocking with `registerMock`

## Known Issues & Troubleshooting

### Console Logging in Tests

**Issue:** Standard `console.log`, `console.warn`, etc., calls may be suppressed in the test environment output, even when using flags like `--disable-console-intercept` or `--silent=false`. The exact cause in this project setup is unclear but seems related to the Vitest environment or configuration.

**Workaround:** For temporary debugging output within tests or mocks, use `process.stdout.write('My debug message\n');` or `process.stderr.write('My error message\n');`. Remember to include the newline character (`\n`) manually.

**Note:** Remove these `stdout/stderr.write` calls once debugging is complete.

### Async Mock Rejections

**Issue:** There have been observed difficulties with standard Vitest `expect().rejects` assertions reliably detecting promise rejections originating from async mock implementations, particularly when using `mockImplementation` returning `Promise.reject` or even `vi.spyOn().mockRejectedValueOnce()`. The promise may incorrectly resolve instead.

**Solution:** Adhere strictly to the project's standard error testing utility: **`expectToThrowWithConfig`** (from `@tests/utils/errorTestUtils.js`). This utility appears to handle async rejections more reliably in our test environment.

**Consequences of Deviation:** Using `expect().rejects` or other non-standard methods for asserting async rejections may lead to tests that incorrectly pass when they should fail, or fail unpredictably due to issues with rejection propagation in the test framework.
