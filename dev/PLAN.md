# Meld API-First Development Plan

## Overview

This document outlines our plan to complete the Meld implementation using an API-first approach. We will:

1. Delete the current CLI implementation and tests
2. Focus solely on completing and strengthening the API
3. Build a new CLI as a thin wrapper on top of the completed API

This approach will result in a cleaner architecture with less duplication, and the CLI will benefit from the well-tested API underneath.

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
- Complete transformation mode implementation
- Test state cloning and immutability
- Verify state event propagation
- Test complex state transformations

**Implementation Details**:
- Leverage existing debug services:
  - `StateDebuggerService`
  - `StateTrackingService`
  - `StateVisualizationService`
  - `StateHistoryService`
- Test state transformations with complex directives
- Verify state isolation between imports
- Test circular reference detection

## Phase 2: API Cleanup and Documentation (2-3 days)

### 2.1 API Surface Refinement

**Goal**: Ensure the API has a clean, consistent, and well-documented surface.

**Tasks**:
- Review and refine public API methods
- Ensure consistent naming and parameter patterns
- Document all public methods and types
- Create usage examples

**Implementation Details**:
- Focus on `api/index.ts` exports
- Ensure proper TypeScript typing
- Add JSDoc comments to all public methods
- Create example usage patterns

### 2.2 Performance Optimization

**Goal**: Identify and address any performance bottlenecks.

**Tasks**:
- Profile API operations
- Optimize critical paths
- Reduce memory usage
- Improve parsing performance

**Implementation Details**:
- Use Node.js profiling tools
- Create performance benchmarks
- Test with large Meld documents
- Optimize state management for large documents

### 2.3 API Demo Script

**Goal**: Create a comprehensive demo script that showcases the API's capabilities.

**Tasks**:
- Create a sample Meld script that demonstrates all key features
- Document the script with detailed comments
- Create a step-by-step guide for running the demo
- Use the demo in documentation and tutorials

**Implementation Details**:
- Create `examples/api-demo.meld` with comprehensive examples
- Include examples of all directive types
- Demonstrate variable resolution and path handling
- Show import resolution and command execution
- Include examples of transformation mode

### 2.4 Documentation Updates

**Goal**: Ensure all documentation is up-to-date with the latest API changes.

**Tasks**:
- Update API documentation
- Update utility documentation
- Create new tutorials and guides
- Ensure consistency across all documentation

**Implementation Details**:
- Update `docs/API.md` with latest API surface
- Update `docs/UTILS.md` with latest utility infrastructure
- Create `docs/PATHS.md` for path handling documentation
- Create `docs/TESTING.md` for testing infrastructure documentation
- Ensure all documentation follows the same format and style

## Phase 3: CLI Implementation (2-3 days)

### 3.1 CLI Core Implementation

**Goal**: Create a minimal CLI wrapper around the API.

**Tasks**:
- Create new CLI entry point
- Implement command-line argument parsing
- Map CLI options to API options
- Handle basic file I/O

**Implementation Details**:
- Create `cli/index.ts` as a thin wrapper
- Use `commander` or similar for argument parsing
- Map CLI options directly to `ProcessOptions`
- Leverage API's `main()` function for processing

### 3.2 CLI-Specific Features

**Goal**: Implement CLI-specific features that aren't part of the core API.

**Tasks**:
- Implement watch mode
- Add version and help commands
- Handle stdout output
- Implement interactive prompts

**Implementation Details**:
- Use `fs.watch` or `chokidar` for file watching
- Create help text generator
- Implement console output formatting
- Use `readline` for interactive prompts

### 3.3 CLI Error Handling

**Goal**: Provide user-friendly error handling in the CLI.

**Tasks**:
- Map API errors to CLI error messages
- Set appropriate exit codes
- Support strict mode
- Implement verbose error reporting

**Implementation Details**:
- Create error mapper from API errors to CLI messages
- Use consistent exit codes
- Implement `--strict` flag
- Add `--verbose` flag for detailed errors

## Phase 4: CLI Testing (1-2 days)

### 4.1 CLI-Specific Tests

**Goal**: Create tests for CLI-specific functionality.

**Tasks**:
- Test command-line argument parsing
- Test CLI-to-API option mapping
- Test error handling and exit codes
- Test watch mode

**Implementation Details**:
- Create `cli/cli.test.ts`
- Use existing `mockProcessExit` and `mockConsole` from test utilities
- Use existing `setupCliTest` helper
- Verify correct API calls

### 4.2 End-to-End Tests

**Goal**: Create end-to-end tests that verify the CLI works correctly with the API.

**Tasks**:
- Test processing complete Meld documents
- Test all output formats
- Test error scenarios
- Test with real file system (optional)

**Implementation Details**:
- Create `cli/e2e.test.ts`
- Use test fixtures from API tests
- Verify output matches expectations
- Test all CLI options

## Phase 5: Migration Strategy (1-2 days)

### 5.1 Deprecation Plan

**Goal**: Create a plan for deprecating the old CLI.

**Tasks**:
- Identify breaking changes between old and new CLI
- Create migration guide for users
- Implement deprecation warnings
- Plan for backward compatibility where possible

**Implementation Details**:
- Document breaking changes in `docs/MIGRATION.md`
- Create examples of migrating from old to new CLI
- Implement deprecation warnings in old CLI
- Create compatibility layer if necessary

### 5.2 Release Strategy

**Goal**: Plan for a smooth release of the new API and CLI.

**Tasks**:
- Create release timeline
- Plan for beta testing
- Create release notes
- Plan for post-release support

**Implementation Details**:
- Create `dev/RELEASE.md` with release timeline
- Identify beta testers and create beta testing plan
- Draft release notes with migration guide
- Create support plan for post-release issues

## Implementation Guidelines

Throughout all phases, adhere to these guidelines:

1. **Leverage Existing Infrastructure**:
   - Use `TestContext` for test setup
   - Leverage `MemfsTestFileSystem` for file operations
   - Utilize existing test factories and utilities
   - Use the established error handling system
   - Use existing path resolution methods
   - Leverage existing debug services

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

## Success Criteria

The implementation will be considered successful when:

1. All API tests pass, including new integration tests
2. Path handling works correctly in all contexts, including user-defined path variables
3. Service validation prevents invalid configurations
4. The API is well-documented with examples and tutorials
5. The CLI successfully wraps the API with all required functionality
6. All CLI tests pass
7. Documentation is complete and accurate
8. A migration path is provided for existing users

## Timeline

- **Session 1**: API Integration Tests (1 hour)
  - Create comprehensive API integration tests
  - Test path handling and variable resolution
  - Leverage existing TestContext infrastructure

- **Session 2**: API Refinement and Demo (1 hour)
  - Clean up API surface
  - Create API demo script
  - Document key API methods

- **Session 3**: CLI Implementation (1 hour)
  - Create CLI wrapper around API
  - Implement command-line argument parsing
  - Map CLI options to API options

- **Session 4**: CLI Testing and Documentation (1 hour)
  - Create CLI tests
  - Document migration path
  - Finalize documentation

**Total Estimated Time**: 4 hours of Claude-assisted development

This timeline reflects the power of AI-assisted development with Claude when working with someone who knows the codebase well. Most of the infrastructure already exists, and Claude can rapidly implement the remaining pieces with proper guidance.

## Reference

The CLI test requirements have been preserved in `dev/CLITESTS.md` for future reference when implementing the new CLI.