# TSyringe Dependency Injection Migration Plan

## Background

We previously attempted to refactor the Meld codebase to use TSyringe for dependency injection (DI). Although we successfully implemented much of the DI functionality, we encountered significant issues with test failures when updating the test infrastructure. The tsyringe branch currently has all tests failing (approximately 800 tests), which led to temporarily abandoning the branch and continuing development in the main branch without DI.

This document outlines a revised plan to complete the TSyringe migration with minimal risk and disruption to the codebase.

## Current Status

1. The `tsyringe` branch contains a partial implementation of DI with TSyringe:
   - A DI container configuration is in place (`core/di-config.ts`)
   - Services are registered with the DI container
   - Entry points (API and CLI) support DI
   - Circular dependencies are handled with `@delay` decorator
   - Backward compatibility is preserved with a feature flag

2. All tests on the branch are currently failing due to:
   - Issues with test infrastructure not being properly adapted for DI
   - Test mocks and fixtures not being updated to work with the new DI system
   - Cascading failures that spread across the test suite

3. The main branch has continued development without DI, creating divergence from the tsyringe branch.

## Migration Strategy

We need a phased approach where each phase must pass all tests before proceeding to the next phase. This will ensure stability throughout the migration process.

### Key Lessons from Previous Attempt

Based on our analysis of the previous attempt, we've identified these critical lessons:

1. **Test Infrastructure First**: The previous approach implemented DI in core services first, then tried to adapt tests later. This created cascading failures. The new approach will prioritize making the test infrastructure DI-aware first.

2. **Feature Flag Management**: The feature flag for DI must be comprehensive and consistent across all code paths, including tests.

3. **Incremental Changes**: We'll make smaller, focused changes that maintain test passing at each step, rather than large-scale refactoring.

4. **Clear Exit Criteria**: Each phase must have clear exit criteria focused on test pass rate.

### Phase 1: Assessment and Branch Reset

1. **Branch Reset**:
   - Identify the last stable commit in the tsyringe branch where DI was working but before test failures
   - Create a new branch from that commit to restart the migration
   - Verify that the core DI infrastructure is still intact at this point

2. **Analysis of Main Branch Changes**:
   - Identify all significant changes in the main branch since divergence
   - Create a merge plan for incorporating those changes into the new DI branch
   - Document any conflicts that will need special attention

3. **Test Infrastructure Assessment**:
   - Analyze the current test structure and identify all points where the DI system impacts tests
   - Create a comprehensive inventory of test helpers, mocks, and fixtures that need to be updated
   - Develop a specific plan for updating each test component

### Phase 2: Core DI Integration

1. **Merge Main Branch Changes**:
   - Carefully merge main branch changes into the new DI branch
   - Resolve conflicts with priority on maintaining DI infrastructure
   - Ensure all tests pass after the merge

2. **Consolidate DI Configuration**:
   - Update DI container configuration to reflect any new services added in main
   - Ensure all services are properly registered
   - Test core functionality with DI enabled

3. **Feature Flag Implementation**:
   - Implement robust feature flag for DI throughout the codebase
   - Ensure all code paths work with both DI enabled and disabled
   - Add tests to verify both paths function correctly

### Phase 3: Test Infrastructure Updates

1. **Test Context Adaptation**:
   - Update `TestContext` to support DI injection
   - Create mechanisms for both manual dependency injection and TSyringe-based injection
   - Ensure test setup/teardown patterns work with DI

2. **Mock Updates**:
   - Update all mock implementations to support DI
   - Create factory functions for generating DI-compatible test doubles
   - Ensure mocks can be registered with the DI container when needed

3. **Fixture Compatibility**:
   - Update test fixtures to work with DI services
   - Ensure `ProjectBuilder` and other test helpers support DI
   - Create DI-aware versions of all test utilities

### Phase 4: Test Migration

1. **Test Migration Planning**:
   - Categorize tests by complexity of DI impact
   - Create migration timeline with exit criteria for each test category
   - Develop rollback strategy if issues are encountered

2. **Incremental Test Migration**:
   - Start with simplest tests and gradually move to more complex ones
   - Update tests methodically, ensuring each passes before moving on
   - Document patterns and solutions for reuse across similar tests

3. **Integration Test Updates**:
   - Update end-to-end and integration tests to use DI
   - Verify pipeline flows correctly with DI enabled
   - Test edge cases specifically for DI-related behaviors

### Phase 5: Finalization

1. **Performance Testing**:
   - Benchmark DI vs. non-DI code paths
   - Optimize DI configuration if performance issues are identified
   - Document any performance considerations

2. **Feature Flag Removal**:
   - Once all tests pass, remove the feature flag
   - Clean up legacy initialization code
   - Remove redundant service provider adapter

