# Testing Standards and Best Practices

This document outlines the standard patterns and best practices for testing in the Meld codebase.

## Test Setup Strategies

Two primary strategies exist for setting up DI containers in tests:

1.  **`TestContextDI`:** Convenient for simple unit tests or when only basic fixture loading and mock FS are needed. It handles some registrations automatically but can sometimes hide complex DI resolution issues.
2.  **Manual Child Container:** Recommended for integration tests or complex unit tests involving multiple services, factories, or potential DI cycles. Provides explicit control over registrations and mimics application behavior more closely.

### Using `TestContextDI` (for Simple Cases)

Use `TestContextDI` for basic setup and potentially simple mocking:

```typescript
import { TestContextDI } from '@tests/utils/di';

describe('MySimpleService', () => {
  let context: TestContextDI;
  
  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    // await context.initialize(); // Only if using context.fs or context.fixtures
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  it('should do something', async () => {
    // Register MOCKS using TestContextDI
    const mockDep = { someMethod: vi.fn() };
    context.registerMock('IDependency', mockDep);
    
    // Register the REAL service implementation (if not already globally registered)
    context.container.register('IMySimpleService', { useClass: MySimpleService });

    // Resolve service
    const service = await context.resolve('IMySimpleService');
    
    // Test implementation...
  });
});
```

### Using a Manual Child Container (Recommended for Complex Tests)

This approach offers more control and transparency for integration tests or services with complex dependencies.

```typescript
import { TestContextDI } from '@tests/utils/di'; // Still useful for fixtures/FS
import { container, type DependencyContainer } from 'tsyringe';
import { vi } from 'vitest';
// Import necessary services, interfaces, factories, mocks...
import { MyService } from '@services/MyService.js';
import type { IMyService } from '@services/IMyService.js';
import { MyDependencyFactory } from '@services/MyDependencyFactory.js';
import type { IMyDependency } from '@services/IMyDependency.js';
import type { IFileSystem } from '@services/fs/IFileSystem.js';

describe('MyService Integration', () => {
  let context: TestContextDI; // For fixtures/FS access
  let testContainer: DependencyContainer; // Our manual container
  let myService: IMyService;
  let mockDependency: IMyDependency;

  beforeEach(async () => {
    // 1. Setup TestContextDI *only* for FS/Fixtures if needed
    context = TestContextDI.createIsolated();
    await context.initialize(); // Creates context.fs

    // 2. Create the manual child container
    testContainer = container.createChildContainer();

    // 3. Create Mocks (Manual Objects Preferred)
    // Mock the dependency (manual object + spyOn)
    mockDependency = {
      someMethod: vi.fn(),
      // other methods/props...
    } as IMyDependency; 
    vi.spyOn(mockDependency, 'someMethod').mockResolvedValue('mocked value');

    // Mock the factory that creates the dependency (manual object + spyOn)
    const mockDependencyFactory = {
      create: vi.fn(),
      // other factory methods...
    } as unknown as MyDependencyFactory; // Use 'as unknown as' if needed
    vi.spyOn(mockDependencyFactory, 'create').mockReturnValue(mockDependency);

    // 4. Register Dependencies in Manual Container
    //    Order: Infrastructure -> Mocks -> Real Services
    
    // Register Infrastructure (e.g., mock FS from TestContextDI)
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    // Register other infrastructure mocks (like IURLContentResolver) if needed...

    // Register Mocks (using the correct token - Class vs. String)
    // Use the CLASS token for the factory registration
    testContainer.registerInstance(MyDependencyFactory, mockDependencyFactory); 
    // If MyService injected `IMyDependency` directly (not via factory), you would register the mock instance:
    // testContainer.registerInstance<IMyDependency>('IMyDependency', mockDependency);

    // Register REAL Service Implementation(s)
    testContainer.register('IMyService', { useClass: MyService });
    // Register other real services needed by MyService if they aren't globally registered

    // 5. Resolve the Top-Level Service Under Test
    myService = testContainer.resolve<IMyService>('IMyService');
  });

  afterEach(async () => {
    // Clean up the manual container *first*
    testContainer?.clearInstances();
    // Then cleanup TestContextDI if used
    await context?.cleanup();
  });

  it('should interact with its dependency', async () => {
    const result = await myService.callDependencyMethod();
    expect(mockDependencyFactory.create).toHaveBeenCalled(); // Verify factory was used
    expect(mockDependency.someMethod).toHaveBeenCalled(); // Verify dependency method was called
    expect(result).toBe('mocked value');
  });
});
```

## Service Resolution

Always use async resolution from the appropriate container (`context` or `testContainer`). Note: `resolve` itself is synchronous, but the setup (`initialize`) might be async.

```typescript
// Using TestContextDI
const service = context.resolve<IMyService>('IMyService');

// Using Manual Child Container (after async setup in beforeEach)
const service = testContainer.resolve<IMyService>('IMyService');
```

## Dependency Registration and Mocking

Register dependencies explicitly in the test container (`context.container` or `testContainer`).

1.  **Token Matching:** The token used for registration (`register` or `registerInstance`) **must** match the token used in the `@inject()` decorator of the consuming service (Class vs. String). Mismatches cause the *real* dependency to be resolved instead of the mock.

