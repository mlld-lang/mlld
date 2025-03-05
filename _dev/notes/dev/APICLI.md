# CLI to API Migration Plan

## Overview

Currently, the Meld CLI implementation has its own service initialization and pipeline management approach, which duplicates logic from the API implementation. This has led to inconsistencies, test failures, and maintenance challenges. This document outlines a plan to refactor the CLI to be a thin wrapper around the API.

## Current State Analysis

### API Implementation (`api/index.ts`)
- Uses a structured approach to service initialization via `createDefaultServices()`
- Validates service dependency graph with `validateServicePipeline()`
- Has proper error handling with type preservation
- Supports transformation mode, debug options, and service injection
- All tests pass (14/14)

### CLI Implementation (`cli/index.ts` and `services/cli/CLIService/CLIService.ts`)
- Initializes services in a fixed order without validation
- Has inconsistent error handling with direct `process.exit` calls
- Duplicates service initialization logic
- Tests are failing (10/12 in priority tests)
- Output conversion errors during tests

## Migration Goals

1. Make the CLI a thin wrapper around the API
2. Eliminate duplicated service initialization
3. Standardize error handling
4. Fix path resolution in tests
5. Improve test reliability
6. Maintain all current CLI features

## Implementation Plan

### Phase 1: Basic Integration

1. **Refactor `cli/index.ts`**
   - Move service initialization to use API's `createDefaultServices()`
   - Update `main()` function to map CLI options to API options
   - Preserve CLI-specific functionality (like watch mode)

2. **Update `CLIService.ts`**
   - Modify to focus on CLI-specific concerns (arg parsing, IO, watch mode)
   - Remove service initialization code
   - Update `run()` method to delegate to API's `main()` function

3. **Fix `parseArgs()` Method**
   - Update to correctly handle 'meld' command name in arguments
   - Clean up path handling for test environments

### Phase 2: Error Handling

1. **Standardize Error Handling**
   - Update CLI error handling to match API approach
   - Properly propagate errors from API to CLI
   - Add error mapping for CLI-specific issues

2. **Improve Process Exit Handling**
   - Consolidate process.exit calls to a single location
   - Make process.exit mockable in a consistent way
   - Ensure tests can verify proper exit behavior

### Phase 3: Test Updates

1. **Update CLI Tests**
   - Fix test setup to match new architecture
   - Ensure proper mocking of file system
   - Standardize process.exit mocking
   - Fix path resolution in tests

2. **Add Integration Tests**
   - Test CLI-to-API integration
   - Verify all CLI options work properly
   - Test error propagation

### Phase 4: Path and Output Handling

1. **Fix Path Resolution**
   - Ensure CLI correctly resolves paths for API
   - Handle special path formats ($PROJECTPATH, $HOMEPATH)
   - Fix test path handling

2. **Fix Output Conversion**
   - Update output handling to use API's approach
   - Resolve "Failed to convert to LLM XML" errors
   - Add tests for output formats

## CLI Test Update Punchlist

### 1. Basic Functionality Tests

- [ ] **Update argument parsing tests**
  - [ ] Update `should process a simple meld file without errors` to verify CLI-to-API mapping
  - [ ] Refocus `should handle command line arguments correctly` on arg parsing not execution
  - [ ] Add test for `main()` function that verifies correct API options construction
  - [ ] Update file path handling in tests to match new API wrapper approach

- [ ] **Update file I/O tests**
  - [ ] Modify `should handle file I/O correctly` to validate file operations separately from processing
  - [ ] Add test for output file path resolution with `--output` option
  - [ ] Add test specifically for output extension handling with different formats
  - [ ] Test file overwrite confirmation behavior (mock readline)

### 2. Error Handling Tests

- [ ] **Update error propagation tests**
  - [ ] Refactor `should handle missing input file errors properly` to use API error types
  - [ ] Update `should handle parse errors properly` to verify correct error mapping to CLI context
  - [ ] Modify `should respect the strict flag for error handling` to validate proper API options setting

- [ ] **Process exit handling**
  - [ ] Create standardized process.exit mocking helper for all tests
  - [ ] Add test for graceful error handling without process.exit in non-terminal contexts
  - [ ] Test process.exit only happens in main module context
  - [ ] Add test for error code mapping from API errors to exit codes

### 3. CLI-Specific Feature Tests

- [ ] **Format and output tests**
  - [ ] Update `should respect output format options` to verify format option mapping to API
  - [ ] Enhance `should handle stdout option correctly` to focus on stdout vs file redirection
  - [ ] Add specific test for API output format conversion mapping

