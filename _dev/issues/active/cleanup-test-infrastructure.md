# Test Infrastructure Simplification

This document details the plan for Phase 2 of the DI cleanup initiative: simplifying and standardizing the test infrastructure to use a DI-only approach.

## Current Issues

1. **Dual-Mode Support**: The test infrastructure currently supports both DI and non-DI modes, creating unnecessary complexity and maintenance burden.

2. **Container State Leakage**: Test containers aren't always properly isolated, leading to potential state leakage between tests.

3. **Class Identity Issues**: Mock objects don't properly pass `instanceof` checks, causing test failures, particularly with error classes.

4. **Boilerplate Code**: Creating and configuring tests requires verbose boilerplate code.

5. **Inconsistent Cleanup**: Resources aren't consistently cleaned up between tests, which can lead to memory leaks and test interference.

## Completed Work

1. **vitest-mock-extended Implementation**: 
   - ✅ Added vitest-mock-extended package 
   - ✅ Created utility functions for maintaining proper prototype chains
   - ✅ Implemented for PathValidationError class
   - ✅ Updated TestContextDI to use new error factories
   - ✅ Fixed all PathService tests

2. **Documentation**:
   - ✅ Updated TESTS.md with DI-only approach guidance
   - ✅ Added sections on vitest-mock-extended usage
   - ✅ Provided examples for proper container management

## Remaining Work

### 1. Remove Dual-Mode Support in Test Utilities

- [ ] Remove `static withDI()` and `static withoutDI()` methods from TestContextDI
- [ ] Update TestContextDI constructor to always use DI mode
- [ ] Remove conditional checks related to useDI throughout TestContextDI
- [ ] Deprecate any remaining dual-mode utility functions
- [ ] Create migration guide for tests still using dual-mode pattern

### 2. Update All Tests to Use DI-Only Approach

- [ ] Identify all tests using `.each([{ useDI: true }, { useDI: false }])` pattern
- [ ] Convert identified tests to use `TestContextDI.create()` exclusively
- [ ] Remove duplicate test cases for DI and non-DI modes
- [ ] Verify all tests pass with the updated patterns

### 3. Extend vitest-mock-extended to All Error Classes

- [ ] Identify all error classes that need `instanceof` checks in tests
- [ ] Create error factory functions for each identified error class:
   - [ ] MeldError base class
   - [ ] MeldDirectiveError
   - [ ] MeldParseError
   - [ ] ResolutionError
   - [ ] Other specialized error classes
- [ ] Update mock implementations in TestContextDI to use these factory functions
- [ ] Verify all error-related tests pass with the new approach

### 4. Improve Container Isolation and Management

- [ ] Enhance TestContainerHelper to focus on isolated container creation
- [ ] Implement aggressive container reset between tests
- [ ] Add diagnostic tools for detecting container state leaks
- [ ] Create helper methods for common container configuration patterns
- [ ] Improve cleanup to properly release all resources

### 5. Optimize Test Setup and Teardown

- [ ] Create streamlined setup patterns for common test scenarios
- [ ] Add automatic cleanup registration to ensure resources are released
- [ ] Reduce boilerplate in test beforeEach/afterEach blocks
- [ ] Create factory functions for common test data and service configurations
- [ ] Add performance benchmarks to ensure test runtime doesn't regress

## Implementation Guidelines

### Container Management

```typescript
// Preferred pattern for test setup
describe('ServiceName', () => {
  let context: TestContextDI;
  let service: IServiceName;
  
  beforeEach(() => {
    // Create isolated container
    context = TestContextDI.create();
    
    // Register mocks
    context.registerMock('IDependencyService', mockDependency);
    
    // Get service from container
    service = context.container.resolve('IServiceName');
  });
  
  afterEach(async () => {
    // IMPORTANT: Always clean up
    await context.cleanup();
  });
  
  // Tests...
});
```

### Error Mocking with vitest-mock-extended

```typescript
// Create factory function for each error class
export function createCustomError(
  message: string,
  details: ErrorDetails
): CustomError {
  const error = mockWithPrototype(CustomError);
  
  Object.defineProperties(error, {
    message: { value: message, writable: true, configurable: true },
    name: { value: 'CustomError', writable: true, configurable: true },
    // Add other properties based on the error class
    details: { value: details, writable: true, configurable: true }
  });
  
  return error;
}
```

### Test Migration Process

1. Find all test files using dual-mode pattern
2. For each file:
   - Remove `.each([{ useDI: true }, { useDI: false }])` structure
   - Update to use `TestContextDI.create()`
   - Remove conditional DI checks
   - Add proper cleanup
   - Verify tests pass

## Success Criteria

- ✅ All tests pass with DI-only mode
- ✅ No references to useDI remain in the codebase
- ✅ Test runtime is maintained or improved
- ✅ Mock objects properly pass instanceof checks
- ✅ Container state is properly isolated between tests
- ✅ Documentation in TESTS.md reflects the new patterns
- ✅ Test boilerplate is significantly reduced

## References

- [TESTS.md](docs/dev/TESTS.md) - Updated testing documentation
- [DI.md](docs/dev/DI.md) - Dependency Injection documentation
- [phase2-pathservice-instanceof-tests.md](./_dev/issues/active/phase2-pathservice-instanceof-tests.md) - Analysis of the instanceof issue 