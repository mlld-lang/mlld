# Remove Dual-Mode DI Implementation

## Background
During migration to dependency injection, a dual-mode implementation was created to support both legacy initialization and DI-based initialization. This allowed for a gradual migration without breaking existing code. Now that the migration is complete, this dual-mode support adds unnecessary complexity.

## Problem
The current implementation has parallel code paths for DI and legacy modes:
- Services have conditional initialization logic based on `shouldUseDI()`
- The ServiceProvider contains parallel implementations for both modes
- Tests toggle between modes using environment variables
- Error handling and type safety are compromised due to dual-mode support

This dual-mode approach significantly increases code complexity and maintenance burden.

## Proposed Solution
1. Remove all legacy mode support
2. Simplify service initialization to use only DI
3. Remove environment variable toggling (`USE_DI`)
4. Clean up test utilities to assume DI is always enabled

## Implementation Steps
1. Remove all `shouldUseDI()` checks and legacy initialization paths
2. Simplify service constructors to assume DI will always be used
3. Remove fallback patterns in ServiceProvider and TestContainerHelper
4. Update testing utilities to always use DI mode
5. Remove environment variable toggles in tests
6. Simplify error handling now that null checks aren't needed

## Success Criteria
- All references to `USE_DI` environment variable removed
- No conditional initialization logic in services
- Simpler, more maintainable service constructors
- Tests function without mode toggling
- No regression in functionality

## Estimated Complexity
Medium - Requires careful removal of conditional logic throughout the codebase