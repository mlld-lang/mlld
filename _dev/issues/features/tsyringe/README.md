# TSyringe Dependency Injection Migration

> **IMPORTANT**: This document serves as the central tracking point for the TSyringe dependency injection migration project. Always update this file when working on the migration to track progress and next steps.

## Overview

The Meld codebase is in the process of transitioning to TSyringe-based dependency injection. This document outlines the methodical, phase-by-phase approach to completing this transition.

## Current Status

The codebase currently uses a **dual-mode system** that supports both DI (via TSyringe) and non-DI modes via the `shouldUseDI()` function. We have successfully implemented several phases of the migration but need to continue with a methodical approach to prevent breaking the test suite.

## Migration Strategy

Our migration strategy follows these key principles:

1. **Methodical Approach**: Take small, incremental steps that don't break existing functionality
2. **Comprehensive Testing**: Verify tests pass after each change
3. **Dual-Mode Support**: Maintain both DI and non-DI modes until all services and tests are updated
4. **Documentation**: Document patterns and decisions for future reference

## Phase-by-Phase Migration Plan

### Phase 1: Foundation and Cleanup (✅ Completed)
- Constructor simplification for key services
- Documentation updates
- [Details in phase1-cleanup.md](./phases/phase1-cleanup.md)

### Phase 2: Test Infrastructure Enhancement (Next Focus)
- Improve TestContextDI to better support both modes
- Create migration utilities
- Categorize tests by DI dependency
- [Details in phase2-test-preparation.md](./phases/phase2-test-preparation.md)

### Phase 3: Incremental Service Migration
- Update one service at a time to prefer DI 
- Ensure tests pass after each change
- Track progress service by service
- [Details in phase3-service-migration.md](./phases/phase3-service-migration.md)

### Phase 4: DI-Only Mode Transition
- Add opt-in flag for DI-only mode in tests
- Update tests in batches to use DI-only mode
- Document migration progress
- [Details in phase4-di-only-transition.md](./phases/phase4-di-only-transition.md)

### Phase 5: Final Cleanup
- Remove dual-mode support entirely
- Simplify constructors further
- Update documentation
- [Details in phase5-final-cleanup.md](./phases/phase5-final-cleanup.md)

## Progress Tracking

### Completed Work
- Initial TSyringe implementation with dual-mode support
- DI container configuration in di-config.ts
- Service decorator implementation
- Multiple services decorated with `@Service()`
- Tests for decorated services updated to work with both modes

### In Progress
- [x] Constructor simplification for key services (Phase 1 completed) 
- [x] Test infrastructure enhancement (Phase 2 completed)
- [x] Categorizing tests by DI dependency (Phase 2 completed)
- [x] Phase 3: Service migration (in progress)
  - [x] Created service dependency map for prioritized migration
  - [x] Migrated foundation services (PathOperationsService, ProjectPathResolver, StateFactory, StateEventService, StateService, ValidationService)
  - [x] Migrated Core Pipeline services (FileSystemService, ParserService, InterpreterService, DirectiveService)
  - [x] Migrated OutputService and ResolutionService
  - [ ] Continuing with remaining services

### Up Next
- [ ] Complete remaining Phase 3 tasks:
  - [x] Migrate StateService
  - [x] Migrate ValidationService (already had TSyringe support)
  - [x] Migrate FileSystemService (already had TSyringe support)
  - [x] Migrate ParserService
  - [x] Migrate InterpreterService 
  - [x] Migrate DirectiveService
  - [x] Migrate OutputService
  - [x] Migrate ResolutionService
  - [ ] Migrate CLIService
  - [ ] Migrate utility services:
    - [ ] SourceMapService (in core/utils)
    - [ ] Logger/createServiceLogger (in core/utils)
  - [ ] Prepare for Phase 4 (DI-only mode transition)

## Reference Documentation

- [Service Initialization Patterns](./reference/service-initialization-patterns.md) - Common patterns in the codebase
- [Constructor Simplification](./reference/constructor-simplification.md) - Strategy for refactoring constructors
- [DI Documentation](./reference/di-documentation.md) - Guidelines for using DI

## Implementation Guidelines

When working on this migration:

1. **Update this file first** - Record your progress and next steps
2. **Take small steps** - Make incremental changes that don't break tests
3. **Test thoroughly** - Run tests after each significant change
4. **Document patterns** - Note recurring patterns for future reference
5. **Preserve behavior** - Don't change functionality during cleanup

## Avoiding Common Pitfalls

⚠️ **DO NOT** force DI-only mode by changing `shouldUseDI()` to always return true without first updating all relevant tests.

⚠️ **DO NOT** attempt to update all services at once. Work on one at a time and verify tests pass.

⚠️ **DO NOT** modify core test infrastructure without thorough testing.

## How to Start Contributing

1. Read this document and linked phase documents to understand the approach
2. Check the "In Progress" and "Up Next" sections to see what needs attention
3. Select a specific task to work on
4. Run tests after each significant change
5. Update this file with your progress
6. Request focused code reviews for each change 