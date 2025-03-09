# TSyringe Dependency Injection Cleanup Plan

## Overview
This document outlines a comprehensive, phased approach to cleanup after the TSyringe dependency injection migration. The plan addresses five major areas identified in the review:

1. Build configuration issues
2. Test infrastructure improvements
3. Interface design standardization
4. Dual-mode DI removal
5. Service Mediator pattern removal

Each phase is designed to be methodical, with clear exit criteria and frequent test validation to ensure stability throughout the process.

## Additional Context

### Historical Challenges

The TSyringe DI migration was implemented as a transitional approach, allowing both legacy initialization and DI-based initialization to coexist. This dual-mode operation helped ensure a smooth migration without breaking existing code, but has created technical debt that now needs to be addressed.

Key challenges in the current implementation:

1. **Circular Dependencies:** The codebase has several circular dependencies between core services (FileSystemService ↔ PathService, ParserService ↔ ResolutionService, StateService ↔ StateTrackingService) that were temporarily resolved using the ServiceMediator pattern.

2. **Complex Initialization Logic:** Services have complex initialization logic with multiple paths depending on whether DI is enabled, making it difficult to understand service initialization and dependencies.

3. **Manual Service Registration:** Much of the service registration is handled manually, which creates maintenance burden and potential for errors.

4. **Legacy Code Paths:** The codebase maintains legacy code paths that are no longer necessary now that the migration is complete.

5. **Memory Management:** The current implementation has potential memory management issues with the DI container, particularly in test environments where containers may not be properly cleared between tests.

## Phase 1: Build Configuration Cleanup

**Focus:** Address build-related issues to ensure reliable builds and prevent runtime errors.

**Relevant Documentation:** [cleanup-build-configuration.md](./_dev/issues/active/cleanup-build-configuration.md)

### Tasks:
1. Restore `options.platform = 'node'` setting in all build targets
2. Audit and update the external dependencies list across all build configurations
3. Configure proper handling of TSyringe and reflect-metadata
4. Test ESM and CJS output compatibility
5. Optimize tree shaking for DI-based code
6. Update documentation on build configuration

### Additional Context:
The DI migration removed the Node.js platform setting in some build configurations, which could cause issues when bundling Node.js-specific code. The migration also changed how dependencies are managed, particularly for built-in Node.js modules. TSyringe and reflect-metadata require special handling in the build process to ensure proper operation, especially for ESM/CJS compatibility.

### Exit Criteria:
- All tests pass with the updated build configuration
- Both ESM and CJS builds succeed without warnings
- Manual testing confirms no runtime dependency issues
- Bundle size analysis shows no significant increases
- Build process documentation is updated

## Phase 2: Test Infrastructure Simplification ✅

**Focus:** Improve the reliability and maintainability of the test infrastructure.

**Relevant Documentation:** [cleanup-test-infrastructure.md](./cleanup-test-infrastructure.md)

### Tasks:
1. ✅ Remove conditional DI mode in test utilities
2. ✅ Simplify TestContainerHelper to focus on isolated container creation
3. ✅ Implement automatic container reset between tests
4. ✅ Add container state leak detection
5. ✅ Create unified helper methods for common test patterns
6. ✅ Update all existing tests to use the improved test infrastructure
7. ✅ Implement vitest-mock-extended for class identity checks in tests

### Completed Implementation:
- **Removed Dual-Mode Support**: Eliminated all conditional logic for DI/non-DI modes
- **Container Simplification**: Refactored TestContainerHelper for better isolation and leak detection
- **Automatic Reset**: Added proper cleanup and reset mechanisms
- **Leak Detection**: Implemented container state leak detection to identify memory issues
- **Unified Helpers**: Created TestHelpers for common test patterns
- **Documentation**: Updated TESTS.md with comprehensive guidance on the new approach

### Next Steps:
- Monitor test performance with the new infrastructure
- Consider further optimizations for container initialization
- Proceed to Phase 3: Interface Standardization

## Phase 3: Interface Standardization ✅

**Focus:** Ensure consistent interface design and implementation across the codebase.