3. **Documentation Update**:
   - Update architecture documentation to reflect DI implementation
   - Document DI patterns used in the codebase
   - Update contributor documentation with DI guidance

## Implementation Plan

Based on our analysis, we've developed a carefully phased implementation plan. Each phase is designed to be completable in a single coding session with clear exit criteria of all tests passing. The phases build upon each other incrementally while maintaining backward compatibility through the feature flag.

### Phase 1: Core DI Infrastructure Setup
**Goal**: Establish basic DI architecture without affecting existing functionality

**Steps**:
1. Create new branch from current main: `git checkout -b tsyringe-implementation`
2. Add tsyringe and reflect-metadata dependencies to package.json
3. Create core/di-config.ts with basic container setup and interface registrations
4. Create core/ServiceProvider.ts with feature flag toggle (USE_DI env var)
5. Add empty tsyringe service registrations for core services only
6. Add build system support for decorators in tsconfig.json

**Exit Criteria**: 
- All tests pass with USE_DI=false (unchanged behavior)
- Build succeeds with decorators enabled

### Phase 2: Service Decorator Implementation
**Goal**: Add injectable decorators to service classes without changing functionality

**Steps**:
1. Add @injectable() decorators to independent services first (PathService, ParserService)
2. Update ServiceProvider to support these services via DI when USE_DI=true
3. Add @injectable() to remaining services one class at a time
4. Update tsyringe container registrations for each service
5. Test each service with both USE_DI=true and USE_DI=false

**Exit Criteria**:
- All services have @injectable() decorators
- All tests pass with both USE_DI=true and USE_DI=false
- No functional changes to implementation

### Phase 3: Constructor Injection - Independent Services
**Goal**: Implement constructor injection for services without dependencies

**Steps**:
1. Identify services with no dependencies (PathOperationsService, StateEventService)
2. Update these services to support constructor injection
3. Update ServiceProvider to handle instantiation via container
4. Add token registrations to di-config.ts for each service
5. Adjust any tests that directly instantiate these services

**Exit Criteria**:
- Constructor injection works for independent services
- All tests pass with both USE_DI=true and USE_DI=false

### Phase 4: Constructor Injection - Simple Dependencies
**Goal**: Implement constructor injection for services with straightforward dependencies

**Steps**:
1. Update PathService to accept FileSystemService in constructor
2. Update FileSystemService to accept PathOperationsService in constructor
3. Update StateService to accept StateEventService in constructor
4. Update ServiceProvider to handle these dependencies
5. Keep backward compatibility with initialize() methods

**Exit Criteria**:
- Constructor injection works for services with simple dependencies
- All tests pass with both USE_DI=true and USE_DI=false
- Explicit initialize() still works for backward compatibility

### Phase 5: Constructor Injection - Complex Dependencies
**Goal**: Handle services with complex dependency chains and circular dependencies

**Steps**:
1. Update ResolutionService to use constructor injection
2. Update ValidationService to use constructor injection
3. Handle circular dependency between DirectiveService and InterpreterService using @delay()
4. Update remaining services with constructor injection
5. Ensure ServiceProvider handles all dependency cases

**Exit Criteria**:
- All services support constructor injection 
- Circular dependencies are properly handled
- All tests pass with both USE_DI=true and USE_DI=false

### Phase 6: Test Infrastructure - DI Support
**Goal**: Update TestContext to support DI container

**Steps**:
1. Add container support to TestContext constructor
2. Create TestContext.withDI() factory method
3. Implement registerMock() for test service registration
4. Update TestContext to initialize services from container when USE_DI=true
5. Add container child scope support for test isolation
6. Create simple test helpers for common DI test patterns

**Exit Criteria**:
- TestContext works with both DI and non-DI modes
- Tests can register mock services with container
- All tests pass with both USE_DI=true and USE_DI=false

### Phase 7: Entry Point Integration
**Goal**: Update API and CLI entry points to use DI container

**Steps**:
1. Update api/index.ts to use container for service resolution
2. Update api/run-meld.ts to support DI container
3. Update cli/index.ts to support DI container
4. Add CLI flag to toggle DI feature flag
5. Ensure serviceValidation works with DI services

**Exit Criteria**:
- API and CLI entry points work with DI enabled
- Services can be resolved from container
- All tests pass with both USE_DI=true and USE_DI=false

### Phase 8: Service Mock Updates
**Goal**: Make all mock services compatible with DI

**Steps**:
1. Add @injectable() to mock services
2. Update test factories to support DI container
3. Create mock registration helpers
4. Update CLI test helpers for DI compatibility
5. Ensure mocks can be resolved through container

