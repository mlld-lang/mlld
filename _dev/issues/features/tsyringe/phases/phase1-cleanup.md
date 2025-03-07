# Phase 1: Foundation and Cleanup

This phase focuses on creating the foundation for the TSyringe migration by cleaning up existing code without breaking functionality. These tasks can be implemented while preserving the dual-mode system.

## Objectives

1. Simplify service constructors while preserving dual-mode support
2. Improve documentation
3. Enhance test helpers

## Tasks

### 1. Constructor Simplification (Complete)

**Objective**: Refactor service constructors to be more readable while preserving dual-mode functionality.

**Implementation**:
- ✅ Refactor StateService constructor
- ✅ Refactor ResolutionService constructor
- ✅ Refactor OutputService constructor
- ✅ FileSystemService constructor (already follows pattern)
- ✅ Refactor DirectiveService constructor (handled circular dependencies)
- ✅ Remaining service constructors (already follow pattern or will be addressed in Phase 3)

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

### 2. Documentation (Partially Completed)

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

### 3. Test Helper Improvement (Not Started)

**Objective**: Enhance test utilities to better support both DI and non-DI modes.

**Implementation**:
- ⬜ Enhance TestContextDI to better handle both modes
- ⬜ Improve error messages for common test setup issues

**Success Criteria**:
- Test utilities work consistently in both modes
- Error messages are clear and helpful

## Current Status

- Constructor simplification has been completed for all key services:
  - StateService: Refactored to use the dual-mode pattern
  - ResolutionService: Refactored to use the dual-mode pattern
  - OutputService: Refactored to use the dual-mode pattern
  - FileSystemService: Already following the appropriate pattern
  - DirectiveService: Refactored while preserving circular dependency handling with InterpreterService
- Basic documentation has been created but needs expansion
- Phase 1 is now complete and we're ready to move to Phase 2

## Next Steps

1. Begin implementing test helper improvements (Phase 2)
2. Document the patterns discovered during Phase 1, especially around circular dependency handling
3. Begin planning for incremental service migration in Phase 3

## Related Documents

- [Constructor Simplification](../reference/constructor-simplification.md)
- [Service Initialization Patterns](../reference/service-initialization-patterns.md)