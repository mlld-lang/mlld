# TSyringe Dependency Injection Migration

> **IMPORTANT**: Always update this file when working on the TSyringe migration to track progress and next steps.

## Overview

This document serves as the central tracking point for the TSyringe dependency injection migration project. It outlines the current status, approach, and tasks remaining to complete the migration.

## Current Status

The codebase currently uses a **dual-mode system** that supports both DI (via TSyringe) and non-DI modes via the `shouldUseDI()` function. This dual-mode approach has created technical debt in the form of complex service constructors and initialization patterns.

We are taking a **methodical, incremental approach** to cleaning up this technical debt without breaking existing functionality.

## Key Documents

* [**tsyringe-cleanup-approach.md**](./tsyringe-cleanup-approach.md) - The overall migration strategy and phased approach
* [**tsyringe-cleanup-revised.md**](./tsyringe-cleanup-revised.md) - Specific cleanup tasks that preserve dual-mode functionality
* [**tsyringe-first-task.md**](./tsyringe-first-task.md) - Detailed implementation guide for path normalization
* [**constructor-simplification.md**](./constructor-simplification.md) - Strategy for simplifying service constructors
* [**service-initialization-patterns.md**](./service-initialization-patterns.md) - Documented patterns from the refactoring work

## Migration Approach

We are following a phased approach:

1. **Phase 1: Cleanup Tasks** (CURRENT FOCUS)
   - Standardize path normalization
   - Simplify service constructors without changing behavior
   - Improve documentation
   - Enhance test helpers

2. **Phase 2: Test Preparation**
   - Update test utilities for better DI support
   - Categorize tests by DI dependency
   - Create migration utilities

3. **Phase 3: Incremental Service Migration**
   - Update one service at a time
   - Ensure tests continue to pass
   - Gradually reduce reliance on non-DI mode

4. **Phase 4: DI-Only Mode Transition**
   - Add opt-in flag for DI-only mode
   - Convert tests to DI-only in batches
   - Track migration progress

5. **Phase 5: Final Cleanup**
   - Remove dual-mode support
   - Clean up any remaining conditional logic
   - Update documentation

## Progress Tracking

### Completed
- Initial TSyringe implementation with dual-mode support
- DI container configuration in di-config.ts
- Service decorator implementation
- Refactored StateService constructor for better clarity

### In Progress
- [ ] Constructor simplification for key services (see [constructor-simplification.md](./constructor-simplification.md))
- [ ] Migration planning and documentation
- [ ] Document patterns for service initialization

### Up Next
- [ ] Refactor ResolutionService constructor using the same pattern
- [ ] Refactor OutputService constructor using the same pattern
- [ ] Update DI documentation
- [ ] Create test helpers for DI mode

Note: Path normalization was initially considered as part of this work but has been separated into its own future task. See [path-normalization.md](./path-normalization.md) for details.

### Future Work
- [ ] Enhance test helpers for DI/non-DI compatibility
- [ ] Begin incremental service migration
- [ ] Update tests to work with DI-only services

## Contribution Guidelines

When working on this migration:

1. **Update this file first** - Record your progress and next steps
2. **Take small steps** - Make incremental changes that don't break tests
3. **Test thoroughly** - Run tests after each significant change
4. **Document patterns** - Note recurring patterns for future reference
5. **Preserve behavior** - Don't change functionality during cleanup

## Avoiding Pitfalls

⚠️ **DO NOT** force DI-only mode by changing `shouldUseDI()` to always return true. This will break nearly all tests.

⚠️ **DO NOT** attempt to update all services at once. Work on one at a time and verify tests pass.

⚠️ **DO NOT** modify core test infrastructure without thorough testing.

## How to Start

1. Read the linked documents to understand the approach
2. Begin with the path normalization task outlined in [tsyringe-first-task.md](./tsyringe-first-task.md)
3. Run tests after each significant change
4. Update this file with your progress
5. Request focused code reviews for each change

## Implementation Notes

### Git Workflow

For each task:
1. Create a feature branch (e.g., `feature/tsyringe-path-normalization`)
2. Make targeted changes with good commit messages
3. Run tests to verify nothing breaks
4. Create a PR for review
5. Update this file with progress after merging