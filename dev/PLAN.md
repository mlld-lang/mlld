# Meld API-First Development Plan

## Overview

This document outlines our plan to complete the Meld implementation using an API-first approach. We will:

1. Focus solely on completing and strengthening the API
2. Build a new CLI as a thin wrapper on top of the completed API

This approach will result in a cleaner architecture with less duplication, and the CLI will benefit from the well-tested API underneath.

## Progress Update

As of our latest milestone, we have:

1. Completed Phase 2.1 (API Surface Refinement)
2. Identified issues with API integration tests that need to be addressed
3. Created a detailed plan for fixing these tests before proceeding with CLI implementation

## Existing Infrastructure Assessment

After careful review, we have identified that we already have substantial infrastructure in place:

### Path Handling
- `PathService` with test mode support (`enableTestMode()`)
- Path validation and resolution for special variables ($HOMEPATH/$~, $PROJECTPATH/$.)
- Path validation and resolution for user-defined path variables ($path) created by @path directives
- `TestContext.resolveSpecialPath()` for handling special path syntax in tests
- Existing path tests in `PathService.test.ts` and `PathService.tmp.test.ts`

### Testing Infrastructure
- Comprehensive `TestContext` with methods for:
  - File operations (`writeFile`, etc.)
  - Path resolution (`resolveSpecialPath`)
  - CLI testing (`setupCliTest`)
  - Environment variable management (`withEnvironment`)
  - Service management (`enableTransformation`, `disableTransformation`, etc.)
- `MemfsTestFileSystem` for in-memory file operations
- `MemfsTestFileSystemAdapter` for CLI testing
- CLI-specific test helpers:
  - `cliTestHelper.ts` with `setupCliTest`
  - `mockProcessExit.ts` and `mockConsole.ts`
- Debug services:
  - `StateDebuggerService`
  - `StateTrackingService`
  - `StateVisualizationService`
  - `StateHistoryService`

### Service Management
- Service validation via `validateServicePipeline()`
- Service initialization order management
- Error handling for service initialization via `ServiceInitializationError`
- Pipeline validation tests in `pipelineValidation.test.ts`

## Phase 1: API Completion and Enhancement (3-5 days)

### 1.1 Comprehensive API Integration Tests

**Goal**: Create a robust test suite that exercises all Meld functionality through the API.

**Status**: Tests created, but many are failing due to parser/validator mismatches

**Tasks**:
- Create `api/integration.test.ts` with complex Meld scripts that test:
  - Variable definitions and references (text, data, path)
  - Path handling with special variables ($HOMEPATH/$~, $PROJECTPATH/$.)
  - Path handling with user-defined path variables ($path) from @path directives
  - Imports with nested dependencies
  - Commands and execution
  - Directive processing
- Test different output formats (markdown, LLM)
- Test error handling and recovery
- Test transformation mode

**Implementation Details**:
- Leverage existing `TestContext` for test setup
- Use existing path resolution methods in `TestContext`
- Utilize existing debug services for state visualization and tracking
- Create test fixtures that exercise all directive types

### 1.2 Path Handling Integration

**Goal**: Ensure robust path handling in all contexts, especially in the test environment.

**Status**: Partially complete; some path-related tests passing

**Tasks**:
- Consolidate existing path handling capabilities
- Ensure consistent handling of special path variables
- Ensure consistent handling of user-defined path variables from @path directives
- Test path validation and security constraints

**Implementation Details**:
- Leverage existing `PathService.enableTestMode()` in all tests
- Use existing `TestContext.resolveSpecialPath()` for path resolution
- Ensure `PathService` tests are comprehensive
- Add path-specific assertions to `TestContext` if needed

### 1.3 Service Validation and Error Handling

**Goal**: Complete the service validation system and ensure robust error handling.

**Tasks**:
- Finalize service dependency validation
- Enhance error handling for service initialization
- Ensure proper error propagation
- Test error recovery scenarios

**Implementation Details**:
- Leverage existing `validateServicePipeline()` from `core/utils/serviceValidation.ts`
- Use existing `ServiceInitializationError` for initialization failures
- Ensure all services properly implement their interfaces
- Test service initialization with missing or invalid dependencies

### 1.4 State Management and Transformation

**Goal**: Ensure robust state management and transformation capabilities.

