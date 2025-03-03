# TSyringe Dependency Injection Refactor

This document outlines a strategic, phased approach to fully implementing dependency injection (DI) with TSyringe across the Meld codebase. The current implementation has partial DI support but needs consistent application throughout the codebase.

## Goals

- Implement consistent dependency injection across all services
- Maintain all 740 existing passing tests throughout the refactor
- Improve testability, flexibility, and maintainability of the codebase
- Replace manual service instantiation with container-based resolution

## Implementation Strategy

The implementation is divided into six strategic phases, each with clear exit criteria. The phases are designed to minimize risk, with each phase building on the success of the previous ones.

### Phase 0: Preparation and Analysis

**Tasks:**
- Create a feature flag to toggle DI usage: `process.env.USE_DI`
- Create a ServiceProvider adapter that can deliver services both ways:
  ```typescript
  export class ServiceProvider {
    static getStateService(): StateService {
      return process.env.USE_DI === 'true' 
        ? container.resolve(StateService)
        : new StateService();
    }
    // Similar methods for other services
  }
  ```
- Update CI pipeline to run tests with and without DI
- Create snapshot of current test results as baseline
- Document service dependencies and initialization order

**Exit Criteria:**
- Feature flag mechanism implemented and verified
- ServiceProvider adapter tested
- CI pipeline updated
- All 740 tests passing with feature flag turned OFF

### Phase 1: Service Class Decoration and Registration

**Tasks:**
- Add `@singleton()` or `@injectable()` decorators to all service classes (without changing constructors)
  - [ ] StateService
  - [ ] StateEventService
  - [ ] ParserService
  - [ ] DirectiveService
  - [ ] InterpreterService
  - [ ] ValidationService
  - [ ] CircularityService
  - [ ] PathService
  - [ ] FileSystemService
  - [ ] PathOperationsService
  - [ ] OutputService
  - [ ] Debug service classes
- Update container registrations in `di-config.ts` for all services
- Register interfaces with tokens (e.g., `container.register('IStateService', { useClass: StateService })`)

**Exit Criteria:**
- All service classes properly decorated
- All services registered in the container
- All 740 tests still passing with feature flag turned OFF
- Verify services can be resolved from container in isolation

### Phase 2: Constructor Injection for Independent Services

**Tasks:**
- Update constructors for independent services (those with no dependencies or minimal dependencies):
  - [ ] StateEventService
  - [ ] PathOperationsService
  - [ ] ParserService
  - [ ] ValidationService
  - [ ] CircularityService
- Add tests for DI resolution of these services
- Update impacted test files to use ServiceProvider

**Exit Criteria:**
- All independent services properly using constructor injection
- All 740 tests passing with feature flag turned OFF
- All affected service tests passing with feature flag turned ON

### Phase 3: Constructor Injection for Dependent Services

**Tasks:**
- Update constructors for services with straightforward dependencies:
  - [ ] StateService (inject StateEventService)
  - [ ] FileSystemService (inject PathOperationsService)
  - [ ] PathService (inject FileSystemService)
  - [ ] ResolutionService (already done)
- Create factories for variant services (like FileSystem implementations)
- Update affected test files

**Exit Criteria:**
- All non-circular dependent services using constructor injection
- Factory patterns implemented for variant services
- All 740 tests passing with feature flag turned OFF
- All affected service tests passing with feature flag turned ON

### Phase 4: Handle Circular Dependencies

**Tasks:**
- Address circular dependencies between DirectiveService and InterpreterService:
  - Option 1: Use `@lazyInject` for circular references
  - Option 2: Refactor the services to eliminate circular dependency
  - Option 3: Use factory or mediator pattern
- Update OutputService to use DI
- Update tests for these services

**Exit Criteria:**
- Circular dependencies resolved
- All service constructors updated for DI
- All 740 tests passing with feature flag turned OFF
- All service tests passing with feature flag turned ON

### Phase 5: Entry Point and Bootstrap Refactoring

**Tasks:**
- Refactor `api/index.ts` to use the DI container:
  - Replace `createDefaultServices` with container resolution
  - Handle options and overrides through DI
- Update `cli/index.ts` to use the container
- Update any other entry points (debug tools, etc.)
- Refactor remaining instances of manual service creation

**Exit Criteria:**
- All entry points using DI container
- No manual service instantiation in the codebase
- All 740 tests passing with both feature flags ON and OFF

### Phase 6: Finalization and Cleanup

**Tasks:**
- Remove ServiceProvider adapter
- Remove feature flag
- Update documentation to reflect DI architecture
- Add integration tests specifically for DI container
- Perform final code review and cleanup

**Exit Criteria:**
- All 740 tests passing with the new DI implementation
- Documentation updated
- No references to old instantiation patterns
- Code review completed

## Risk Mitigation Strategies

1. **Incremental Testing**: After each service modification, run tests for that service first, then the full suite
2. **Revert Plan**: Document steps to revert changes for each phase
3. **Feature Flagging**: Maintain the ability to switch between old and new systems
4. **Parallel CI Runs**: Test both DI and non-DI builds in CI
5. **Change Log**: Maintain detailed logs of all changes made
6. **Time Boxing**: Set specific time limits for each phase to avoid scope creep

## Rollback Procedures

If tests fail after a phase implementation:
1. Revert the specific service changes causing the failure
2. If problems persist, revert the entire phase
3. Document the specific test failures and why they occurred
4. Create a plan to address the issues before proceeding

## Conclusion

This phased approach ensures the refactoring to TSyringe happens in a controlled, testable manner. Each phase builds upon the previous one while maintaining system stability. The exit criteria of "all tests passing" for each phase provides clear verification points throughout the process.

After completion, the codebase will have a consistent dependency injection approach that improves testability, maintainability, and flexibility.
