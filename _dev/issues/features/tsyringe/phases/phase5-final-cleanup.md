# Phase 5: Final Cleanup

This phase focuses on removing dual-mode support entirely and cleaning up the codebase after all services and tests have been migrated to DI-only mode.

## Objectives

1. Remove dual-mode support from all services
2. Simplify service constructors further
3. Remove legacy initialization methods
4. Update documentation to reflect DI-only approach

## Tasks

### 1. Remove Dual-Mode Support

**Objective**: Remove all conditional logic related to DI/non-DI mode.

**Implementation**:
- [ ] Modify `shouldUseDI()` to always return true (unconditionally)
- [ ] Remove the `MIGRATE_TO_DI_ONLY` flag
- [ ] Remove all conditional branches for DI/non-DI mode
- [ ] Remove legacy initialization patterns

**Example Implementation**:
```typescript
// Before
export const shouldUseDI = (): boolean => {
  // Check for the migration flag first
  if (process.env.MIGRATE_TO_DI_ONLY === 'true') {
    return true;
  }
  // Otherwise use the existing logic
  return process.env.USE_DI === 'true';
};

// After
export const shouldUseDI = (): boolean => {
  return true; // Always use DI
};
```

**Success Criteria**:
- All services work correctly in DI-only mode
- All tests pass with DI-only mode
- No conditional logic for DI/non-DI mode remains

### 2. Simplify Service Constructors

**Objective**: Refactor service constructors to be simpler now that only DI mode is supported.

**Implementation**:
- [ ] Remove complex initialization methods
- [ ] Simplify constructor parameters (no more optional dependencies)
- [ ] Remove initialization branching logic
- [ ] Update parameter types to be non-optional where appropriate

**Example Implementation**:
```typescript
// Before
@Service()
export class SomeService implements ISomeService {
  constructor(@inject('IDependency') dependency?: IDependency) {
    this.initializeFromParams(dependency);
  }

  private initializeFromParams(dependency?: IDependency): void {
    if (dependency) {
      // DI mode
      this.initializeDIMode(dependency);
    } else {
      // Legacy mode
      this.initializeLegacyMode();
    }
  }

  private initializeDIMode(dependency: IDependency): void {
    this.dependency = dependency;
  }

  private initializeLegacyMode(): void {
    this.dependency = new Dependency();
  }
}

// After
@Service()
export class SomeService implements ISomeService {
  constructor(@inject('IDependency') private dependency: IDependency) {
    // No initialization logic needed, dependency is injected
  }
}
```

**Success Criteria**:
- Service constructors are simple and clear
- No unnecessary initialization logic
- Code is more maintainable and easier to understand

### 3. Remove Legacy Initialization Methods

**Objective**: Remove any remaining legacy initialization methods.

**Implementation**:
- [ ] Remove `initialize()` methods that were used for non-DI mode
- [ ] Replace with factory methods for special initialization cases
- [ ] Update any code that calls these methods
- [ ] Ensure services are fully initialized by their constructors

**Example Implementation**:
```typescript
// Before
@Service()
export class SomeService implements ISomeService {
  constructor(@inject('IDependency') dependency?: IDependency) {
    if (dependency) {
      this.dependency = dependency;
    }
  }

  // Legacy initialization method
  initialize(dependency?: IDependency): void {
    if (dependency) {
      this.dependency = dependency;
    } else {
      this.dependency = new Dependency();
    }
  }
}

// After
@Service()
export class SomeService implements ISomeService {
  constructor(@inject('IDependency') private dependency: IDependency) {
    // Constructor fully initializes the service
  }

  // Factory method for special cases
  static createWithCustomConfig(config: any): SomeService {
    const dependency = new CustomDependency(config);
    return container.resolve(SomeService);
  }
}
```

**Success Criteria**:
- No more `initialize()` methods for basic initialization
- Services are fully initialized by their constructors
- Factory methods are used for special cases
- Code is more maintainable and follows DI principles

### 4. Update Documentation

**Objective**: Update all documentation to reflect the DI-only approach.

**Implementation**:
- [ ] Update the architecture documentation with DI patterns
- [ ] Remove references to dual-mode support
- [ ] Create comprehensive DI usage guide
- [ ] Document patterns for testing with DI
- [ ] Add examples of common DI patterns

**Success Criteria**:
- Documentation clearly explains DI concepts
- Examples demonstrate proper usage
- No references to dual-mode remain
- New developers can easily understand the DI approach

### 5. Final Verification

**Objective**: Verify that the codebase works correctly with DI-only mode.

**Implementation**:
- [ ] Run comprehensive test suite
- [ ] Check for any remaining dual-mode code
- [ ] Verify performance and memory usage
- [ ] Ensure all edge cases are handled

**Success Criteria**:
- All tests pass
- No dual-mode code remains
- Performance is satisfactory
- All edge cases are handled correctly

## Current Status

- Dual-mode support is still present throughout the codebase
- Many services have complex initialization logic
- Legacy `initialize()` methods are still used
- Documentation references both DI and non-DI approaches

## Next Steps

1. Ensure all tests can run in DI-only mode before starting this phase
2. Begin by updating `shouldUseDI()` to always return true
3. Simplify service constructors one at a time
4. Remove legacy initialization methods
5. Update documentation
6. Perform final verification

## Related Documents

- [Service Initialization Patterns](../reference/service-initialization-patterns.md)
- [DI Documentation](../reference/di-documentation.md) 