**Exit Criteria**:
- All mock services work with DI container
- Test utilities correctly use DI when enabled
- All tests pass with both USE_DI=true and USE_DI=false

### Phase 9: Final Cleanup and Documentation
**Goal**: Finalize DI implementation and document patterns

**Steps**:
1. Remove redundant initialize() calls where possible
2. Add comprehensive DI documentation
3. Update architecture documentation with DI patterns
4. Create examples of extending the DI container
5. Prepare for feature flag removal in future

**Exit Criteria**:
- Clean, documented DI implementation
- All tests pass with both USE_DI=true and USE_DI=false
- Documentation explains DI usage patterns

## Implementation Timeline

- **Phases 1-2**: 2-3 days - Core DI infrastructure and decorators
- **Phases 3-5**: 3-5 days - Constructor injection implementation
- **Phases 6-8**: 4-6 days - Test infrastructure and mock updates
- **Phase 9**: 1-2 days - Finalization and documentation

Total estimated timeline: 10-16 days (2-3 weeks)

## Exit Criteria

- All ~900 tests must pass at the end of each phase
- Both DI and non-DI code paths must function correctly until the feature flag is removed
- No regressions in functionality or performance
- Clear documentation of DI patterns and usage

## Commit Analysis

Based on the git history, we've identified the following key commits in the tsyringe branch:

1. **25a2f47 - "Implement Phases 0-3 of TSyringe DI refactoring" (Mar 3, 2025)**
   - This commit appears to be the last stable point where all tests were passing
   - Implemented the core DI infrastructure with a ServiceProvider adapter
   - Added decorators to all service classes
   - Implemented constructor injection for independent services
   - Explicitly noted "All tests passing with both USE_DI=true and USE_DI=false"

2. **338f7cf - "Begin implementation of test DI container and tsyringe shim" (Mar 3, 2025)**
   - Added test infrastructure for DI
   - Created shims for vitest to work with tsyringe
   - This is likely where test issues began to appear

3. **905d863 - "Merge remote-tracking branch 'origin/apitests' into tsyringe" (Mar 3, 2025)**
   - Merged API tests into the tsyringe branch
   - May have introduced conflicts or issues with the test infrastructure

The differences between the tsyringe branch and main branch are significant, with over 100 commits including multiple version releases (10.1.x, 10.2.x). These changes include substantive updates to core services, fixes to output handling, test infrastructure improvements, and more. This makes the merge considerably more complex than initially assessed.

## Next Steps

We have chosen Option 2: Creating a new branch that reimplements DI on current main:

1. ✅ **Create a new branch from main**:
   ```bash
   git checkout main
   git checkout -b tsyringe-implementation
   ```

2. ✅ **Setup core DI infrastructure**:
   - Added tsyringe and reflect-metadata dependencies
   - Created core/ServiceProvider.ts with feature flag toggle
   - Added core infrastructure with DI container in core/di-config.ts

3. **Continue with Phase 2 implementation**:
   - Update Service decorator for inheritance
   - Add explicit metadata for service dependencies
   - Implement tests for ServiceProvider

This approach requires careful review of each significant change to ensure:
- Service interface changes are properly handled in DI
- All services are correctly registered with the container
- Test infrastructure works with both DI and non-DI modes

## Key Components Worth Cherry-Picking

After examining the tsyringe implementation, these components would be most valuable to cherry-pick:

1. **Core DI Configuration**:
   - `core/di-config.ts`: The container configuration and service registration
   - Dependencies: tsyringe, reflect-metadata

2. **ServiceProvider Adapter**:
   - `core/ServiceProvider.ts`: Feature flag toggle for enabling/disabling DI
   - Provides both DI and manual initialization paths
   - Maintains backward compatibility during transition

3. **Injectable Decorators**:
   - `@injectable()` decorators added to service classes
   - These are non-intrusive and can be added to current implementations

4. **Constructor Injection**:
   - Constructor parameters for dependency injection
   - May require more complex merging due to constructor signature changes

These components represent the core DI infrastructure without requiring any immediate changes to the test infrastructure. They could be cherry-picked to create a foundation for DI in the main branch while keeping all existing code working through the ServiceProvider adapter and feature flag.

3. **Create a detailed analysis of TestContext infrastructure**:

## Test Infrastructure Analysis

After examining the `TestContext` class and related test infrastructure, we've identified several key areas that need adaptation for TSyringe:

### TestContext Class

`TestContext` currently manually initializes services with explicit dependencies. This needs to be updated to:

1. **Support both DI and non-DI modes**:
   - Create a DI-aware constructor that accepts an optional container
   - Add a factory method that uses the TSyringe container
   - Maintain backward compatibility with the existing initialization pattern

