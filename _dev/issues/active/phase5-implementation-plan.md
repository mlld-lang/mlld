# Phase 5 Implementation Plan: Codebase-Wide Module Resolution Migration

## Overview

Phase 5 involves applying the module resolution patterns across the entire codebase. This is the largest and most complex phase of the Module Resolution Issues fixing plan, as it requires widespread changes to import statements, module declarations, and potentially refactoring to resolve circular dependencies.

Given the scope of this work, Phase 5 will be broken down into multiple sub-phases to make the migration more manageable and minimize disruption to ongoing development.

## Sub-Phase Structure

### Phase 5A: Core Module Migration (1 day)
- Update core modules and foundational services
- Focus on non-circular, low-dependency modules first
- Establish patterns for the rest of the codebase

### Phase 5B: Service Layer Migration (1-2 days)
- Update service interfaces and implementations
- Address circular dependencies using Client Factory pattern
- Update DI registration for migrated services

### Phase 5C: CLI, API, and Test Migration (1-2 days)
- Update CLI layer
- Update API/SDK layer
- Update test files to maintain compatibility
- Add regression tests for module resolution

### Phase 5D: Validation and Finalization (1 day)
- Comprehensive testing across all modules
- Address any edge cases or remaining issues
- Update documentation with lessons learned
- Finalize migration guide for future development

## Implementation Strategy

For each sub-phase, we'll follow this general strategy:

1. **Preparation**:
   - Create a branch for the sub-phase (e.g., `p0-phase5a-core-migration`)
   - Run the fix-module-imports.js script in dry-run mode to identify affected files
   - Prioritize files based on dependency order

2. **Migration**:
   - Update a small batch of files at a time (10-20 files)
   - Run tests after each batch to identify and fix issues early
   - Commit changes frequently with descriptive messages

3. **Validation**:
   - Run comprehensive tests after completing the sub-phase
   - Address any failures or regressions
   - Document patterns and learnings

4. **Merge**:
   - Create a PR for the sub-phase
   - Get review and approval
   - Merge to the main branch before starting the next sub-phase

## Detailed Plan for Phase 5A: Core Module Migration

Phase 5A will focus on migrating the core modules, which form the foundation of the codebase.