- [ ] **Path handling tests**
  - [ ] Update `should handle PROJECTPATH special variables correctly` to test CLI path translation
  - [ ] Update `should handle HOMEPATH special variables correctly` to test CLI path translation
  - [ ] Add test for CLI-to-API path resolution mapping
  - [ ] Test relative vs. absolute path handling in CLI context

- [ ] **Watch mode tests**
  - [ ] Add dedicated test for watch mode functionality
  - [ ] Test watch mode file change detection
  - [ ] Test watch mode with different output formats
  - [ ] Ensure watch mode properly delegates to API for file processing

### 4. Test Infrastructure Updates

- [ ] **Update test helpers**
  - [ ] Modify `setupCliTest()` to support new CLI-as-API-wrapper architecture
  - [ ] Update mocking approach for process.exit to be consistent
  - [ ] Add console output capture helper that works with new structure
  - [ ] Create helper for validating API calls from CLI

- [ ] **Refactor shared test setup**
  - [ ] Update path handling in test setup for CLI tests
  - [ ] Create standardized test file system setup
  - [ ] Add helper for verifying CLI options mapped to API options
  - [ ] Ensure consistent cleanup in all tests

### 5. New Integration Tests

- [ ] **Add API integration tests**
  - [ ] Test CLI argument parsing to API option mapping
  - [ ] Test error propagation from API to CLI
  - [ ] Test transformation mode enabling via CLI
  - [ ] Test path resolution in mixed CLI/API context

- [ ] **Command handling tests**
  - [ ] Test 'init' command handling
  - [ ] Test version output
  - [ ] Test help command
  - [ ] Test invalid command/option handling

## Migration Process

1. Create a feature branch for the migration
2. Implement changes in phases, with tests after each phase
3. Continuously run priority tests (`npm test priority-cli.test.ts`)
4. Once priority tests pass, run all CLI tests
5. Create PR for review

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking CLI functionality | Comprehensive test coverage before merging |
| Performance regression | Profile before and after changes |
| Missing CLI-specific features | Document all CLI features before starting |
| Path resolution issues | Add specific tests for path handling |
| Watch mode compatibility | Ensure watch mode works with new implementation |

## Expected Outcomes

1. All priority CLI tests pass
2. CLI code is simpler and more maintainable
3. Consistent behavior between CLI and API usage
4. Reduced code duplication
5. Better error handling and reporting
6. Easier to add new features to both CLI and API

## Implementation Progress

### Phase 1 (Basic Integration) Progress

- ✅ Refactored `cli/index.ts` to use API's `createDefaultServices()`
- ✅ Updated `CLIService.ts` to use API's main function for processing
- ✅ Improved path handling for test environments

### Key Challenges Identified

1. **Output Path Resolution**: The CLI writes output files to the project root directory instead of the expected `/project/` directory in tests.
   - Current behavior: When running test with `--output $./output.md`, the file is created at `/Users/adam/dev/meld/output.md` 
   - Expected behavior: File should be created at `/project/output.md`

2. **Error Handling in Strict Mode**: The strict flag isn't properly propagating errors in tests.
   - Current behavior: Recoverable errors in strict mode are still being caught by the test mode handler
   - Expected behavior: In strict mode, all errors should propagate and reject the promise

3. **LLMXML Conversion Issues**: Some test inputs cause conversion failures in the OutputService.
   - Error: "Failed to convert to LLM XML" for complex content
   - Simple text content (e.g., "Hello World!") works fine, but directive content still has issues

### Next Steps

1. **Fix Output Path Resolution**:
   - Update `CLIService.processFile` to properly resolve output paths in test environments
   - Add logging to track path resolution process
   - Consider using a consistent approach for all paths (input and output)

2. **Improve Error Handling**:
   - Make strict mode behavior consistent between CLI and API
   - Update error handler to respect strict flag properly
   - Add test-specific error handling that aligns with expected test behavior

3. **Fix Test Environment**:
   - Create simplified test files that focus on one aspect at a time
   - Add more detailed logging to debug output conversion failures
   - Consider mocking the output service for certain tests to isolate issues

4. **Complete Phase 1 Integration**:
   - Finish adapting all existing tests to the new API-based approach
   - Ensure file I/O works correctly in the test environment
   - Add tests for CLI-specific functionality not covered by API tests

## Success Criteria

1. All priority CLI tests pass
2. API tests continue to pass
3. Manual testing of CLI works as expected
4. Code review approval
5. Reduced code size and complexity