# Phase 1: Foundation and Cleanup

This phase focuses on creating the foundation for the TSyringe migration by cleaning up existing code without breaking functionality. These tasks can be implemented while preserving the dual-mode system.

## Objectives

1. Create standardized path normalization utilities
2. Simplify service constructors while preserving dual-mode support
3. Improve documentation
4. Enhance test helpers

## Tasks

### 1. Path Normalization (Partially Completed)

**Objective**: Create a standardized approach to path handling across the codebase.

**Implementation**:
- ✅ Create a `normalizeMeldPath` utility in PathOperationsService
- ✅ Implement consistent rules (forward slashes, absolute paths, no trailing slashes)
- ✅ Add it to TestSnapshot for path comparisons
- ⬜ Apply it consistently to all path-handling services
- ⬜ Document the path format standards

**Success Criteria**:
- Path handling is consistent and robust across the codebase
- TestSnapshot comparisons work correctly with the normalized paths
- Services that handle paths use the standardized utility

### 2. Constructor Simplification (In Progress)

**Objective**: Refactor service constructors to be more readable while preserving dual-mode functionality.

**Implementation**:
- ✅ Refactor StateService constructor
- ✅ Refactor ResolutionService constructor
- ⬜ Refactor OutputService constructor
- ⬜ Refactor FileSystemService constructor
- ⬜ Refactor DirectiveService constructor
- ⬜ Refactor remaining service constructors

**Pattern to Follow**:
```typescript
constructor(
  @inject(SomeFactory) factory?: SomeFactory,
  @inject('IDependency') dependency?: IDependency
) {
  this.initializeFromParams(factory, dependency);
}

private initializeFromParams(factory?: SomeFactory, dependency?: IDependency): void {
  if (factory) {
    // DI mode initialization
    this.initializeDIMode(factory, dependency);
  } else {
    // Legacy mode initialization
    this.initializeLegacyMode(dependency);
  }
}
```

**Success Criteria**:
- Constructors are simplified and easier to understand
- Dual-mode functionality is preserved
- Tests continue to pass
- Code is better documented

### 3. Documentation (Partially Completed)

**Objective**: Create comprehensive documentation for the DI system.

**Implementation**:
- ✅ Document initialization patterns in service-initialization-patterns.md
- ✅ Document constructor simplification approach
- ⬜ Create DI best practices guide
- ⬜ Add examples of common DI patterns
- ⬜ Update architecture documentation

**Success Criteria**:
- Documentation clearly explains DI concepts
- Examples demonstrate proper usage
- Migration strategy is well-documented

### 4. Test Helper Improvement (Not Started)

**Objective**: Enhance test utilities to better support both DI and non-DI modes.

**Implementation**:
- ⬜ Enhance TestContextDI to better handle both modes
- ⬜ Add utilities for normalizing paths in tests
- ⬜ Improve error messages for common test setup issues

**Success Criteria**:
- Test utilities work consistently in both modes
- Error messages are clear and helpful
- Path normalization is properly applied in tests

## Current Status

- Path normalization utilities have been created but not consistently applied
- Constructor simplification has begun with StateService and ResolutionService
- Basic documentation has been created but needs expansion
- Test helper improvements have not yet started

## Next Steps

1. Complete the constructor simplification for OutputService
2. Begin implementing test helper improvements
3. Expand documentation with more examples
4. Apply path normalization more consistently

## Related Documents

- [Constructor Simplification](../reference/constructor-simplification.md)
- [Service Initialization Patterns](../reference/service-initialization-patterns.md)
- [Path Normalization](../reference/path-normalization.md) 