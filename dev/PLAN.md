# Migration Plan for Error Handling System

## Overview

The new error handling system has been implemented with the following key features:
- `ErrorSeverity` enum with `Fatal`, `Recoverable`, and `Warning` levels
- Enhanced `MeldError` base class with severity and context support
- Updated `InterpreterOptions` to include strict mode and error handler
- Updated `InterpreterService` to handle errors based on severity and mode
- Error testing utilities for testing both strict and permissive modes

## Migration Strategy

1. **Categorize Tests**: Group skipped/todo tests by component and error type ✅
2. **Verify Implementation**: Check if the error handling is already implemented for each component ✅
3. **Update Tests**: Implement tests using the new error testing utilities ✅ (mostly complete)
4. **Verify Coverage**: Ensure all error scenarios are covered ✅ (in progress)

## Implementation Status

### 1. Resolver Tests - COMPLETED ✅

All resolver tests have been successfully migrated to use the new error handling system:

#### TextResolver Tests - COMPLETED ✅
- `should handle environment variables appropriately (pending new error system)` ✅
- `should handle undefined variables (pending new error system)` ✅

#### CommandResolver Tests - COMPLETED ✅
- `should handle undefined commands appropriately (pending new error system)` ✅
- `should handle parameter count mismatches appropriately (pending new error system)` ✅

#### DataResolver Tests - COMPLETED ✅
- `should handle undefined variables appropriately (pending new error system)` ✅
- `should handle field access restrictions appropriately (pending new error system)` ✅
- `should handle null/undefined field access appropriately (pending new error system)` ✅
- `should handle accessing field of non-object (pending new error system)` ✅
- `should handle accessing non-existent field (pending new error system)` ✅

### 2. Directive Handler Tests - IN PROGRESS

#### TextDirectiveHandler Integration Tests
- `should handle circular reference detection - Complex error handling deferred for V1`
- `should handle error propagation through the stack - Complex error propagation deferred for V1`
- `should handle validation errors with proper context`
- `should handle mixed directive types - Complex directive interaction deferred for V1`

### 3. CLI Service Tests - IN PROGRESS

The CLIService.test.ts file has been partially updated:
- ✅ Fixed Logger type import and mockLogger initialization
- ✅ Implemented tests for overwrite cancellation and confirmation with the new error system
- ⚠️ Need to remove the todo comments since the tests have already been implemented

### 4. FuzzyMatchingValidator Tests

**Todo Tests:**
- `should reject fuzzy thresholds below 0 - Edge case validation deferred for V1`
- `should reject fuzzy thresholds above 1 - Edge case validation deferred for V1`
- `should reject non-numeric fuzzy thresholds - Edge case validation deferred for V1`
- `should provide helpful error messages - Detailed error messaging deferred for V1`

### 5. CLI Tests

**Todo Tests:**
- `should handle missing data fields appropriately (pending new error system)`
- `should handle missing env vars appropriately (pending new error system)`
- `should not warn on expected stderr from commands`
- `should handle type coercion silently`

### 6. Init Command Tests

**Skipped Tests:**
- `should exit if meld.json already exists`

### 7. API Tests

**Skipped Tests:**
- `should handle large files efficiently`
- `should handle deeply nested imports`

### 8. InterpreterService Integration Tests

**Todo Tests:**
- `handles nested imports with state inheritance`
- `maintains correct state after successful imports`
- `handles nested directive values correctly`

## Implementation Timeline

1. **Week 1: Core Resolver Tests** ✅
   - Implement TextResolver tests ✅
   - Implement CommandResolver tests ✅
   - Implement DataResolver tests ✅

2. **Week 2: Directive Handler Tests** 🔄
   - Implement TextDirectiveHandler integration tests
   - Implement other directive handler tests as needed

3. **Week 3: CLI and Validation Tests** 🔄
   - Implement CLI Service tests ✅ (partially complete)
   - Implement FuzzyMatchingValidator tests
   - Implement CLI tests

4. **Week 4: API and Integration Tests**
   - Implement API tests
   - Implement InterpreterService integration tests
   - Final verification and cleanup

## Verification Process

For each implemented test:
1. Run the test to verify it passes
2. Check code coverage to ensure the error handling code is exercised
3. Verify that both strict and permissive modes are tested
4. Update any related documentation

## Conclusion

This migration plan provides a comprehensive approach to updating the skipped and todo tests to use the new error handling system. By following this plan, we can ensure that all error scenarios are properly tested in both strict and permissive modes, providing a robust foundation for the Meld language interpreter.

## Current Progress Summary

As of the current update:

1. All resolver tests (TextResolver, CommandResolver, DataResolver) have been successfully migrated to use the new error handling system. These tests properly verify both strict and permissive error handling modes.

2. The CLIService tests have been partially updated:
   - The mockLogger has been properly initialized with vi.fn() mocks for each method
   - Tests for overwrite cancellation and confirmation have been implemented with the new error system
   - The todo comments need to be removed since the actual implementations exist

3. The remaining tests (Directive Handler, FuzzyMatchingValidator, CLI, Init Command, API, and InterpreterService Integration) still need to be migrated to use the new error handling system.

4. The error handling system is working as expected, allowing for more permissive error states in CLI usage compared to API usage and internal services.