**Relevant Documentation:** [cleanup-interface-first-design.md](./cleanup-interface-first-design.md)

### Tasks:
1. ✅ Document the existing interface architecture (I[Name]Service vs I[Name] patterns)
2. ✅ Improve interface documentation with comprehensive JSDoc comments and examples
3. ✅ Review interface scopes to remove exposure of implementation details
4. ✅ Explicitly declare dependencies in interfaces
5. ✅ Update test mocks to leverage interfaces for improved type safety

### Implementation Status:
- **Completed** all interface standardization tasks across 14 service interfaces
- **Architecture documentation**:
  - ✅ Documented the interface-first design pattern
  - ✅ Validated that the codebase follows good architectural practices:
    - Service interfaces follow I[Name]Service pattern (e.g., IFileSystemService)
    - Implementation interfaces follow I[Name] pattern (e.g., IFileSystem)
- **Documentation improvements**:
  - ✅ Added comprehensive JSDoc documentation to all interfaces
  - ✅ Added examples for all complex methods
  - ✅ Made dependencies explicit in all interface documentation
  - ✅ Improved related types and options documentation

### Results:
Phase 3 is now complete. We have successfully standardized all service interfaces in the codebase. This effort has:
- Added comprehensive documentation to all service interfaces
- Made dependencies explicit in interface documentation 
- Added examples to clarify interface usage
- Improved documentation of related types and options
- Clarified the role and responsibility of each service

This significantly improves the codebase's maintainability and developer experience by providing clear, consistent, and comprehensive documentation of the service architecture.

### Next Steps:
- Create pull requests for the completed interfaces
- Move on to Phase 4: Dual-Mode DI Removal

## Phase 4: Dual-Mode DI Removal

**Focus:** Completely remove the dual-mode DI support from the codebase.

**Relevant Documentation:** [cleanup-dual-mode-di.md](./cleanup-dual-mode-di.md)

### Revised Implementation Plan

The dual-mode DI approach is deeply embedded in many service implementations and tests, requiring a careful, phased approach for removal. Our implementation will follow these steps:

#### Phase 4.1: Force DI Mode While Maintaining Compatibility ✅
1. ✅ Update ServiceProvider.shouldUseDI() to always return true but maintain its existence
2. ✅ Update documentation to indicate shouldUseDI() is deprecated
3. ✅ Maintain function signatures in ServiceProvider to ensure backward compatibility
4. ✅ Update tests to verify all code paths function properly in DI-only mode

#### Phase 4.2: Identify and Update Service Implementations ✅
1. ✅ Create an inventory of all services with conditional DI logic
2. ✅ Mark all conditional code paths with deprecation comments
3. ✅ Test each service with DI-only configuration
4. ✅ Document patterns for service constructor simplification

#### Phase 4.3: Remove Conditional Logic in Services (In Progress)
1. ✅ Update each service one at a time, removing dual-mode initialization
   - ✅ StateService
   - ✅ DirectiveService 
   - ✅ InterpreterService
   - ✅ ServiceMediator
   - More services to be updated...
2. ✅ Remove conditional checks that branch based on shouldUseDI()
3. ✅ Simplify constructors while maintaining compatibility with existing call sites
4. ✅ Run extensive tests after each service update

#### Phase 4.4: Clean Up Test Infrastructure (Completed ✅)
1. ✅ Update test utilities to remove DI mode toggles
2. ✅ Remove environment variable settings in tests
3. ✅ Simplify test setup code that handles different modes
   - ✅ Updated InterpreterService.unit.test.ts to use TestContextDI.create() instead of withDI()/withoutDI()
   - ✅ Created and ran an automatic script to replace deprecated TestContextDI.withDI()/withoutDI() calls in all tests
4. ✅ Validate all tests pass with the simplified infrastructure
   - All 1168 tests now pass with the new approach

#### Phase 4.5: Final Cleanup (In Progress)
1. ⬜ Complete removal of shouldUseDI() function
2. ⬜ Remove legacy initialization code paths
3. ⬜ Update all documentation to reflect DI-only approach
4. ⬜ Final verification with full test suite

