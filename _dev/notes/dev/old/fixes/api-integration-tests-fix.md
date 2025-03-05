# API Integration Tests Fix

## Issue

The API integration tests are failing with path resolution issues. The main problem appears to be a mismatch between how the path directive is parsed by the parser and how it's expected by the validator and handler.

## Root Causes

1. **Node Structure Mismatch**: The parser produces path directives with `id` and `path` properties, but the handlers and validators expect `identifier` and `value`.

2. **Resolution Context**: The path resolution is failing because the path service can't convert structured paths into resolved paths.

## Recommended Fixes

1. **Make all validators handle both formats**: Update the validators to accept either format.
   - `id` OR `identifier`
   - `value` OR `path.raw`

2. **Add more robust debugging**: We need better diagnostics on what's happening with paths.

3. **Fix the path directive handler**: Ensure it properly handles the new format.

The fixes have already been applied to:
1. `services/resolution/ValidationService/validators/PathDirectiveValidator.ts`
2. `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts`
3. `services/resolution/ResolutionService/resolvers/PathResolver.ts`

## Test Changes

1. Updated error message expectations for path validation tests:
   - Instead of checking for "Raw absolute paths are not allowed", now check for "special path variable"
   - Instead of checking for "Path cannot contain . or .. segments", now check for "relative segments"

## Additional Debugging

Added debugging output to the integration test setup to verify that the path service is properly initialized.