2.  **Manual Mock Objects + `vi.spyOn` (Recommended):** Create plain JavaScript objects implementing the interface/class structure, using `vi.fn()` for methods. Add any required properties (even if `undefined`). Then, use `vi.spyOn()` on these manual objects. This avoids issues observed with `mock<T>()` from `vitest-mock-extended` where methods might not exist when `vi.spyOn` is called.

    ```typescript
    // Manual Mock Object
    const manualMock = {
      methodToSpyOn: vi.fn(),
      requiredProperty: undefined // Add properties required by the type
    } as unknown as IMyDependency; // Cast if needed

    // Spy on the method AFTER creating the object
    vi.spyOn(manualMock, 'methodToSpyOn').mockResolvedValue('Success');

    // Register the instance
    testContainer.registerInstance<IMyDependency>('IMyDependency', manualMock);
    ```

3.  **Registering Real Services:** For the service under test, or dependencies you want to use the real implementation for, register the class:

    ```typescript
    import { MyService } from '@services/MyService.js';
    
    testContainer.register('IMyService', { useClass: MyService });
    ```

4.  **Registering Infrastructure Mocks:** Common mocks like `IFileSystem` are often needed by real services. Obtain these from `TestContextDI` (if used) or create/register them manually.

    ```typescript
    // Get from TestContextDI (after await context.initialize())
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    ```

5.  **Asserting Mock Calls:** Prefer asserting that mock methods were called (`toHaveBeenCalled`, `toHaveBeenCalledWith`) over asserting side effects in state, especially when dealing with complex state logic or potential cloning issues.

## Error Testing

Use the error testing utilities:

```typescript
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils';

it('should handle errors', async () => {
  // Assuming 'myService' was resolved in beforeEach
  await expectToThrowWithConfig(async () => {
    await myService.methodThatThrows();
  }, {
    errorType: MeldError, // Or specific MeldXxxError
    code: 'EXPECTED_CODE', // Use specific error code string
    message: /optional regex message pattern/ // Optional: Check message contains/matches
  });
});
```

## Best Practices

1.  **Prefer Manual Child Containers**: Use `container.createChildContainer()` for integration tests or complex unit tests for better control and clarity. Use `TestContextDI` judiciously for simple cases or fixture/FS management.
2.  **Explicit Dependency Registration**: Register mocks, real services, and infrastructure dependencies explicitly in the relevant test container.
3.  **Verify Token Matching**: Ensure registration tokens (Class vs. String) match injection tokens.
4.  **Use Manual Mock Objects + `vi.spyOn`**: Create mock objects manually before spying/configuring methods with `vi.spyOn` for reliability.
5.  **Mock Direct Dependencies**: For unit/integration tests, aim to mock the direct dependencies of the service under test (unless testing the integration requires the real dependency).
6.  **Proper Cleanup**: Always clean up the `testContainer` (using `clearInstances`) and `context` (using `cleanup`) in `afterEach` blocks, typically cleaning the testContainer first.
7.  **Assert Mock Calls**: Prefer asserting mock interactions (`toHaveBeenCalledWith`, etc.) over state side-effects where state logic is complex or prone to test brittleness.
8.  **Error Handling**: Use the `expectToThrowWithConfig` utility for consistent error validation, especially for async rejections.

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

## Checklist for Robust Tests

1. ✅ **Choose Container Strategy**: Use Manual Child Container for complex tests, `TestContextDI` for simple ones.
2. ✅ **Setup and Cleanup**: Initialize chosen container/context in `beforeEach`, clean up `testContainer` (`clearInstances`) and `context` (`cleanup`) in `afterEach`.
3. ✅ **Register Dependencies Explicitly**: Register mocks (factories, services), real services, and infrastructure (FS, URLResolver) needed for the test.
4. ✅ **Verify Token Matching**: Double-check registration tokens (Class vs. String) match `@inject` tokens.
5. ✅ **Use Reliable Mocking**: Prefer manual mock objects (`{ method: vi.fn() }`) + `vi.spyOn` over `mock<T>()`.
6. ✅ **Assert Mock Calls**: Favor `expect(mock.method).toHaveBeenCalledWith(...)` over checking resulting state values when possible.
7. ✅ **Error Testing**: Use `expectToThrowWithConfig` for errors, especially async rejections.

## Known Issues & Troubleshooting

### Console Logging in Tests

**Issue:** Standard `console.log`, `console.warn`, etc., calls may be suppressed in the test environment output, even when using flags like `--disable-console-intercept` or `--silent=false`. The exact cause in this project setup is unclear but seems related to the Vitest environment or configuration.

**Workaround:** For temporary debugging output within tests or mocks, use `process.stdout.write('My debug message\n');` or `process.stderr.write('My error message\n');`. Remember to include the newline character (`\n`) manually.

**Note:** Remove these `stdout/stderr.write` calls once debugging is complete.

### Async Mock Rejections

**Issue:** There have been observed difficulties with standard Vitest `expect().rejects` assertions reliably detecting promise rejections originating from async mock implementations, particularly when using `mockImplementation` returning `Promise.reject` or even `vi.spyOn().mockRejectedValueOnce()`. The promise may incorrectly resolve instead.

**Solution:** Adhere strictly to the project's standard error testing utility: **`expectToThrowWithConfig`** (from `@tests/utils/errorTestUtils.js`). This utility appears to handle async rejections more reliably in our test environment.

**Consequences of Deviation:** Using `expect().rejects` or other non-standard methods for asserting async rejections may lead to tests that incorrectly pass when they should fail, or fail unpredictably due to issues with rejection propagation in the test framework.
