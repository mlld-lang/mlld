# Old Tests Assessment

This document assesses the tests in the `tests/` directory after the major rewrite of our AST and types. It categorizes which tests should be kept/updated versus which should be deleted.

## Service-Level Test Audit Results

### Tests to KEEP (and migrate)

1. **StateService**:
   - `state/StateService/StateService.transformation.test.ts` → `services/state/StateService/` (unique transformation coverage)

2. **ResolutionService**:
   - `specific-variable-resolution.test.ts` → `tests/e2e/` (E2E transformation testing)
   - `variable-resolution-visualization.test.ts` → `tests/debug/` (debug outputs for documentation)
   - `enhanced-field-access.test.ts` → `tests/e2e/` (client interface testing)
   - `enhanced-object-access.test.ts` → `tests/e2e/` (runMeld integration)

3. **OutputService**:
   - `output-filename-handling.test.ts` → `services/cli/CLIService/` (CLI-specific functionality)
   - `output-service-add-transformation.test.ts` → `services/pipeline/OutputService/` (bug fix regression)

4. **PathService**:
   - `path-variable-add-fix.test.ts` → `tests/e2e/` (bug fix scenario)

5. **URLContentResolver**:
   - `url-functionality.test.ts` → `tests/e2e/` (comprehensive integration tests)
   - `url-resolver-delegation.test.ts` → `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler/`

6. **CLI tests**:
   - `cli/cli-error-handling.test.ts` → `tests/integration/cli-error-modes.test.ts`

7. **Pipeline tests**:
   - `pipeline/pipelineValidation.test.ts` → `tests/integration/pipeline-initialization.test.ts`

8. **SourceMap**:
   - `sourcemap/sourcemap-integration.test.ts` → `tests/integration/sourcemap-errors.test.ts`

9. **DI Container tests**:
   - `service-interface-alignment.test.ts` - Keep in tests/integration
   - `direct-container-resolution.test.ts` - Keep in tests/integration
   - `module-configuration.test.ts` - Keep in tests/integration

10. **Regression tests** - Keep as-is:
    - `regression/circular-dependency-fix.test.ts`
    - `regression/module-resolution.test.ts`

11. **Utils directory** - Still relevant:
    - `utils/di/` - DI test utilities
    - `utils/debug/` - Debug visualization services  
    - `utils/fs/` - Mock filesystem utilities
    - `utils/cli/` - CLI test helpers

### Tests to DELETE

1. **Redundant URL tests**:
   - `fs/PathService.url-delegation.test.ts` (covered by service tests)
   - `url-handling.test.ts` (duplicates service tests)
   - `url-resolver-delegation-pipeline.test.ts` (skipped and redundant)

2. **Old directive handler tests** (using old AST structure):
   - `add-directive-fixes.test.ts` - Uses old `node.directive` pattern
   - `add-directive-transformation-fixes.test.ts`
   - `debug-add.test.ts` - Old add/embed syntax
   - `nested-data-directives.test.ts`
   - `nested-text-directives.test.ts`
   - `run-directive-fix.test.ts`

3. **Old mocks** (outdated patterns):
   - `mocks/directive-handlers.ts` - Still uses `@injectable` and old node structure
   - `mocks/meld-ast.ts` - Old AST structure
   - `mocks/meld-spec.ts` - Old spec structure
   - `mocks/path.ts` - Old path resolution
   - `mocks/state.ts` - Old state service

4. **Old fixtures** (outdated structure):
   - The JSON fixtures still reference old project structures
   - Should use the new fixtures from `core/fixtures`

5. **JavaScript tests**:
   - `add-variable-test.js`
   - `circular-dependency-test.js`

6. **Transformation tests with old patterns**:
   - `add-transformation-e2e.test.ts` - Uses old handler patterns
   - `add-transformation-variable-comprehensive.test.ts`
   - `add-transformation-variable-fix.test.ts`
   - `add-var.test.ts`
   - `add-variable-transform-fix.test.ts`
   - `debug-variable-add.test.ts`
   - `variable-add-transform.test.ts`
   - `variable-add-transformation.integration.test.ts`
   
7. **Phase-specific tests** (temporary development):
   - `phase4b-fix.test.ts`
   - `phase4b-variable-fix.test.ts`

8. **Miscellaneous outdated tests**:
   - `api-workarounds.test.ts`
   - `circular-dependency-resolution.test.ts` (duplicate of regression test)
   - `codefence-duplication-fix.test.ts`
   - `comment-handling-fix.test.ts`
   - `debug/import-debug.test.ts`
   - `factory-pattern-integration.test.ts`
   - `object-property-access.test.ts`
   - `object-property-access-comprehensive.test.ts`
   - `parent-object-reference.test.ts`
   - `run-command-reference-ast.test.ts`
   - `run-multiline-command.test.ts`
   - `samples/di-sample.test.ts` (example code, not real test)
   - `specific-nested-array.test.ts`
   - `transformation-debug.test.ts`
   - `variable-index-debug.test.ts`
   - `xml-output-format.test.ts`
   - `newline-variable-handling.test.ts`
   - `add-line-number-fix.test.ts`

## Migration Strategy

1. **Migrate service-specific tests** to their respective service directories
2. **Create new test directories** for categorized tests:
   - `tests/integration/` - For cross-service integration tests
   - `tests/e2e/` - For end-to-end transformation tests
   - `tests/debug/` - For debug visualization tests
3. **Update imports** in kept tests from `@core/syntax/types` to `@core/ast/types`
4. **Delete outdated tests** that use old AST patterns or duplicate functionality
5. **Remove old mocks and fixtures** that no longer align with current architecture

## Summary Statistics

- **Tests to Keep**: 22 files (will be migrated/reorganized)
- **Tests to Delete**: 45 files (outdated/redundant)
- **Utilities**: Keep all test utilities (already updated for new DI)

## Context

This assessment was performed after:
- Major AST and type restructuring  
- Moving from separate AST/runtime types to unified types
- Updating directive names (embed → add, define → exec)
- Moving to fixture-based testing from `core/fixtures`
- Implementing new dependency injection patterns
- Comprehensive review comparing service tests with tests/ directory

The audit process involved:
1. Comparing service tests in `services/` with corresponding tests in `tests/`
2. Identifying unique value vs duplication
3. Categorizing tests as unit, integration, E2E, or debug utilities
4. Determining appropriate new locations for tests worth keeping