**Tasks**:
- [x] Complete transformation mode implementation
- [x] Test state cloning and immutability
- [x] Verify state event propagation
- [ ] Complete testing of complex state transformations

### 1.5 API Integration Test Fixes

**Goal**: Fix the failing API integration tests to ensure a stable foundation for the CLI implementation.

**Current Status**: Significant progress made; fewer failing tests

**Issues Addressed**:
- [x] Resolved mismatches between AST node structure and validator/handler expectations
- [x] Fixed property name inconsistencies for Path directives
- [x] Improved handling of `TextVar` nodes
- [x] Enhanced variable resolution with AST-based parsing

**Tasks**:
1. **Path Directive Fixes**:
   - [x] Update `PathDirectiveValidator` to accept both `id` and `identifier`
   - [x] Update `PathDirectiveValidator` to extract path from `path.raw`
   - [x] Update `PathDirectiveHandler` to handle both property formats
   - [x] Fix remaining `getPathVar` issue in `PathResolver.ts`

2. **Fix Import Directive Handling**:
   - [x] Analyze AST structure through debug tests
   - [x] Update `ImportDirectiveValidator` to handle structured path objects
   - [ ] Complete updates to `ImportDirectiveHandler` for path extraction
   - [ ] Verify test expectations for imports

3. **Fix Define Directive Handling**:
   - [x] Analyze Define directive AST structure
   - [ ] Update `DefineDirectiveValidator` for property flexibility
   - [ ] Update `DefineDirectiveHandler` for value extraction
   - [ ] Fix command execution tests

4. **Fix Embed Directive Handling**:
   - [x] Analyze Embed directive AST structure
   - [ ] Complete updates to validators and handlers
   - [ ] Fix test fixtures for embed tests

5. **Fix TextVar Node Processing**:
   - [x] Analyze TextVar node structure
   - [x] Add support in interpreter for TextVar nodes
   - [x] Implement proper variable resolution in text contexts

6. **Fix Code Fence Tests**:
   - [ ] Complete updates to code fence test fixtures
   - [ ] Ensure proper code fence block parsing
   - [ ] Verify output formatting for code fences

**Implementation Details**:
- Use direct fixes to validators/handlers to align with AST structure
- Document updated AST node formats for future reference
- Leverage robust test infrastructure to verify fixes

**Completion Criteria**:
- All API integration tests passing
- Consistent handling of all directive types
- Proper documentation of AST structures

## Phase 2: API Cleanup and Documentation (1-2 days)

### 2.1 API Surface Refinement

**Status**: COMPLETED ✅

**Accomplishments**:
- Added JSDoc comments to all public methods in `api/index.ts`
- Ensured consistent naming patterns across all API methods
- Added proper TypeScript typing to all exports
- Exported all necessary error types for API users
- Created `examples/api-example.ts` to demonstrate proper usage
- Created comprehensive API documentation in `docs/API.md`
- Added documentation about error types and handling

### 2.2 API Demo Script

**Goal**: Create a comprehensive demo script that showcases the API's capabilities.

**Status**: Not started

**Tasks**:
- [ ] Create a sample Meld script demonstrating all key features
- [ ] Include examples of the new unified variable syntax
- [ ] Demonstrate path handling with special variables and user-defined paths
- [ ] Create a step-by-step guide for running the demo

### 2.3 Documentation Updates

**Goal**: Ensure all documentation is up-to-date with the latest API changes.

**Status**: Partially complete

**Tasks**:
- [x] Document path handling improvements
- [x] Document variable syntax unification
- [ ] Update utility documentation
- [ ] Create tutorials for variable usage patterns
- [ ] Document error handling patterns

**Implementation Details**:
- [x] Created `dev/FIXPATHS.md` for path handling documentation
- [x] Created `dev/FIXPARSE.md` for variable syntax documentation
- [x] Consolidated learnings in `dev/FIXPATHSPARSE.md`
- [ ] Update user-facing documentation in `docs/` directory

## Phase 3: CLI Implementation (2-3 days)

### 3.1 CLI Core Implementation

**Goal**: Create a minimal CLI wrapper around the API.

**Status**: Not started

**Tasks**:
- [ ] Create new CLI entry point
- [ ] Implement command-line argument parsing
- [ ] Map CLI options to API options
- [ ] Handle basic file I/O