### Target Files:
- core/ast/* - Parser and AST related files
- core/syntax/types/* - Type definition files
- core/errors/* - Error classes and helpers
- core/utils/* - Utility functions and services

### Implementation Steps:

1. **Preparation**:
   - Create branch `p0-phase5a-core-migration`
   - Run `npm run fix:imports:dry -- core/` to identify affected files
   - Create a prioritized list of files to update

2. **Migration Process**:
   - For each batch of files:
     - Run `npm run fix:imports -- [filepath]` to update imports
     - Manually verify changes
     - Fix any issues that the script couldn't handle automatically
     - Run tests to ensure functionality is preserved
     - Commit the batch

3. **Special Attention**:
   - Update type imports to use `import type` syntax
   - Address any circular dependencies found during migration
   - Ensure barrel files (index.ts) use explicit re-exports
   - Verify proper handling of third-party imports

4. **Validation**:
   - Run full test suite: `npm test`
   - Address any test failures
   - Document patterns and issues found

## Detailed Plan for Phase 5B: Service Layer Migration

Phase 5B will focus on migrating the service layer, which includes interfaces, implementations, and factories.

### Target Files:
- services/fs/* - File system services
- services/pipeline/* - Pipeline services
- services/resolution/* - Resolution services
- services/state/* - State management services

### Implementation Steps:

1. **Preparation**:
   - Create branch `p0-phase5b-service-migration`
   - Run `npm run fix:imports:dry -- services/` to identify affected files
   - Create a prioritized list of files to update, starting with:
     - Interface files
     - Factory implementations
     - Service implementations

2. **Migration Process**:
   - For interface files:
     - Update exports to be explicit named exports
     - Update imports to use `.js` extensions
     - Verify interface segregation for circular dependencies
     - Ensure proper re-exports in barrel files

   - For factory implementations:
     - Update to follow Client Factory pattern
     - Ensure proper error handling and lazy loading
     - Update DI registration to use the new pattern

   - For service implementations:
     - Update import statements to use `.js` extensions
     - Update to use factory injection for circular dependencies
     - Fix any exposed circular dependencies

3. **Special Attention**:
   - Document any circular dependencies identified
   - Apply the patterns from MODULE-SYSTEM.md
   - Ensure consistent export naming conventions
   - Update any direct container resolution patterns

4. **Validation**:
   - Run service-specific tests after each service migration
   - Run full test suite after completing all services
   - Document any patterns or issues found

## Detailed Plan for Phase 5C: CLI, API, and Test Migration

Phase 5C will focus on migrating the CLI layer, API/SDK layer, and test files.

### Target Files:
- cli/* - CLI implementation
- api/* - API/SDK implementation
- tests/* - Test files
- bin/* - Binary files and wrappers

### Implementation Steps:

1. **Preparation**:
   - Create branch `p0-phase5c-api-cli-test-migration`
   - Run `npm run fix:imports:dry -- cli/ api/ tests/` to identify affected files
   - Create a prioritized list of files to update

2. **Migration Process**:
   - For CLI files:
     - Update import statements with `.js` extensions
     - Ensure compatibility with existing workflows
     - Update binary wrappers if needed

   - For API/SDK files:
     - Update import statements with `.js` extensions
     - Ensure public API remains stable
     - Update exported types to use proper patterns

   - For test files:
     - Update import statements with `.js` extensions
     - Fix mock implementations to follow new patterns
     - Update test utilities to use proper patterns

3. **Special Attention**:
   - Ensure CLI backward compatibility
   - Verify API/SDK works with both ESM and CommonJS consumers
   - Add tests for dual module system support
   - Review test mocks for proper implementation

4. **Validation**:
   - Run CLI-specific tests
   - Run API/SDK-specific tests
   - Run full test suite
   - Manually test CLI functionality

## Detailed Plan for Phase 5D: Validation and Finalization

Phase 5D will focus on comprehensive validation, addressing edge cases, and finalizing the migration.

### Implementation Steps:

1. **Preparation**:
   - Create branch `p0-phase5d-validation-finalization`
   - Create a list of potential edge cases and issues

2. **Final Migration**:
   - Run `npm run fix:imports:dry` to identify any remaining files
   - Update any remaining files
   - Address special cases and edge cases
   - Fix any inconsistencies in naming conventions

3. **Validation Process**:
   - Run full test suite
   - Test with both ESM and CommonJS consumers
   - Verify build output for both formats
   - Check for any performance issues

4. **Documentation**:
   - Update MODULE-SYSTEM.md with lessons learned
   - Create migration guide for future developers
   - Document any workarounds or special patterns
   - Update contributing guidelines

5. **Finalization**:
   - Merge to main branch
   - Create release with changes
   - Remove any temporary migration tools/scripts

## Risk Mitigation

1. **Rollback Plan**:
   - Each sub-phase will be in its own branch
   - If issues are encountered, we can roll back to the previous sub-phase
   - Keep detailed records of changes for manual rollback if needed

2. **Testing Strategy**:
   - Run tests after each small batch of changes
   - Focus on affected areas first, then run full suite
   - Add specific tests for module resolution
   - Test both ESM and CommonJS consumption

3. **Communication Plan**:
   - Document progress and issues in the GitHub issue
   - Update the team on completed sub-phases
   - Document any major findings or patterns

## Timeline

Total estimated time: 4-6 days

- Phase 5A: 1 day
- Phase 5B: 1-2 days
- Phase 5C: 1-2 days
- Phase 5D: 1 day

This timeline assumes focused work on module migration without significant interruptions. It may be extended if major issues are encountered or if additional refactoring is needed.