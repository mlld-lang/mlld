# Phase 2: Test Infrastructure Enhancement

This phase focuses on improving the test infrastructure to better support both DI and non-DI modes, preparing for the incremental migration of services to DI-only mode.

## Objectives

1. Enhance TestContextDI to provide consistent behavior in both modes
2. Create utilities to aid in the migration of tests
3. Categorize tests by their DI dependency
4. Establish patterns for testing DI-compatible services

## Tasks

### 1. TestContextDI Enhancement

**Objective**: Improve TestContextDI to provide a consistent interface regardless of DI mode.

**Implementation**:
- [ ] Refactor TestContextDI to create proper DI container scopes
- [ ] Add helper methods for registering mocks and test services
- [ ] Ensure proper cleanup after tests
- [ ] Add better error messages for common DI setup issues
- [ ] Support both explicit and implicit service resolution

**Example Pattern**:
```typescript
// Create context with appropriate DI mode
let context = TestContextDI.create({ useDI: true });

// Register test-specific services
context.registerMock('IFileSystemService', mockFileSystem);

// Resolve service under test
let service = context.resolve('IServiceUnderTest');

// Test...

// Clean up
await context.cleanup();
```

**Success Criteria**:
- TestContextDI works consistently in both DI and non-DI modes
- Test setup is simpler and more maintainable
- Error messages clearly identify DI-related issues
- Service resolution works predictably

### 2. Test Migration Utilities

**Objective**: Create utilities to help migrate tests to support DI.

**Implementation**:
- [ ] Create a TestServiceResolver utility for obtaining services in both modes
- [ ] Add helper functions for creating mock services compatible with DI
- [ ] Build utilities for test isolation with child containers
- [ ] Add diagnostic tools for container configuration

**Example Pattern**:
```typescript
// Helper function for tests:
function getService<T>(context: TestContextDI, token: string, fallback?: new () => T): T {
  if (context.useDI) {
    return context.container.resolve<T>(token);
  } else {
    return fallback ? new fallback() : null;
  }
}
```

**Success Criteria**:
- Test migration utilities make it easier to update tests
- Helper functions reduce boilerplate code
- Diagnostic tools help identify DI configuration issues

### 3. Test Categorization

**Objective**: Identify which tests depend on non-DI mode and categorize them.

**Implementation**:
- [ ] Analyze the test suite to identify patterns of DI dependency
- [ ] Create a catalog of tests categorized by migration difficulty
- [ ] Identify tests that can be easily updated vs. those requiring more work
- [ ] Prioritize tests for incremental migration

**Success Criteria**:
- Clear understanding of which tests depend on non-DI mode
- Prioritized list of tests to update
- Migration path for complex tests

### 4. Testing Patterns for DI

**Objective**: Establish consistent patterns for testing services with DI.

**Implementation**:
- [ ] Create example tests for services with dependencies
- [ ] Document patterns for mocking dependencies
- [ ] Establish conventions for test container setup
- [ ] Create patterns for testing circular dependencies

**Example Pattern**:
```typescript
describe('ServiceName', () => {
  // Define tests for both DI and non-DI modes
  describe.each([
    { useDI: true, name: 'with DI' },
    { useDI: false, name: 'without DI' },
  ])('$name', ({ useDI }) => {
    let context: TestContextDI;
    let service: IServiceName;

    beforeEach(() => {
      // Create test context with appropriate DI setting
      context = TestContextDI.create({ useDI });
      
      // Register mocks
      context.registerMock('IDependencyService', mockDependency);
      
      // Get service instance
      service = context.resolve<IServiceName>('IServiceName');
    });

    afterEach(async () => {
      await context.cleanup();
    });

    // Tests that work in both modes...
  });
});
```

**Success Criteria**:
- Consistent testing patterns across the codebase
- Tests that work with both DI and non-DI modes
- Clear documentation of test patterns

## Current Status

- Initial TestContextDI implementation exists but has limitations
- Some services have been tested with DI but inconsistently
- No formal categorization of tests by DI dependency
- Limited documentation of testing patterns for DI

## Next Steps

1. Begin with TestContextDI enhancement to provide a solid foundation
2. Create test migration utilities to aid in the process
3. Begin categorizing tests based on DI dependency
4. Establish and document testing patterns

## Related Documents

- [Service Initialization Patterns](../reference/service-initialization-patterns.md)
- [DI Documentation](../reference/di-documentation.md) 