**Implementation Details**:
- Leverage our consolidated understanding of path handling
- Ensure proper handling of special path variables
- Use consistent variable resolution approach

### 3.2 CLI-Specific Features

**Goal**: Implement CLI-specific features that aren't part of the core API.

**Status**: Not started

**Tasks**:
- [ ] Implement watch mode
- [ ] Add version and help commands
- [ ] Handle stdout output
- [ ] Implement interactive prompts

### 3.3 CLI Error Handling

**Goal**: Provide user-friendly error handling in the CLI.

**Status**: Not started

**Tasks**:
- [ ] Map API errors to CLI error messages
- [ ] Set appropriate exit codes
- [ ] Support strict mode
- [ ] Implement verbose error reporting

## Phase 4: CLI Testing (1-2 days)

**Status**: Not started

### 4.1 CLI-Specific Tests

**Goal**: Create tests for CLI-specific functionality.

**Tasks**:
- [ ] Test command-line argument parsing
- [ ] Test CLI-to-API option mapping
- [ ] Test error handling and exit codes
- [ ] Test watch mode

### 4.2 End-to-End Tests

**Goal**: Create end-to-end tests that verify the CLI works correctly with the API.

**Tasks**:
- [ ] Test processing complete Meld documents
- [ ] Test all output formats
- [ ] Test error scenarios
- [ ] Test with real file system (optional)

## Phase 5: Migration Strategy (1-2 days)

**Status**: Not started

### 5.1 Deprecation Plan

**Goal**: Create a plan for deprecating the old CLI.

**Tasks**:
- [ ] Identify breaking changes between old and new CLI
- [ ] Create migration guide for users
- [ ] Implement deprecation warnings
- [ ] Plan for backward compatibility where possible

### 5.2 Release Strategy

**Goal**: Plan for a smooth release of the new API and CLI.

**Tasks**:
- [ ] Create release timeline
- [ ] Plan for beta testing
- [ ] Create release notes
- [ ] Plan for post-release support

## Revised Timeline

Based on our recent progress and remaining work:

- **Complete Phase 1.5: API Integration Test Fixes** (1-2 days)
  - Fix remaining directive handlers (Import, Define, Embed)
  - Complete code fence test fixes
  - Final cleanup and documentation

- **Complete Phase 2: API Cleanup and Documentation** (1-2 days)
  - Performance optimization for new variable resolution
  - API demo script creation
  - Documentation updates incorporating recent learnings

- **Phase 3: CLI Implementation** (2-3 days)
  - CLI core implementation
  - CLI-specific features
  - CLI error handling

- **Phase 4: CLI Testing** (1-2 days)
  - CLI-specific tests
  - End-to-end tests

- **Phase 5: Migration Strategy** (1 day)
  - Deprecation plan
  - Release strategy

**Total Revised Estimate**: 6-10 days

## Implementation Guidelines

Throughout all phases, adhere to these guidelines:

1. **Leverage Recent Improvements**:
   - Use the new unified variable syntax
   - Leverage the AST-based variable resolution
   - Apply the learnings from path handling fixes
   - Maintain separation between path, text, and data variables

2. **Maintain Type Safety**:
   - Ensure proper TypeScript typing
   - Use interfaces for all service interactions
   - Maintain strict type checking

3. **Follow Established Patterns**:
   - Use service initialization patterns from `api/index.ts`
   - Follow error handling patterns from core services
   - Use consistent naming conventions

4. **Ensure Comprehensive Testing**:
   - Maintain high test coverage
   - Test error cases thoroughly
   - Test edge cases and boundary conditions
   - Use snapshot testing where appropriate
   - Leverage our robust testing infrastructure

## Success Criteria

The implementation will be considered successful when:

1. All API tests pass, including the previously failing integration tests
2. Path handling works correctly in all contexts
3. Variable resolution is consistent with our unified syntax
4. Service validation prevents invalid configurations
5. The API is well-documented with examples and tutorials
6. The CLI successfully wraps the API with all required functionality
7. All CLI tests pass
8. Documentation is complete and accurate
9. A migration path is provided for existing users

## Reference

The CLI test requirements have been preserved in `dev/CLITESTS.md` for future reference when implementing the new CLI.