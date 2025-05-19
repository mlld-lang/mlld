# Old Tests Assessment - Remaining Work

This document tracks the remaining migration work for tests in the `tests/` directory after completing the deletion phase.

## Tests to Migrate

### 1. StateService
- `state/StateService/StateService.transformation.test.ts` → `services/state/StateService/` 
  - Provides unique transformation coverage not in main service tests

### 2. ResolutionService
- `specific-variable-resolution.test.ts` → `tests/e2e/` 
  - E2E transformation testing
- `variable-resolution-visualization.test.ts` → `tests/debug/` 
  - Creates debug outputs for documentation
- `enhanced-field-access.test.ts` → `tests/e2e/` 
  - Tests client interface and formatting context
- `enhanced-object-access.test.ts` → `tests/e2e/` 
  - Tests runMeld integration with field access

### 3. OutputService
- `output-filename-handling.test.ts` → `services/cli/CLIService/` 
  - CLI-specific filename generation functionality
- `output-service-add-transformation.test.ts` → `services/pipeline/OutputService/` 
  - Bug fix regression test for add directive transformation

### 4. PathService
- `path-variable-add-fix.test.ts` → `tests/e2e/` 
  - Bug fix scenario for path variable resolution

### 5. URLContentResolver
- `url-functionality.test.ts` → `tests/e2e/` 
  - Comprehensive integration tests
- `url-resolver-delegation.test.ts` → `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler/`
  - Tests handler-specific delegation to URLContentResolver

### 6. CLI Integration Tests
- `cli/cli-error-handling.test.ts` → `tests/integration/cli-error-modes.test.ts`
  - Tests CLI error handling in both permissive and strict modes

### 7. Pipeline Integration Tests
- `pipeline/pipelineValidation.test.ts` → `tests/integration/pipeline-initialization.test.ts`
  - Tests pipeline service initialization

### 8. SourceMap Integration
- `sourcemap/sourcemap-integration.test.ts` → `tests/integration/sourcemap-errors.test.ts`
  - Tests error handling in sourcemap integration

### 9. DI Container Tests (keep in current location or move to tests/integration)
- `service-interface-alignment.test.ts`
- `direct-container-resolution.test.ts`
- `module-configuration.test.ts`

### 10. Regression Tests (keep as-is)
- `regression/circular-dependency-fix.test.ts`
- `regression/module-resolution.test.ts`

## Migration Tasks

### 1. Create new test directories
```bash
mkdir -p tests/integration
mkdir -p tests/debug
```

### 2. Update imports in migrated tests
- Change `@core/syntax/types` → `@core/ast/types`
- Update any references to old node structures

### 3. Move tests to new locations
Execute migrations for each category of tests listed above.

### 4. Run tests after migration
Ensure all migrated tests pass in their new locations.

## Summary

- **Tests to migrate**: 22 files
- **New directories needed**: `tests/integration/`, `tests/debug/`
- **E2E tests**: Already have directory
- **Utils**: Keep all test utilities (already in correct location)

The deletion phase has been completed, removing 45 outdated test files. All that remains is to migrate the valuable tests to their appropriate new locations.