2. **Service Registration**:
   - Add methods to register mock services with the DI container
   - Ensure container scope is properly managed for tests
   - Support both interface and implementation registration

3. **Test Isolation**:
   - Each test needs its own container scope
   - Reset the container between tests to prevent state leakage
   - Support container disposal for cleanup

### Mock Services

Mock implementations need to be updated to:

1. **Support TSyringe injection**:
   - Add `@injectable()` decorators to mock classes
   - Ensure mock factories work with the container
   - Create container registration helpers for mocks

2. **Handle circular dependencies**:
   - Add support for `@delay` decorators on mock services
   - Update mock interfaces for DI compatibility
   - Ensure mock initialization works with lazy loading

### Test Utilities

Several test utilities need updates:

1. **TestSnapshot & FixtureManager**:
   - Add DI-aware methods for test snapshots
   - Ensure fixtures support DI service initialization

2. **CLI Testing**:
   - Update `setupCliTest` to work with DI container
   - Mock process.env for feature flag handling
   - Create test utilities for working with DI in CLI tests

### Implementation Plan

1. Create TSyringe-aware TestContext:
   ```typescript
   // Factory method for creating DI-aware TestContext
   static withDI(options?: {
     container?: DependencyContainer,
     enableDI?: boolean
   }): TestContext {
     // Initialize container if not provided
     const container = options?.container || container.createChildContainer();
     // Create context with DI
     return new TestContext({ useDI: true, container });
   }

   // Constructor with DI options
   constructor(options?: {
     useDI?: boolean,
     container?: DependencyContainer,
     fixturesDir?: string
   }) {
     // Initialize with DI if enabled
     if (options?.useDI && options?.container) {
       this.initializeWithDI(options.container);
     } else {
       this.initializeManually();
     }
   }
   ```

2. Create mock registration helpers:
   ```typescript
   // Register a mock service with the container
   registerMock<T>(
     token: string | constructor<T>,
     mockImplementation: T
   ): void {
     this.container.register(token, {
       useValue: mockImplementation
     });
   }
   ```

3. Update service initialization to support both modes

4. Begin implementing these changes in a methodical, test-driven manner

## Next Steps

1. Create a new branch from the stable commit (25a2f47):
   ```bash
   git checkout 25a2f47
   git checkout -b tsyringe-stable
   ```

2. Implement the TestContext DI support:
   - Create a basic test to verify DI functionality
   - Update TestContext with DI-aware constructor and factories
   - Ensure all existing tests still pass

3. Begin updating service mocks for DI compatibility

## Conclusion

The TSyringe migration remains a valuable architectural improvement that will significantly enhance the Meld codebase's maintainability and testability. However, given the substantial divergence between the last stable tsyringe implementation and current main (over 100 commits including multiple releases), the migration is more complex than initially expected.

We have two viable options to proceed:

### Option 1: Selective Cherry-Pick to Current Main
- Start from current main branch
- Cherry-pick specific DI components from the stable tsyringe implementation:
  - Core DI configuration (di-config.ts)
  - ServiceProvider adapter with feature flag toggle
  - Injectable decorators on service classes
  - Constructor injection where feasible
- This approach brings over the core DI architecture while avoiding complex merges
- The ServiceProvider pattern ensures backward compatibility during transition

### Option 2: Fresh Implementation on Current Main
- Start from current main branch
- Reimplement the core DI infrastructure with lessons learned
- This approach requires redoing some work but avoids complex cherry-picking
- May be cleaner and more maintainable long-term

Both options will require:
1. Prioritizing test infrastructure updates for DI compatibility
2. Maintaining dual-mode operation (DI and non-DI) during transition
3. Taking an incremental approach with strict pass requirements at each step

The revised timeline estimates this work will require 2-3 weeks with careful planning and methodical execution, due to the increased complexity of merging significant codebase changes.

## Recommended Path Forward

Based on our analysis, we recommend implementing TSyringe DI in the Meld codebase using a carefully phased approach that draws from the best aspects of the previous implementation while avoiding the pitfalls that led to test failures.

### Key Recommendations:

1. **Start from current main branch** to ensure we have all the latest fixes and improvements
2. **Reuse the ServiceProvider pattern** from the previous implementation to maintain dual-mode operation
3. **Prioritize test compatibility** at each phase to avoid the cascading test failures encountered previously 
4. **Implement incrementally** with clear exit criteria of all tests passing at each phase

The detailed implementation plan above breaks down the work into 9 manageable phases, each building on the previous while maintaining backward compatibility. The feature flag toggle (USE_DI environment variable) will be critical to ensuring we can validate both operational modes throughout the migration.

This approach combines the benefits of reusing proven DI architectural concepts while avoiding complex merge conflicts, giving us the best chance for a successful migration.