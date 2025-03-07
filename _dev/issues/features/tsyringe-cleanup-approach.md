# TSyringe DI Migration: Methodical Approach

## Context

The Meld codebase is in the midst of a transition to TSyringe-based dependency injection. Groundwork has already been laid, but we encountered challenges when trying to force an immediate switch to DI-only mode. This document outlines a careful, methodical approach to completing this transition without breaking the existing test suite.

## Current State

1. **Dual-Mode System**: The codebase currently supports both DI and non-DI modes via `shouldUseDI()`
2. **Working Tests**: Tests pass because they can run in either mode
3. **Technical Debt**: Services have complex constructors with branching logic to support both modes

## Why a Methodical Approach is Needed

Our recent attempt to force DI-only mode broke nearly every test in the codebase. This revealed that:

1. **Tests Rely on Dual-Mode**: Many tests depend on the ability to run without DI
2. **Core Services Are Complex**: Services like StateService have intricate initialization patterns
3. **Path Normalization Issues**: Different test contexts expect different path formats

## Step-by-Step Migration Plan

### Phase 1: Cleanup Tasks (Before Mode Changes)

1. **Document Patterns**: Catalog current dual-mode patterns in the codebase
2. **Simplify Constructors**: Refactor service constructors to be cleaner, without changing dual-mode functionality
3. **Standardize Path Handling**: Implement consistent path normalization utilities across the codebase

### Phase 2: Test Preparation

1. **Update Test Helpers**: Enhance TestContextDI to better support tests in both modes
2. **Categorize Tests**: Identify which tests depend on non-DI mode
3. **Create Migration Utilities**: Build tools to help bridge the gap for tests during transition

### Phase 3: Incremental Service Migration

1. **Select Low-Impact Services First**: Begin with services that have few dependencies
2. **Update One Service at a Time**: Modify each service to prefer DI but still support non-DI mode
3. **Verify After Each Change**: Ensure tests continue to pass after each service update
4. **Gradually Remove Legacy Patterns**: As tests are updated, slowly remove non-DI code paths

### Phase 4: DI-Only Mode Transition

1. **Add Transition Flag**: Introduce a `MIGRATE_TO_DI_ONLY` flag that tests can opt into
2. **Update Tests in Batches**: Convert tests to DI-only mode in small, related groups
3. **Track Progress**: Document which tests and services are fully migrated

### Phase 5: Final Cleanup

1. **Remove Dual-Mode Support**: Once all tests pass with DI, remove `shouldUseDI()` checks
2. **Simplify Constructors Further**: Clean up any remaining conditional logic
3. **Update Documentation**: Finalize DI documentation for the codebase

## Current Focus: Phase 1 Cleanup Tasks

For our immediate work, we should focus on cleanup tasks that don't disrupt the existing functionality:

1. **Create Path Normalization Utilities**: Implement standardized path handling (without forcing its use yet)
2. **Document Existing Patterns**: Catalog dual-mode patterns for future reference
3. **Simplify Complex Constructors**: Clean up service constructors while preserving dual-mode support
4. **Add DI Documentation**: Create reference documentation for services and tests

This will establish the foundation for a smooth migration without breaking existing functionality.

## Testing Principles During Migration

1. **No Test Breakage**: Changes should not cause previously passing tests to fail
2. **Verify Frequently**: Run tests after each significant change
3. **Incremental Progress**: Make small, focused changes rather than large refactors
4. **Backward Compatibility**: Maintain support for both modes until tests are fully updated

## Next Steps

1. Create detailed catalog of dual-mode patterns in the codebase
2. Implement path normalization utilities
3. Begin simplifying complex constructors one service at a time
4. Expand DI documentation with migration-specific guidance