### Implementation Progress
- **Phase 4.1 & 4.2**: Completed ✅
- **Phase 4.3**: Substantial progress - critical services (StateService, DirectiveService, InterpreterService) now functioning properly in DI-only mode
- **Phase 4.4**: Completed ✅ - All test files have been updated to use TestContextDI.create() and all tests pass
- **Phase 4.5**: Started - Final cleanup tasks pending

We've made excellent progress on Phase 4! The test infrastructure has been completely updated to use the new DI-only approach, and all tests are passing. We've created a script that automatically updates all the tests to use the new TestContextDI.create() method instead of the deprecated withDI() and withoutDI() methods.

The next steps are to fully complete Phase 4.5 by removing the shouldUseDI() function entirely, cleaning up any legacy initialization code paths, and updating all documentation to reflect the DI-only approach.

## Phase 5: Service Mediator Replacement

**Focus:** Replace the ServiceMediator pattern with proper solutions for circular dependencies.

**Relevant Documentation:** [cleanup-service-mediator.md](./cleanup-service-mediator.md)

### Tasks:
1. Audit all services using ServiceMediator to understand dependency relationships
2. Identify alternative patterns for each circular dependency:
   - Factory patterns for deferred instantiation
   - Interface-based design to break circular references
   - Service composition refinement
3. Refactor each service to eliminate mediator dependencies
4. Update di-config.ts to use standard DI registration
5. Remove ServiceMediator class and interface
6. Update tests to work without ServiceMediator-related mocks

### Additional Context:
The ServiceMediator was implemented as a transitional solution to handle circular dependencies between core services during the DI migration. It essentially acts as a central "broker" that services register with and can request other services from, breaking the direct circular dependency. While this approach works, it creates tight coupling to the mediator and relies on manual service registration with numerous null checks.

The main circular dependencies that need to be resolved are:
- FileSystemService ↔ PathService: These services depend on each other for path resolution and filesystem operations
- ParserService ↔ ResolutionService: These services depend on each other during parsing and variable resolution
- StateService ↔ StateTrackingService: These services depend on each other for state management and debugging

Proper architectural solutions for these dependencies will create a cleaner, more maintainable codebase with clearer service boundaries.

### Exit Criteria:
- All tests pass without the ServiceMediator
- All circular dependencies are properly resolved
- Service relationships are clearly defined
- No regression in functionality
- Documentation is updated to explain the new patterns

## Phase 6: Integration and Optimization

**Focus:** Ensure all changes work together seamlessly and optimize the DI system.

### Tasks:
1. Comprehensive integration testing across all changed components
2. Performance optimization of the DI container initialization
3. Memory usage analysis and optimization
4. Documentation updates covering the entire DI system
5. Developer guide creation for working with the DI system
6. Update contributor documentation with DI best practices

### Additional Context:
After completing the major restructuring phases, there may be integration issues or performance concerns with the DI system. TSyringe container initialization can have performance implications, especially with a large number of services. Memory usage is also a concern, particularly with the singleton lifecycle used for most services.

Additionally, developers need clear guidance on working with the DI system, including best practices for service design, dependency management, and testing. The developer guide should be updated to reflect the new DI-only approach and provide clear examples of common patterns.

### Exit Criteria:
- All tests pass with the fully cleaned-up implementation
- No performance regression in startup time or memory usage
- Documentation completely reflects the current implementation
- Developer guide provides clear guidance on using the DI system
- PR review verifies all identified issues have been addressed

## Implementation Guidelines

### Testing Strategy
- Run the full test suite after each significant change
- Create additional tests for edge cases during refactoring
- Monitor test performance throughout the process
- Use integration tests to validate interactions between components

### Commit Strategy
- Make small, focused commits that address specific issues
- Include comprehensive tests with each change
- Use feature flags when necessary to isolate changes
- Document rationale for significant architectural decisions

### Risk Mitigation
- Create feature branches for each phase
- Implement extensive logging during transition periods
- Develop rollback plans for each major change
- Maintain compatibility layers when appropriate

### Documentation
- Update documentation alongside code changes
- Document architectural decisions and their rationale
- Create migration guides for any breaking changes
- Update developer onboarding materials 