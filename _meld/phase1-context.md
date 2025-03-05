<YourRole>
You are an expert in building reliable and maintainable DSL systems, particularly in structuring state interpreters.

You are passionate about SOLID architecture, taking methodical approaches, and making incremental and testable changes.

You're the architect for meld, an LLM prompt scripting language designed to make it easy to assemble complex context in modular ways using directives:

- @embed to embed text
- @run to run commands
- @define to create commands that can take parameters
- @path, @data, and @text variable types
- @import for importing variables and command definitions from other meld files

We have come a long way and you strongly want to ship meld. You're balancing pragmatism and a yagni spirit with a desire to have absolutely rock solid architecture that's going to serve as the foundation for a widely used open source project.
</YourRole>

# Meld Phase 1: Foundation Repair Context

We are working on fixing critical foundation issues in the Meld codebase, specifically focusing on path parsing/resolution and AST integration. We currently have 645 passing tests and 57 failing tests, many related to these foundation issues.

## Phase 1 Focus Areas

1. Path resolution and parsing issues (property name mismatches, structured path format, special variables)
2. AST integration and proper service architecture (making ParserService the sole interface to meld-ast)

\===============================
\=== SHIPPING PLAN FOR PHASE 1 =

# Meld Shipping Plan

## Overview

This document outlines our strategic plan for completing the Meld implementation and shipping a production-ready version. We currently have 645 passing tests and 57 failing tests, with several known issues documented in our planning files. Our primary measure of success is the API integration tests proving we can properly parse and build correct output from real-world Meld files.

## Strategic Approach

Our approach is organized into phases that build upon each other, with a focus on addressing fundamental issues first. Each phase includes a plan review component to ensure we adapt to newly discovered issues.

## Phase 1: Foundation Repair (3-4 days)

**Goal**: Fix the most critical infrastructure issues related to path parsing and AST handling that are causing test failures.

### 1.1 Path Resolution and Parsing (1-2 days)

**Tasks**:
- Fix the structured path format transition issues in ResolutionService
- Ensure proper handling of special path variables ($PROJECTPATH, $HOMEPATH, $., $~)
- Correct property name mismatches between AST nodes and validator expectations
- Update PathDirectiveHandler to properly handle the StructuredPath object format
- Update PathDirectiveValidator to align with expected test formats

**Success Criteria**:
- Path-related tests pass
- Path variables resolve correctly in different contexts
- Path directive validation works consistently

### 1.2 AST Integration and Service Architecture (1-2 days)

**Tasks**:
- Enforce ParserService as the sole interface to meld-ast
- Remove direct meld-ast imports from other services
- Remove custom code fence validation regex in favor of AST properties
- Update ContentResolver to leverage AST node properties
- Implement the most critical parts of Phase 1 from PLAN-REGEX.md

**Success Criteria**:
- ParserService correctly providing all needed AST functions
- Services properly using AST node properties
- No redundant regex for parsing where AST properties exist

### 1.3 Plan Review and Adjustment (0.5 days)

**Tasks**:
- Review passing and failing tests
- Document newly discovered issues
- Adjust priorities for Phase 2 based on findings
- Update the SHIP.md document with revised timelines

## Phase 2: Variable Resolution System (2-3 days)

**Goal**: Standardize the variable resolution system to use AST-based resolution consistently.

### 2.1 Resolution System Implementation (1-2 days)

**Tasks**:
- Refactor VariableReferenceResolver to use AST-based variable resolution
- Replace regex variable extraction with parser-based resolution
- Standardize variable syntax handling ({{var}} for text/data, $var for paths)
- Update CommandResolver to use the standardized resolution system

**Success Criteria**:
- Variable interpolation tests passing
- Consistent handling of all variable types
- Elimination of regex-based variable detection

### 2.2 Path and Variable Integration (1 day)

**Tasks**:
- Ensure path variables remain distinct from text variables
- Fix variable mirroring issues
- Implement proper context-aware variable resolution
- Update error messages related to variable resolution

**Success Criteria**:
- Integrated tests with both path and variable resolution passing
- Clear separation between variable types
- Proper error messages for variable-related issues

### 2.3 Plan Review and Adjustment (0.5 days)

**Tasks**:
- Review test outcomes
- Document newly discovered issues
- Adjust priorities for Phase 3
- Update SHIP.md with revised timelines

## Phase 3: Directive Validation and Handling (2-3 days)

**Goal**: Fix directive validators and handlers to work consistently with AST node properties.

### 3.1 Directive Validator Updates (1 day)

**Tasks**:
- Update ImportDirectiveValidator to handle structured path objects
- Fix DefineDirectiveValidator for property flexibility
- Update EmbedDirectiveValidator for consistency with AST
- Create shared validation utilities for identifiers

**Success Criteria**:
- Directive validation tests passing
- Consistent validation across all directive types
- Shared utilities reducing duplicate code

### 3.2 Directive Handler Implementation (1-2 days)

**Tasks**:
- Update ImportDirectiveHandler for path extraction
- Fix DefineDirectiveHandler for value resolution
- Update EmbedDirectiveHandler for path handling
- Complete updates to validate code fence blocks

**Success Criteria**:
- Directive handler tests passing
- Proper handling of all directive types
- Consistent handler implementation patterns

### 3.3 Plan Review and Adjustment (0.5 days)

**Tasks**:
- Review test outcomes
- Document newly discovered issues
- Adjust priorities for Phase 4
- Update SHIP.md with revised timelines

## Phase 4: API Completion and Integration (2-3 days)

**Goal**: Finalize the API and ensure all integration tests pass.

### 4.1 API Integration Test Fixes (1-2 days)

**Tasks**:
- Address remaining failing tests
- Fix Code Fence test fixtures
- Ensure proper output formatting
- Verify all directive types work end-to-end

**Success Criteria**:
- All API integration tests passing
- Consistent behavior across all test scenarios
- Proper error handling in all contexts

### 4.2 API Surface Refinement (1 day)

**Tasks**:
- Review and update API documentation
- Create or update API examples
- Ensure consistent naming and typing across API
- Implement any remaining performance optimizations

**Success Criteria**:
- Well-documented API with examples
- Consistent naming and typing
- Clear error types and handling documentation

### 4.3 Plan Review and Final Adjustment (0.5 days)

**Tasks**:
- Review overall test status
- Document any remaining issues
- Finalize priorities for Phase 5
- Update SHIP.md with revised timelines

## Phase 5: CLI Implementation (3-4 days)

**Goal**: Create a thin CLI wrapper on top of the completed API.

### 5.1 CLI Core Implementation (1-2 days)

**Tasks**:
- Create new CLI entry point
- Implement command-line argument parsing
- Map CLI options to API options
- Handle basic file I/O

**Success Criteria**:
- CLI successfully wrapping the API
- Proper handling of command-line arguments
- Correct mapping to API options

### 5.2 CLI-Specific Features (1 day)

**Tasks**:
- Implement watch mode
- Add version and help commands
- Handle stdout output
- Implement interactive prompts

**Success Criteria**:
- Watch mode working correctly
- Help and version commands giving correct output
- Proper handling of stdout

### 5.3 CLI Testing (1 day)

**Tasks**:
- Create CLI-specific tests
- Implement end-to-end tests
- Test error handling and exit codes
- Verify all CLI-specific features

**Success Criteria**:
- All CLI tests passing
- End-to-end tests verifying complete functionality
- Proper error handling in all scenarios

## Phase 6: Finalization and Release (1-2 days)

**Goal**: Prepare for release with documentation and migration planning.

### 6.1 Documentation Updates (0.5-1 day)

**Tasks**:
- Update all user-facing documentation
- Create or update tutorials
- Document the new unified variable syntax
- Document path handling rules and examples

**Success Criteria**:
- Complete and accurate documentation
- Clear tutorials for common use cases
- Documentation reflecting latest syntax and rules

### 6.2 Migration Strategy (0.5-1 day)

**Tasks**:
- Create migration guide for existing users
- Implement deprecation warnings
- Plan for backward compatibility
- Create release notes and timeline

**Success Criteria**:
- Clear migration path for existing users
- Documented breaking changes
- Comprehensive release notes

## Implementation Guidelines

Throughout all phases, we will adhere to these guidelines:

1. **Focus on Critical Path Issues First**
   - Prioritize fixes that unblock the most failing tests
   - Address foundational issues before surface-level ones
   - Target the most impactful services first

2. **Test-Driven Development**
   - Use failing tests to guide implementation
   - Add new tests for edge cases
   - Maintain high test coverage

3. **Maintain Type Safety**
   - Ensure proper TypeScript typing
   - Use interfaces for service interactions
   - Maintain strict type checking

4. **Leverage Existing Infrastructure**
   - Use our robust testing framework
   - Leverage debug services for complex issues
   - Use existing path handling capabilities

5. **Consistent Architecture**
   - Maintain clear service boundaries
   - Adhere to established patterns
   - Document architectural decisions

## Accounting for Emergent Issues

This plan explicitly acknowledges that we will uncover new issues as we progress. Our strategy for handling these:

1. **Phase Reviews**: Each phase includes a dedicated review step to assess progress and adjust priorities
2. **Living Document**: This SHIP.md will be updated after each phase review to reflect new findings
3. **Triage Process**: New issues will be categorized as:
   - **Critical**: Must be fixed in the current phase
   - **Important**: Should be addressed in the next phase
   - **Deferrable**: Can be addressed after initial release

## Total Timeline Estimate

- **Phase 1**: 3-4 days
- **Phase 2**: 2-3 days
- **Phase 3**: 2-3 days
- **Phase 4**: 2-3 days
- **Phase 5**: 3-4 days
- **Phase 6**: 1-2 days

**Total Estimate**: 13-19 days

This timeline includes the review steps and accounts for some discovery of new issues, but significant unexpected challenges could extend it further.

## Success Criteria

The implementation will be considered successful when:

1. All tests pass (currently aiming to fix 57 failing tests)
2. API integration tests prove proper parsing and output from real-world examples
3. Path handling works correctly in all contexts
4. Variable resolution is consistent with unified syntax
5. Service architecture is clean with proper boundaries
6. The API is well-documented with examples
7. The CLI successfully wraps the API with required functionality
8. A clear migration path exists for users

Regular updates to this document will track our progress toward these goals.

\===============================
\=== STRUCTURED PATH FORMAT ISSUES =

# Meld Path and Parsing Improvements

## Overview

This document consolidates key learnings and improvements made to the Meld codebase regarding:

1. **Path Variable Handling**: Changes in `meld-ast` that affected path representation and resolution
2. **Variable Syntax Unification**: Standardization of variable syntax and resolution mechanisms
3. **AST Structure Alignment**: Reconciliation of AST structure with validator expectations

These changes have significantly improved the robustness and maintainability of the codebase, addressing issues that were causing test failures and inconsistent behavior.

## 1. Path Resolution Improvements

### Key Issues Addressed

#### StructuredPath Format Transition
- **Before**: Paths were simple strings
- **Now**: Paths are objects with a structured format, including raw, normalized, and structured components

```typescript
interface StructuredPath {
  raw: string;
  normalized?: string;
  structured: {
    base: string;
    segments: string[];
    variables?: {
      text?: string[];
      path?: string[];
      special?: string[];
    };
  };
}
```

#### Property Name Mismatches
Path directive properties in the AST (`id`, `path`) differed from what validators expected (`identifier`, `value`):

| Directive | AST Property | Expected by Validator |
|-----------|-------------|------------------------|
| Path      | `id`        | `identifier`           |
| Define    | `name`      | `identifier`           |

#### Special Path Variables
Special path variables like `$PROJECTPATH`, `$HOMEPATH`, `$.`, and `$~` now receive proper validation and resolution.

### Implemented Fixes

1. **Updated ResolutionService.ts**:
   - Enhanced `resolveInContext` to handle both strings and StructuredPath objects
   - Added type declarations to prevent TypeScript errors
   - Improved handling of special path variables

2. **Updated PathDirectiveHandler.ts**:
   - Corrected handling of the StructuredPath object format
   - Improved special path variable handling (PROJECTPATH, HOMEPATH)
   - No longer mirroring path variables as text variables

3. **PathDirectiveValidator.ts Improvements**:
   - Updated error messages to match expected test formats
   - Enhanced validation for absolute paths and relative segments
   - Added appropriate error severity levels

## 2. Variable Syntax Unification

### Syntax Evolution

#### Previous Syntax
- Text variables: `${textvar}`
- Data variables: `#{datavar}`
- Path variables: `$pathvar`

#### New Unified Syntax
- Text variables: `{{textvar}}`
- Data variables: `{{datavar}}` with field access as `{{datavar.field}}`
- Path variables: `$pathvar` (unchanged)

### Key Improvements

1. **AST-Based Variable Resolution**:
   - Replaced regex-based resolution with proper AST parsing
   - Eliminated direct regex patterns for variable detection
   - Added handlers for AST node types: `TextVar` and `DataVar`

2. **VariableReferenceResolver Rewrite**:
   - Complete rewrite to use parser service instead of regex
   - Better state variable lookup using context
   - Improved error handling and debugging

3. **Path Variable Distinction**:
   - Path variables remain with `$pathvar` syntax
   - No longer mirrored as text variables
   - Kept distinct from text and data variables for clarity

## 3. Important Learnings

### 1. Service Consistency
Maintaining consistency between services that handle similar tasks is critical. When a feature like variable interpolation is implemented in multiple places, changes need to be applied uniformly.

### 2. Type-Aware String Conversion
Different data types require different string conversion strategies:
- Arrays: Comma-separated values (`text,data,path`)
- Objects: JSON serialization
- Primitives: Simple string conversion

### 3. AST-Driven Development
The AST should drive the validation and handling layers, not vice versa. When the AST changes:
- Validators need to be updated to match the new structure
- Handlers need to align with the updated validators
- Integration tests may need adjustments

### 4. Variable Resolution Contexts
Different variable types have different resolution rules:
- Path variables: Only valid in path contexts (paths and commands)
- Text variables: Can be used in any text context
- Data variables: Can be used in text with field access

## 4. Implementation Strategy for AST Alignment

### Direct Codebase Alignment
Rather than creating adapter layers, we chose to directly align the codebase with the AST structure:

1. **For Path Directives**:
   - Update validators to check for `id` instead of `identifier`
   - Update handlers to work with `path` instead of `value`
   - Ensure proper handling of the structured path object

2. **For Variable Resolution**:
   - Utilize the AST parser for detecting variables
   - Standardize on the `{{var}}` syntax for text and data variables
   - Keep path variables as `$pathvar` for backward compatibility

3. **For Interface Consistency**:
   - Update interface definitions to match the AST structure
   - Ensure proper type checking throughout the resolution pipeline
   - Add robust error handling for type mismatches

## 5. Remaining Considerations

### Performance Implications
The new StructuredPath format and AST-based variable resolution may have performance implications that should be monitored.

### Backward Compatibility
While the codebase has been updated to handle the new formats:
- Legacy syntax for text variables (`${var}`) may still be found in existing scripts
- Data variable field access may use different formats

### Documentation Updates
User documentation should be updated to reflect:
- The new unified variable syntax
- The distinctions between path, text, and data variables
- Rules for variable usage in different contexts

## 6. Testing Strategy

Integration tests were critical in identifying and validating fixes:
- Path variable handling tests
- Text and data variable interpolation tests
- Field access tests for data variables
- Path validation tests

## 7. Existing Testing/Debugging Infrastructure

The testing and debugging infrastructure played a critical role in identifying, diagnosing, and resolving the path and parsing issues.

### Integration Tests

The API module integration tests (`npm test api`) were instrumental in exposing mismatches between the AST structure and the validation/handling layers:

1. **Directive Validation Tests**: Revealed property name mismatches (e.g., `id` vs `identifier`)
2. **Variable Interpolation Tests**: Identified inconsistencies in variable resolution
3. **Path Resolution Tests**: Highlighted issues with the new structured path format
4. **Output Conversion Tests**: Showed discrepancies in how variables were processed

These tests provided clear expectations about how variable interpolation and path handling should work, serving as a guide for the implementation.

### Test Context Framework

The test context framework (`TestContext` class) provides comprehensive testing capabilities:

```typescript
async startDebugSession(config?: Partial<DebugSessionConfig>): Promise<string> {
  const defaultConfig: DebugSessionConfig = {
    captureConfig: {
      capturePoints: ['pre-transform', 'post-transform', 'error'] as const,
      includeFields: ['nodes', 'transformedNodes', 'variables'] as const,
      format: 'full'
    },
    visualization: {
      format: 'mermaid',
      includeMetadata: true,
      includeTimestamps: true
    },
    traceOperations: true,
    collectMetrics: true
  };
  // ...
}
```

Key features include:

1. **State Visualization**: The ability to visualize the state in Mermaid or DOT formats
2. **Debug Sessions**: Capturing pre-transform, post-transform, and error states
3. **Metrics Collection**: Performance and operation metrics for analysis
4. **In-Memory Filesystem**: Testing file operations without touching the real filesystem
5. **State Tracking**: Monitoring changes to the state during execution

### Mock Services

The test infrastructure includes mocked versions of core services:

1. **MockStateService**: For testing state operations in isolation
2. **MockResolutionService**: For testing resolution without dependencies
3. **MemfsTestFileSystem**: For simulating filesystem operations
4. **TestSnapshot**: For comparing filesystem states before and after operations

### Debugging Capabilities

Advanced debugging tools helped diagnose complex issues:

1. **State Diffing**: Comparing expected vs. actual state
2. **AST Inspection**: Examining the AST structure at various points
3. **Error Context**: Enhanced error reporting with context information
4. **Tracing**: Operation-by-operation tracing through the execution pipeline

### Test-Driven Development Approach

The tests served as both documentation and validation:

1. **Clear Expectations**: Tests defined expected behavior for variable handling
2. **Regression Prevention**: Ensured fixes didn't break existing functionality
3. **Edge Case Coverage**: Tests for special cases (arrays, nested objects, etc.)
4. **API Consistency**: Validated consistent behavior across different services

This robust testing and debugging infrastructure made it possible to systematically identify, diagnose, and fix the complex interplay of issues between the AST structure, validators, and handlers.

## Conclusion

These improvements have significantly enhanced the robustness of Meld's path handling and variable resolution systems. By aligning the codebase with the AST structure and standardizing on a unified variable syntax, we've reduced complexity and improved maintainability while ensuring backward compatibility where needed.

\===============================
\=== SERVICE ARCHITECTURE ISSUES =

# Meld Regex Replacement Plan

## Phase 1: Enforce Proper Service Architecture and Parser Integration

**Goal**: Establish ParserService as the sole interface to meld-ast and eliminate redundant regex

1. Refactor `ParserService` to fully utilize meld-ast features
   - Remove custom code fence validation regex in `validateCodeFences()` method
   - Use native AST properties for language and content information
   - Properly document and use CodeFenceNode.language and CodeFenceNode.content fields
   - Ensure ParserService provides all needed AST node functions to other services

2. Enforce architectural boundaries
   - Make ParserService the only component that directly imports 'meld-ast'
   - Remove direct 'meld-ast' imports from all other services
   - Ensure all other services receive MeldNode objects from ParserService
   - Create utility methods in ParserService for node type operations needed by other services

3. Update documentation on meld-ast capabilities and proper service architecture
   - Clarify how meld-ast already handles code fences, headings, and section detection
   - Document ParserService as the sole interface to 'meld-ast'
   - Update architecture documentation to reflect proper service boundaries

4. Train developers on proper AST usage patterns
   - Create examples demonstrating proper AST node inspection
   - Document best practices for accessing MeldNode properties via ParserService

**Timeline**: 1-2 weeks

## Phase 2: Resolution System Standardization

**Goal**: Replace manual variable detection with consistent resolution system

1. Refactor `VariableReferenceResolver`
   - Remove regex `/\{\{([^}]+)\}\}/g` variable extraction
   - Implement AST-based variable resolution exclusively
   - Deprecate `resolveSimpleVariables` method

2. Update `CommandResolver`
   - Replace regex `/\${([^}]+)}/g` with standard variable interpolation
   - Use resolution system for parameter replacement
   - Add structured command parameter handling

3. Standardize `ContentResolver`
   - Remove backtick extraction regex
   - Use AST node properties for code fence handling

4. Update `OutputService` to leverage AST node properties
   - Simplify and standardize `nodeToMarkdown` method
   - Replace direct content manipulation with AST node property access
   - Eliminate duplicate methods like `codeFenceToMarkdown` and `codeFenceToLLM`

**Timeline**: 2-3 weeks

## Phase 3: Directive Validation Standardization

**Goal**: Move string validation from regex to structured validators

1. Create shared validator for identifiers
   - Replace regex `/^[a-zA-Z0-9_]+$/` in PathDirectiveValidator
   - Replace regex `/^[a-zA-Z_][a-zA-Z0-9_]*$/` in TextDirectiveValidator
   - Create common validation utility class

2. Implement structured string tokenizer
   - Replace quote detection regex `/(?<!\\)['"`]/g`
   - Create proper string tokenizer for validation

3. Update directive format validators
   - Update ImportDirectiveValidator to use structured parsing
   - Remove complex regex patterns for bracket extraction
   - Create common bracketed content parser utility

**Timeline**: 2-3 weeks

## Phase 4: Directive Handler Refactoring

**Goal**: Make handlers use structured data from AST

1. Refactor `ImportDirectiveHandler`
   - Remove regex for path and import extraction
   - Use AST node structure directly
   - Share logic with ImportDirectiveValidator

2. Update `RunDirectiveHandler`
   - Remove regex for command extraction
   - Use structured directive data from nodes

3. Standardize format handling across handlers
   - Ensure all handlers use consistent approach
   - Create shared utilities for common operations

**Timeline**: 2-3 weeks

## Phase 5: Testing & Documentation

**Goal**: Ensure comprehensive test coverage and documentation updates

1. Create test suite for proper AST usage
   - Verify all node types are correctly accessed
   - Test code fence properties usage
   - Validate proper AST traversal patterns

2. Test resolution system changes
   - Ensure variable interpolation works correctly
   - Verify command parameter handling
   - Test complex nested scenarios

3. Create improved AST documentation
   - Create detailed documentation of meld-ast capabilities
   - Add examples showing proper node type access patterns
   - Document all available node properties for each node type
   - Create AST Explorer utility for visualizing node structures

4. Update existing documentation
   - Revise architecture documentation
   - Document best practices for handling different node types
   - Create developer guidelines for AST usage

**Timeline**: 2-3 weeks

## Implementation Strategy

1. **Service architecture first**: Enforce proper service boundaries and dependencies
2. **Incremental approach**: Update one service at a time, starting with the most fundamental (ParserService)
3. **Maintain compatibility**: Keep backward compatibility where possible during transition
4. **Test-driven development**: Write tests before implementing changes
5. **Consistent patterns**: Establish and document consistent patterns for all services

## Prioritization

1. `ParserService` - Most impactful as the sole interface to meld-ast
2. `VariableReferenceResolver` - Critical for variable resolution
3. `ResolutionService` - Affects multiple downstream services
4. `OutputService` - Important for ensuring proper node property usage
5. Validator classes - Important for consistent syntax validation
6. Directive handlers - Final implementation of the pattern

## Architectural Principles

1. **Single Responsibility**: Each service has one clear function
2. **Dependency Isolation**: Only ParserService should import and use meld-ast directly
3. **Interface Stability**: Services should communicate through well-defined interfaces
4. **Type Safety**: Leverage TypeScript types from meld-spec throughout the codebase
5. **Documentation**: Document node types and properties for developers

This phased approach ensures the codebase systematically moves from regex-based parsing to proper AST handling while maintaining proper service boundaries and architectural principles.

\===============================
\=== CORE ARCHITECTURE ==========

# Meld Architecture

## INTRODUCTION

Meld is a specialized, directive-based scripting language designed for embedding small "@directives" inside an otherwise plain text (e.g., Markdown-like) document. The code in this repository implements:

• Meld grammar rules and token types (e.g., text directives, path directives, data directives).
• The parsing layer that converts Meld content into an AST (Abstract Syntax Tree).
• A directive interpretation layer that processes these AST nodes and manipulates internal "states" to store variables and more.
• A resolution layer to handle variable references, path expansions, data manipulations, etc.
• Testing utilities and an in-memory FS (memfs) to simulate filesystems for thorough testing.

The main idea:
1. Meld code is parsed to an AST.
2. Each directive node is validated and interpreted, updating a shared "state" (variables, data structures, commands, etc.).
3. Optional transformations (e.g., output formatting) generate final representations (Markdown, LLM-friendly XML, etc.).

Below is an overview of the directory and service-level architecture, referencing code from this codebase.

## DIRECTORY & FILE STRUCTURE

At a high level, the project is arranged as follows (select key entries included):

project-root/
 ├─ api/                    ← High-level API and tests
 │   ├─ api.test.ts
 │   └─ index.ts
 ├─ bin/                    ← CLI entry point
 │   └─ meld.ts
 ├─ cli/                    ← CLI implementation
 │   ├─ cli.test.ts
 │   └─ index.ts
 ├─ core/                   ← Core utilities and types
 │   ├─ config/            ← Configuration (logging, etc.)
 │   ├─ errors/            ← Error class definitions
 │   │   ├─ MeldError.ts
 │   │   ├─ ServiceInitializationError.ts   ← Service initialization errors
 │   │   └─ ... other errors
 │   ├─ types/             ← Core type definitions
 │   │   ├─ dependencies.ts  ← Service dependency definitions
 │   │   └─ index.ts
 │   └─ utils/             ← Logging and utility modules
 │       ├─ logger.ts
 │       ├─ serviceValidation.ts  ← Service validation utilities
 │       └─ simpleLogger.ts
 ├─ services/              ← Core service implementations
 │   ├─ pipeline/          ← Main transformation pipeline
 │   │   ├─ ParserService/     ← Initial parsing
 │   │   ├─ InterpreterService/← Pipeline orchestration
 │   │   ├─ DirectiveService/  ← Directive handling
 │   │   │   ├─ handlers/
 │   │   │   │   ├─ definition/   ← Handlers for definition directives
 │   │   │   │   └─ execution/    ← Handlers for execution directives
 │   │   │   └─ errors/
 │   │   └─ OutputService/    ← Final output generation
 │   ├─ state/             ← State management
 │   │   ├─ StateService/      ← Core state management
 │   │   └─ StateEventService/ ← Core event system
 │   ├─ resolution/        ← Resolution and validation
 │   │   ├─ ResolutionService/ ← Variable/path resolution
 │   │   ├─ ValidationService/ ← Directive validation
 │   │   └─ CircularityService/← Circular dependency detection
 │   ├─ fs/                ← File system operations
 │   │   ├─ FileSystemService/ ← File operations
 │   │   ├─ PathService/      ← Path handling
 │   │   └─ PathOperationsService/ ← Path utilities
 │   └─ cli/               ← Command line interface
 │       └─ CLIService/    ← CLI entry point
 ├─ tests/                  ← Test infrastructure
 │   ├─ fixtures/          ← Test fixture data
 │   ├─ mocks/             ← Test mock implementations
 │   └─ utils/             ← Test utilities and helpers
 │       ├─ debug/         ← Test debug utilities
 │       │   ├─ StateDebuggerService/
 │       │   ├─ StateVisualizationService/
 │       │   ├─ StateHistoryService/
 │       │   └─ StateTrackingService/
 │       ├─ FixtureManager.ts
 │       ├─ MemfsTestFileSystem.ts
 │       ├─ ProjectBuilder.ts
 │       ├─ TestContext.ts
 │       └─ TestSnapshot.ts
 ├─ docs/                   ← Documentation
 ├─ package.json
 ├─ tsconfig.json
 ├─ tsup.config.ts
 └─ vitest.config.ts

Key subfolders:
• services/pipeline/: Core transformation pipeline services (parsing, interpretation, directives, output)
• services/state/: State management and event services
• services/resolution/: Resolution, validation, and circularity detection services
• services/fs/: File system, path handling, and operations services
• services/cli/: Command line interface services
• core/: Central types, errors, and utilities used throughout the codebase
• tests/utils/: Test infrastructure including debug utilities, memfs implementation, fixture management, and test helpers
• api/: High-level public API for using Meld programmatically
• cli/: Command line interface for Meld

## CORE LIBRARIES & THEIR ROLE

### meld-ast
   • parse(content: string): MeldNode[]
   • Basic parsing that identifies directives vs. text nodes.
   • Produces an AST which other services manipulate.

### llmxml
   • Converts content to an LLM-friendly XML format or can parse partially.
   • OutputService may call it if user requests "llm" format.

### meld-spec
   • Contains interface definitions for MeldNode, DirectiveNode, TextNode, etc.
   • Contains directive kind enumerations.

## HIGH-LEVEL FLOW

Below is a simplified flow of how Meld content is processed:

   ┌─────────────────────────────┐
   │   Meld Source Document      │
   └─────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────┐
   │ ParserService.parse(...)    │
   │   → uses meld-ast to parse  │
   └─────────────────────────────┘
                │ AST (MeldNode[])
                ▼
   ┌─────────────────────────────────────────────────┐
   │ InterpreterService.interpret(nodes, options)    │
   │   → For each node, pass to DirectiveService     │
   │   → Handles node transformations                │
   └─────────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ DirectiveService                         │
   │   → Routes to correct directive handler  │
   │   → Handlers can provide replacements    │
   └──────────────────────────────────────────┘
                │
                ▼
   ┌───────────────────────────────────────────────┐
   │ StateService + ResolutionService + Others     │
   │   → Stores variables and transformed nodes    │
   │   → Path expansions, data lookups, etc.       │
   └───────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ OutputService                            │
   │   → Uses transformed nodes for output    │
   │   → Generates clean, directive-free      │
   │     markdown, LLM XML, or other formats  │
   └──────────────────────────────────────────┘

## MAJOR SERVICES (OVERVIEW)

Below are the key "services" in the codebase. Each follows the single responsibility principle:

### CLIService
   - Provides command-line interface for running Meld
   - Handles file watching and reprocessing
   - Manages format selection and output options
   - Routes to appropriate services based on CLI flags

### ParserService
   - Wraps the meld-ast parse(content) function
   - Adds location information with file paths (parseWithLocations)
   - Produces an array of MeldNode objects

### DirectiveService
   - Routes directives to the correct directive handler
   - Validates directives using ValidationService
   - Calls ResolutionService for variable resolution
   - Updates StateService with directive execution results
   - Supports node transformation through DirectiveResult interface
   - Handlers can provide replacement nodes for transformed output

### InterpreterService
   - Orchestrates the main interpret(nodes) pipeline
   - For each AST node:
       a) If it's text, store it or pass it along
       b) If it's a directive:
          - Calls DirectiveService for processing
          - Handles node transformations if provided
          - Updates state with transformed nodes
   - Maintains the top-level process flow
   - Supports transformation mode through feature flags

### StateService
   - Stores variables in maps:
       • textVars (for @text)
       • dataVars (for @data)
       • pathVars (for @path)
       • commands (for @define)
   - Tracks both original and transformed MeldNodes
   - Provides transformation capabilities for directive processing
   - Maintains transformation state during cloning
   - Provides child states for nested imports
   - Supports immutability toggles

### ResolutionService
   - Handles all variable interpolation:
       • Variables ("{{var}}", "{{data.field}}")
       • Path expansions ("$HOMEPATH/path")
       • Command references
   - Context-aware resolution
   - Circular reference detection
   - Sub-fragment parsing support

### CircularityService
   - Prevents infinite import loops
   - Detects circular variable references
   - Maintains dependency graphs

### PathService
   - Validates and normalizes paths
   - Enforces path security constraints
   - Handles path joining and manipulation
   - Supports test mode for path operations

### ValidationService
   - Validates directive syntax and constraints
   - Provides extensible validator registration
   - Throws MeldDirectiveError on validation failures
   - Tracks available directive kinds

###  FileSystemService
    - Abstracts file operations (read, write)
    - Supports both real and test filesystems
    - Handles path resolution and validation

### OutputService
    - Converts final AST and state to desired format
    - Uses transformed nodes when available
    - Supports markdown and LLM XML output
    - Integrates with llmxml for LLM-friendly formatting
    - Handles format-specific transformations
    - Provides clean output without directive definitions

## TESTING INFRASTRUCTURE

All tests are heavily reliant on a memory-based filesystem (memfs) for isolation and speed. The major testing utilities include:

### MemfsTestFileSystem
   – Thin wrapper around memfs
   – Offers readFile, writeFile, mkdir, etc. with in-memory data
   – Provides an ephemeral environment for all test IO

### TestContext
   – Central test harness that creates a new MemfsTestFileSystem
   – Provides references to all major services (ParserService, DirectiveService, etc.)
   – Allows writing files, snapshotting the FS, and comparing

### TestSnapshot
   – Takes "snapshots" of the current Memfs FS, storing a Map<filePath, content>
   – Compares snapshots to detect added/removed/modified files

### ProjectBuilder
   – Creates mock "projects" in the in-memory FS from JSON structure
   – Useful for complex, multi-file tests or large fixture-based testing

### Node Factories
   – Provides helper functions for creating AST nodes in tests
   – Supports creating directive, text, and code fence nodes
   – Includes location utilities for source mapping

Testing Organization:
• tests/utils/: Core test infrastructure (MemFS, snapshots, contexts)
• tests/mocks/: Minimal mocks and test doubles
• tests/fixtures/: JSON-based test data
• tests/services/: Service-specific integration tests

Testing Approach:
• Each test uses a fresh TestContext or recreates MemfsTestFileSystem
• Direct imports from core packages (meld-ast, meld-spec) for types
• Factory functions for creating test nodes and data
• Snapshots for tracking filesystem changes

## DEBUGGING INFRASTRUCTURE

The codebase includes specialized debugging services located in `tests/utils/debug/` that help diagnose and troubleshoot state-related issues:

### StateDebuggerService
   - Provides debug session management and diagnostics
   - Tracks state operations and transformations
   - Offers operation tracing and analysis
   - Helps identify state manipulation issues

### StateVisualizationService
   - Generates visual representations of state
   - Creates Mermaid/DOT graphs of state relationships
   - Visualizes state metrics and transformations
   - Aids in understanding complex state changes

### StateHistoryService
   - Records chronological state changes
   - Maintains operation history
   - Tracks transformation chains
   - Enables state change replay and analysis

### StateTrackingService
   - Monitors state relationships and dependencies
   - Tracks state lineage and inheritance
   - Records metadata about state changes
   - Helps debug scope and inheritance issues

Debugging Approach:
• Services can be enabled selectively in tests
• Debug output includes detailed state snapshots
• Visual representations help understand complex states
• History tracking enables step-by-step analysis

These debugging services are particularly useful for:
• Troubleshooting complex state transformations
• Understanding directive processing chains
• Analyzing variable resolution paths
• Debugging scope inheritance issues
• Visualizing state relationships

## SERVICE RELATIONSHIPS

Services in Meld follow a strict initialization order and dependency graph:

1. Base Services:
   - FileSystemService (no dependencies)
   - PathService (depends on FS)

2. State Management:
   - StateEventService (no dependencies)
   - StateService (depends on events)

3. Core Pipeline:
   - ParserService (independent)
   - ResolutionService (depends on State, FS)
   - ValidationService (depends on Resolution)
   - CircularityService (depends on Resolution)

4. Pipeline Orchestration:
   - DirectiveService (depends on multiple services)
   - InterpreterService (orchestrates others)

5. Output Generation:
   - OutputService (depends on State)

6. Debug Support:
   - DebuggerService (optional, depends on all)

Service initialization and validation is handled through the core/types/dependencies.ts system,
which ensures services are created in the correct order and all dependencies are satisfied.

## EXAMPLE USAGE SCENARIO

1) Input: A .meld file with lines like:
   @text greeting = "Hello"
   @data config = { "value": 123 }
   @import [ path = "other.meld" ]

2) We load the file from disk.
3) ParserService → parse the content → AST.
4) InterpreterService → interpret(AST).
   a) For each directive, DirectiveService → validation → resolution → update StateService.
   b) If an import is encountered, CircularityService ensures no infinite loops.
5) Once done, the final StateService has textVars.greeting = "Hello", dataVars.config = { value: 123 }, etc.
6) OutputService can generate the final text or an LLM-XML representation.

## ERROR HANDLING

• MeldDirectiveError thrown if a directive fails validation or interpretation.
• MeldParseError if the parser cannot parse content.
• PathValidationError for invalid paths.
• ResolutionError for variable resolution issues.
• MeldError as a base class for other specialized errors.

These errors typically bubble up to the caller or test.

## CONCLUSION

This codebase implements the entire Meld language pipeline:
• Parsing Meld documents into an AST.
• Validating & interpreting directives.
• Storing data in a hierarchical state.
• Resolving references (text, data, paths, commands).
• (Optionally) generating final formatted output.

Plus, it has a robust test environment with an in-memory FS, snapshots, and a test harness (TestContext) for integration and unit tests. Everything is layered to keep parsing, state management, directive logic, and resolution separate, adhering to SOLID design principles.

The ASCII diagrams, modules, and file references in this overview represent the CURRENT code as it is: multiple specialized services collaborating to parse and interpret Meld scripts thoroughly—test coverage is facilitated by the in-memory mocking and snapshot-based verification.

\===============================
\=== RELEVANT CODE =============

# ResolutionService.ts

```typescript
import * as path from 'path';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService.js';
import { TextResolver } from './resolvers/TextResolver.js';
import { DataResolver } from './resolvers/DataResolver.js';
import { PathResolver } from './resolvers/PathResolver.js';
import { CommandResolver } from './resolvers/CommandResolver.js';
import { ContentResolver } from './resolvers/ContentResolver.js';
import { VariableReferenceResolver } from './resolvers/VariableReferenceResolver.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, DirectiveNode, TextNode, DirectiveKind, CodeFenceNode, StructuredPath } from 'meld-spec';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, singleton } from 'tsyringe';
import { CommandContextService } from '../../command/CommandContextService';
import { MeldInterpreterError } from '../../../errors';
import {
  ResolutionContext as DeprecatedContext,
  CommandParameterResolutionContext,
  NestedResolution
} from '../ResolutionContextFactory';
import { ICommandService } from '../../command/ICommandService';
import { Command, ParameterResolutionMap } from '../../command/Command';
import { CommandParameter } from '../../../types';

/**
 * Internal type for heading nodes in the ResolutionService
 * This is converted from TextNode when we detect a heading pattern
 */
interface InternalHeadingNode {
  content: string;
  level: number;
}

/**
 * Convert a TextNode to an InternalHeadingNode if it matches heading pattern
 * Returns null if the node is not a heading
 */
function parseHeadingNode(node: TextNode): InternalHeadingNode | null {
  const headingMatch = node.content.match(/^(#{1,6})\s+(.+)$/);
  if (!headingMatch) {
    return null;
  }
  return {
    level: headingMatch[1].length,
    content: headingMatch[2].trim()
  };
}

/**
 * Check if a node is a text node that represents a heading
 */
function isHeadingTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text' && (node as TextNode).content.match(/^#{1,6}\s+.+$/) !== null;
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export class ResolutionService implements IResolutionService {
  private textResolver: TextResolver;
  private dataResolver: DataResolver;
  private pathResolver: PathResolver;
  private commandResolver: CommandResolver;
  private contentResolver: ContentResolver;
  private variableReferenceResolver: VariableReferenceResolver;

  constructor(
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService
  ) {
    this.textResolver = new TextResolver(stateService);
    this.dataResolver = new DataResolver(stateService);
    this.pathResolver = new PathResolver(stateService);
    this.commandResolver = new CommandResolver(stateService);
    this.contentResolver = new ContentResolver(stateService);
    // Create the variable reference resolver with the parser
    this.variableReferenceResolver = new VariableReferenceResolver(
      stateService,
      this,
      parserService
    );
  }

  /**
   * Parse a string into AST nodes for resolution
   */
  private async parseForResolution(value: string): Promise<MeldNode[]> {
    try {
      const nodes = await this.parserService.parse(value);
      return nodes || [];
    } catch (error) {
      // If parsing fails, treat the value as literal text
      return [{
        type: 'Text',
        content: value
      } as TextNode];
    }
  }

  /**
   * Resolve text variables in a string
   */
  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    const nodes = await this.parseForResolution(text);
    return this.textResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve data variables and fields
   */
  async resolveData(ref: string, context: ResolutionContext): Promise<any> {
    const nodes = await this.parseForResolution(ref);
    return this.dataResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve path variables
   */
  async resolvePath(path: string, context: ResolutionContext): Promise<string> {
    logger.debug('Resolving path', { path, context });
    const nodes = await this.parseForResolution(path);
    return this.pathResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve command references
   */
  async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'run',
        name: cmd,
        identifier: cmd,
        args
      }
    };
    return this.commandResolver.resolve(node, context);
  }

  /**
   * Resolve content from a file path
   */
  async resolveFile(path: string): Promise<string> {
    if (!await this.fileSystemService.exists(path)) {
      throw new MeldFileNotFoundError(path);
    }
    return this.fileSystemService.readFile(path);
  }

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    if (!Array.isArray(nodes)) {
      // If a string path is provided, read the file
      const path = String(nodes);
      if (!await this.fileSystemService.exists(path)) {
        throw new MeldResolutionError(
          `File not found: ${path}`,
          {
            code: ResolutionErrorCode.INVALID_PATH,
            details: { value: path },
            severity: ErrorSeverity.Fatal
          }
        );
      }
      return this.fileSystemService.readFile(path);
    }

    // Otherwise, process the nodes
    return this.contentResolver.resolve(nodes, context);
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string | StructuredPath, context: ResolutionContext): Promise<string> {
    // Add debug logging for debugging path handling issues
    console.log('*** ResolutionService.resolveInContext', {
      value: typeof value === 'string' ? value : value.raw,
      allowedVariableTypes: context.allowedVariableTypes,
      pathValidation: context.pathValidation,
      stateExists: !!context.state,
      specialPathVars: context.state ? {
        PROJECTPATH: context.state.getPathVar('PROJECTPATH'),
        HOMEPATH: context.state.getPathVar('HOMEPATH')
      } : 'state not available'
    });

    // Handle StructuredPath objects directly
    if (typeof value === 'object' && value !== null && 'raw' in value) {
      // Extract the structured path information
      const { raw, structured } = value;

      // For special path variables - handle them directly
      if (structured?.variables?.special?.includes('PROJECTPATH') ||
          structured?.base === '$PROJECTPATH' ||
          structured?.base === '$.') {
        // Get the base path from state
        const basePath = context.state?.getPathVar('PROJECTPATH');
        if (!basePath) {
          throw new MeldResolutionError(
            'PROJECTPATH is not defined',
            {
              code: ResolutionErrorCode.UNDEFINED_VARIABLE,
              details: { value: raw },
              severity: ErrorSeverity.Recoverable
            }
          );
        }

        // Join with segments
        let result = basePath;
        if (structured.segments && structured.segments.length > 0) {
          result = structured.segments.reduce((p, segment) => {
            return path.join(p, segment);
          }, result);
        }
        return result;
      }

      // For home path special variables
      if (structured?.variables?.special?.includes('HOMEPATH') ||
          structured?.base === '$HOMEPATH' ||
          structured?.base === '$~') {
        // Get the home path from state
        const homePath = context.state?.getPathVar('HOMEPATH');
        if (!homePath) {
          throw new MeldResolutionError(
            'HOMEPATH is not defined',
            {
              code: ResolutionErrorCode.UNDEFINED_VARIABLE,
              details: { value: raw },
              severity: ErrorSeverity.Recoverable
            }
          );
        }

        // Join with segments
        let result = homePath;
        if (structured.segments && structured.segments.length > 0) {
          result = structured.segments.reduce((p, segment) => {
            return path.join(p, segment);
          }, result);
        }
        return result;
      }

      // For path variables
      if (structured?.variables?.path && structured.variables.path.length > 0) {
        // Clone raw path for replacement
        let tempPath = raw;

        // Process each path variable
        for (const pathVar of structured.variables.path) {
          // Get variable value from state
          const pathValue = context.state?.getPathVar(pathVar);
          if (pathValue === undefined) {
            throw new MeldResolutionError(
              `Path variable not defined: ${pathVar}`,
              {
                code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                details: { value: pathVar },
                severity: ErrorSeverity.Recoverable
              }
            );
          }

          // Replace in path
          tempPath = tempPath.replace(`$${pathVar}`, pathValue);
        }

        return tempPath;
      }

      // For all other structured paths, fall back to resolving the raw value
      return this.resolveVariables(raw, context);
    }

    // Handle string values
    return this.resolveVariables(value as string, context);
  }

  /**
   * Resolve variables within a string value
   * @internal Used by resolveInContext
   */
  private async resolveVariables(value: string, context: ResolutionContext): Promise<string> {
    // Check if the string contains variable references
    if (value.includes('{{') || value.includes('$')) {
      console.log('*** Resolving variables in:', value);

      // Pass to VariableReferenceResolver for both {{var}} syntax and $pathvar syntax
      return this.variableReferenceResolver.resolve(value, context);
    }

    return value;
  }

  /**
   * Validate that resolution is allowed in the given context
   */
  async validateResolution(value: string | StructuredPath, context: ResolutionContext): Promise<void> {
    // Convert StructuredPath to string if needed
    const stringValue = typeof value === 'string' ? value : value.raw;

    // Parse the value to check for variable types
    const nodes = await this.parseForResolution(stringValue);

    for (const node of nodes) {
      if (node.type !== 'Directive') continue;

      const directiveNode = node as DirectiveNode;
      // Check if the directive type is allowed
      switch (directiveNode.directive.kind) {
        case 'text':
          if (!context.allowedVariableTypes.text) {
            throw new MeldResolutionError(
              'Text variables are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: {
                  value: value,
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;

        case 'data':
          if (!context.allowedVariableTypes.data) {
            throw new MeldResolutionError(
              'Data variables are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: {
                  value: value,
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;

        case 'path':
          if (!context.allowedVariableTypes.path) {
            throw new MeldResolutionError(
              'Path variables are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: {
                  value: value,
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;

        case 'run':
          if (!context.allowedVariableTypes.command) {
            throw new MeldResolutionError(
              'Command references are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: {
                  value: value,
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;
      }
    }
  }

  /**
   * Check for circular variable references
   */
  async detectCircularReferences(value: string): Promise<void> {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const checkReferences = async (text: string, currentRef?: string) => {
      // Parse the text to get variable references
      const nodes = await this.parseForResolution(text);
      if (!nodes || !Array.isArray(nodes)) {
        throw new MeldResolutionError(
          'Invalid parse result',
          {
            code: ResolutionErrorCode.SYNTAX_ERROR,
            details: { value: text },
            severity: ErrorSeverity.Fatal
          }
        );
      }

      for (const node of nodes) {
        if (node.type !== 'Directive') continue;

        const directiveNode = node as DirectiveNode;
        const ref = directiveNode.directive.identifier;
        if (!ref) continue;

        // Skip if this is a direct reference to the current variable
        if (ref === currentRef) continue;

        if (stack.has(ref)) {
          const path = Array.from(stack).join(' -> ');
          throw new MeldResolutionError(
            `Circular reference detected: ${path} -> ${ref}`,
            {
              code: ResolutionErrorCode.CIRCULAR_REFERENCE,
              details: {
                value: text,
                variableName: ref
              },
              severity: ErrorSeverity.Fatal
            }
          );
        }

        if (!visited.has(ref)) {
          visited.add(ref);
          stack.add(ref);

          let refValue: string | undefined;

          switch (directiveNode.directive.kind) {
            case 'text':
              refValue = this.stateService.getTextVar(ref);
              break;
            case 'data':
              const dataValue = this.stateService.getDataVar(ref);
              if (dataValue && typeof dataValue === 'string') {
                refValue = dataValue;
              }
              break;
            case 'path':
              refValue = this.stateService.getPathVar(ref);
              break;
            case 'run':
              const cmdValue = this.stateService.getCommand(ref);
              if (cmdValue) {
                refValue = cmdValue.command;
              }
              break;
          }

          if (refValue) {
            await checkReferences(refValue, ref);
          }

          stack.delete(ref);
        }
      }
    };

    await checkReferences(value);
  }

  /**
   * Extract a section from content by its heading
   */
  async extractSection(content: string, heading: string, fuzzy?: number): Promise<string> {
    try {
      // Use llmxml for section extraction
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML({
        defaultFuzzyThreshold: fuzzy || 0.7,
        warningLevel: 'none'
      });

      // Extract the section directly from markdown
      const section = await llmxml.getSection(content, heading, {
        exact: !fuzzy,
        includeNested: true,
        fuzzyThreshold: fuzzy
      });

      if (!section) {
        throw new MeldResolutionError(
          'Section not found: ' + heading,
          {
            code: ResolutionErrorCode.SECTION_NOT_FOUND,
            details: { value: heading },
            severity: ErrorSeverity.Recoverable
          }
        );
      }

      return section;
    } catch (error) {
      if (error instanceof MeldResolutionError) {
        throw error;
      }
      throw new MeldResolutionError(
        'Section not found: ' + heading,
        {
          code: ResolutionErrorCode.SECTION_NOT_FOUND,
          details: { value: heading },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // If either string is empty, return 0
    if (!s1 || !s2) {
      return 0;
    }

    // If strings are equal, return 1
    if (s1 === s2) {
      return 1;
    }

    // Calculate Levenshtein distance
    const m = s1.length;
    const n = s2.length;
    const d: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= m; i++) {
      d[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      d[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLength = Math.max(m, n);
    const distance = d[m][n];
    return 1 - (distance / maxLength);
  }

  private nodesToString(nodes: MeldNode[]): string {
    return nodes.map(node => {
      switch (node.type) {
        case 'Text':
          return (node as TextNode).content;
        case 'CodeFence':
          const codeFence = node as CodeFenceNode;
          return '```' + (codeFence.language || '') + '\n' + codeFence.content + '\n```';
        case 'Directive':
          const directive = node as DirectiveNode;
          return `@${directive.directive.kind} ${directive.directive.value || ''}`;
        default:
          return '';
      }
    }).join('\n');
  }
}
```

# PathResolver.ts

```typescript
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode, PathVarNode, StructuredPath } from 'meld-spec';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Handles resolution of path variables ($path)
 */
export class PathResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve path variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate path variables are allowed
    if (!context.allowedVariableTypes.path) {
      throw new MeldResolutionError(
        'Path variables are not allowed in this context',
        {
          code: ResolutionErrorCode.INVALID_CONTEXT,
          severity: ErrorSeverity.Fatal,
          details: {
            value: directiveNode.directive.value,
            context: JSON.stringify(context)
          }
        }
      );
    }

    // Validate node type
    if (directiveNode.directive.kind !== 'path') {
      throw new MeldResolutionError(
        'Invalid node type for path resolution',
        {
          code: ResolutionErrorCode.INVALID_NODE_TYPE,
          severity: ErrorSeverity.Fatal,
          details: {
            value: directiveNode.directive.kind
          }
        }
      );
    }

    // Get the variable identifier
    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new MeldResolutionError(
        'Path variable identifier is required',
        {
          code: ResolutionErrorCode.SYNTAX_ERROR,
          severity: ErrorSeverity.Fatal,
          details: {
            value: JSON.stringify(directiveNode.directive)
          }
        }
      );
    }

    // Handle special path variables
    if (identifier === '~' || identifier === 'HOMEPATH') {
      return this.stateService.getPathVar('HOMEPATH') || '';
    }
    if (identifier === '.' || identifier === 'PROJECTPATH') {
      return this.stateService.getPathVar('PROJECTPATH') || '';
    }

    // For regular path variables, get value from state
    const value = this.stateService.getPathVar(identifier);

    if (value === undefined) {
      throw new MeldResolutionError(
        `Undefined path variable: ${identifier}`,
        {
          code: ResolutionErrorCode.UNDEFINED_VARIABLE,
          severity: ErrorSeverity.Recoverable,
          details: {
            variableName: identifier,
            variableType: 'path'
          }
        }
      );
    }

    // Handle structured path objects
    if (typeof value === 'object' && 'normalized' in value) {
      const structuredPath = value as StructuredPath;

      // Validate path if required
      if (context.pathValidation) {
        return this.validatePath(structuredPath, context);
      }

      return structuredPath.normalized;
    }

    // Handle string paths (legacy support)
    // Validate path if required
    if (context.pathValidation) {
      return this.validatePath(value, context);
    }

    return value as string;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive') {
      return [];
    }

    const directiveNode = node as DirectiveNode;
    if (directiveNode.directive.kind !== 'path') {
      return [];
    }

    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      return [];
    }

    // Map special variables to their full names
    if (identifier === '~') {
      return ['HOMEPATH'];
    }
    if (identifier === '.') {
      return ['PROJECTPATH'];
    }

    // Extract references from structured path if available
    const value = directiveNode.directive.value;
    if (value && typeof value === 'object' && 'structured' in value) {
      const structuredPath = value as StructuredPath;
      const references = [identifier]; // Always include the path variable itself

      // Add special variables
      if (structuredPath.structured.variables.special.length > 0) {
        references.push(...structuredPath.structured.variables.special);
      }

      // Add path variables
      if (structuredPath.structured.variables.path.length > 0) {
        references.push(...structuredPath.structured.variables.path);
      }

      return references;
    }

    return [identifier];
  }

  /**
   * Validate a resolved path against context requirements
   */
  private validatePath(path: string | StructuredPath, context: ResolutionContext): string {
    // Convert structured path to string if needed
    const pathStr = typeof path === 'object' && 'normalized' in path
      ? path.normalized
      : path as string;

    if (context.pathValidation) {
      // Check if path is absolute or starts with a special variable
      if (context.pathValidation.requireAbsolute && !pathStr.startsWith('/')) {
        throw new MeldResolutionError(
          'Path must be absolute',
          {
            code: ResolutionErrorCode.INVALID_PATH,
            severity: ErrorSeverity.Fatal,
            details: {
              value: pathStr,
              context: JSON.stringify(context.pathValidation)
            }
          }
        );
      }

      // Check if path starts with an allowed root
      if (context.pathValidation.allowedRoots?.length) {
        const hasAllowedRoot = context.pathValidation.allowedRoots.some(root => {
          const rootVar = this.stateService.getPathVar(root);
          return rootVar && (
            pathStr.startsWith(rootVar + '/') ||
            pathStr === rootVar
          );
        });

        if (!hasAllowedRoot) {
          throw new MeldResolutionError(
            `Path must start with one of: ${context.pathValidation.allowedRoots.join(', ')}`,
            {
              code: ResolutionErrorCode.INVALID_PATH,
              severity: ErrorSeverity.Fatal,
              details: {
                value: pathStr,
                context: JSON.stringify(context.pathValidation)
              }
            }
          );
        }
      }
    }

    return pathStr;
  }

  /**
   * Get all path variables referenced in a node
   */
  getReferencedVariables(node: MeldNode): string[] {
    // Extract the path variable from the node
    const pathVar = this.getPathVarFromNode(node);
    if (!pathVar || pathVar.isSpecial) {
      return [];
    }

    // For structured paths, extract all variables
    if (node.type === 'Directive' &&
        (node as DirectiveNode).directive.value &&
        typeof (node as DirectiveNode).directive.value === 'object' &&
        'structured' in (node as DirectiveNode).directive.value) {

      const structuredPath = (node as DirectiveNode).directive.value as StructuredPath;
      const references: string[] = [pathVar.identifier];

      // Add special variables
      if (structuredPath.structured.variables.special.length > 0) {
        references.push(...structuredPath.structured.variables.special);
      }

      // Add path variables
      if (structuredPath.structured.variables.path.length > 0) {
        references.push(...structuredPath.structured.variables.path);
      }

      return references;
    }

    return [pathVar.identifier];
  }

  /**
   * Helper to extract PathVarNode from a node
   */
  private getPathVarFromNode(node: MeldNode): PathVarNode | null {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'path') {
      return null;
    }

    // For structured paths, create a synthetic PathVarNode
    if ((node as DirectiveNode).directive.value &&
        typeof (node as DirectiveNode).directive.value === 'object' &&
        'structured' in (node as DirectiveNode).directive.value) {

      const identifier = (node as DirectiveNode).directive.identifier;
      if (!identifier) return null;

      // Create a synthetic PathVarNode
      return {
        type: 'PathVar',
        identifier,
        isSpecial: false
      };
    }

    const pathVar = (node as DirectiveNode).directive.value as PathVarNode;
    if (!pathVar || pathVar.type !== 'PathVar') {
      return null;
    }

    return pathVar;
  }
}
```

# VariableReferenceResolver.ts

```typescript
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, TextNode, DirectiveNode } from 'meld-spec';

/**
 * Handles resolution of variable references ({{var}})
 * Previously used ${var} for text and #{var} for data, now unified as {{var}}
 */
export class VariableReferenceResolver {
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private readonly MAX_ITERATIONS = 100;

  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService: IResolutionService,
    private readonly parserService: IParserService
  ) {}

  /**
   * Resolves all variable references in the given text
   * @param text Text containing variable references like {{varName}}
   * @param context Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  async resolve(text: string, context: ResolutionContext): Promise<string> {
    // Ensure context state is properly accessed
    const stateTextVars = this.getSafeTextVars(context);
    const stateDataVars = this.getSafeDataVars(context);

    console.log('*** VariableReferenceResolver.resolve: ', {
      text,
      stateTextVars,
      stateDataVars
    });

    // Skip the resolution if there are no variable references
    if (!text.includes('{{')) {
      console.log('*** No variables detected in text, returning original');
      return text;
    }

    try {
      console.log('*** Attempting to parse text for AST-based resolution');
      return await this.resolveWithAst(text, context);
    } catch (error) {
      console.log('*** Error during AST parsing:', error);
      console.log('*** Falling back to simple variable resolution');
      return this.resolveSimpleVariables(text, context);
    }
  }

  /**
   * Process AST nodes to resolve variables
   */
  private async processNodes(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    let result = '';
    console.log('*** processNodes called with nodes:', {
      count: nodes.length,
      types: nodes.map(n => n.type),
      full: JSON.stringify(nodes, null, 2)
    });

    // Track variables being resolved to prevent circular references
    const resolutionPath: string[] = [];

    for (const node of nodes) {
      console.log('*** Processing node:', {
        type: node.type,
        details: JSON.stringify(node, null, 2)
      });

      if (node.type === 'Text') {
        const textNode = node as TextNode;
        // If the text contains variable references, resolve them
        if (textNode.content.includes('{{')) {
          const resolved = await this.resolveText(textNode.content, context, resolutionPath);
          console.log('*** Resolved text node content:', {
            original: textNode.content,
            resolved
          });
          result += resolved;
        } else {
          result += textNode.content;
        }
      } else if (node.type === 'TextVar' || node.type === 'DataVar' || node.type === 'VariableReference') {
        // Handle text/data variable nodes (new meld-ast format)
        // or variable reference nodes (backward compatibility)
        const varNode = node as any;

        // Extract variable reference - different formats depending on node type
        let varRef = varNode.reference || varNode.variable || varNode.identifier;

        // For DataVar nodes, handle field access
        if (node.type === 'DataVar' && varNode.fields && varNode.fields.length > 0) {
          varRef = `${varNode.identifier}.${varNode.fields.join('.')}`;
        }

        console.log('*** Processing variable node:', {
          nodeType: node.type,
          varRef,
          identifier: varNode.identifier,
          fields: varNode.fields,
          details: JSON.stringify(varNode, null, 2)
        });

        if (varRef) {
          // Split to get base variable and access path
          const parts = varRef.split('.');
          const baseVar = parts[0];

          console.log('*** Variable parts:', {
            parts,
            baseVar
          });

          // Check for circular references
          if (resolutionPath.includes(baseVar)) {
            const path = [...resolutionPath, baseVar].join(' -> ');
            throw new MeldResolutionError(
              `Circular reference detected: ${path}`,
              {
                code: ResolutionErrorCode.CIRCULAR_REFERENCE,
                details: { variableName: baseVar },
                severity: ErrorSeverity.Fatal
              }
            );
          }

          resolutionPath.push(baseVar);

          try {
            // Resolve variable value
            console.log('*** Resolving variable:', varRef);
            const resolved = await this.resolveVariable(varRef, context);
            console.log('*** Variable resolved to:', resolved);
            result += resolved;
          } finally {
            resolutionPath.pop();
          }
        }
      } else {
        // For other node types, convert to string
        console.log('*** Converting other node type to string:', node.type);
        const str = this.nodeToString(node);
        console.log('*** Converted to:', str);
        result += str;
      }
    }

    console.log('*** processNodes final result:', result);
    return result;
  }

  /**
   * Convert a node to string representation
   */
  private nodeToString(node: MeldNode): string {
    switch (node.type) {
      case 'Text':
        return (node as TextNode).content;
      case 'Directive':
        const directive = node as DirectiveNode;
        return `@${directive.directive.kind} ${directive.directive.identifier || ''} = "${directive.directive.value || ''}"`;
      default:
        return '';
    }
  }

  /**
   * Resolve text with variable references
   */
  private async resolveText(
    text: string,
    context: ResolutionContext,
    resolutionPath: string[] = []
  ): Promise<string> {
    // Debug the incoming context state
    console.log('*** resolveText context state:', {
      stateExists: !!context.state,
      stateMethods: context.state ? Object.keys(context.state) : 'undefined',
      text
    });

    if (!text) {
      return '';
    }

    let result = text;

    // Define the variable pattern for {{variable}} syntax
    // This replaces the old ${variable} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;

    // Check if there are any variables to resolve
    if (!variablePattern.test(result)) {
      return result;
    }

    // Reset the regex lastIndex
    variablePattern.lastIndex = 0;

    console.log('*** Starting variable resolution with pattern:', variablePattern.toString());

    // Check for variables to resolve
    const detectPattern = new RegExp(variablePattern);
    if (!detectPattern.test(result)) {
      console.log('*** No variables to resolve in:', result);
      return result;
    }

    // Reset lastIndex after test
    variablePattern.lastIndex = 0;

    let match;

    while ((match = variablePattern.exec(result)) !== null) {
      const [fullMatch, varRef] = match;

      console.log('*** Found variable match:', {
        fullMatch,
        varRef
      });

      // Split to get base variable and access path
      const parts = varRef.split('.');
      const baseVar = parts[0];

      console.log('*** Processing variable:', {
        parts,
        baseVar
      });

      // Check for circular references
      if (resolutionPath.includes(baseVar)) {
        const path = [...resolutionPath, baseVar].join(' -> ');
        throw new MeldResolutionError(
          `Circular reference detected: ${path}`,
          {
            code: ResolutionErrorCode.CIRCULAR_REFERENCE,
            details: { variableName: baseVar },
            severity: ErrorSeverity.Fatal
          }
        );
      }

      // Add to resolution path to track circular references
      resolutionPath.push(baseVar);

      try {
        // Resolve the variable value
        const resolvedValue = await this.resolveVariable(varRef, context);
        console.log('*** Resolved variable:', {
          varRef,
          resolvedValue
        });

        // Replace in result text - using a delimiter approach to avoid regex
        // lastIndex issues with variable replacement
        const prefix = result.substring(0, match.index);
        const suffix = result.substring(match.index + fullMatch.length);
        result = prefix + resolvedValue + suffix;

        // Reset pattern match index
        variablePattern.lastIndex = prefix.length + String(resolvedValue).length;
      } finally {
        // Remove from resolution path
        resolutionPath.pop();
      }
    }

    console.log('*** Final resolved text:', result);
    return result;
  }

  /**
   * Resolve a variable reference (with possible field access)
   */
  private async resolveVariable(
    varRef: string,
    context: ResolutionContext
  ): Promise<string> {
    console.log('*** Resolving variable reference:', {
      varRef,
      contextState: context.state ? 'available' : 'missing',
      allowedTypes: context.allowedVariableTypes
    });

    // Handle field access (e.g., user.name)
    const parts = varRef.split('.');
    const baseVar = parts[0];

    console.log('*** Variable parts:', {
      parts,
      baseVar
    });

    // Choose state service - prefer context.state if available
    const stateToUse = context.state || this.stateService;

    // Print all variables in state for debugging
    console.log('*** State variables available:', {
      textVars: Object.fromEntries(stateToUse.getAllTextVars() || []),
      dataVars: Object.keys(stateToUse.getAllDataVars() || {}),
      pathVars: Object.keys(stateToUse.getAllPathVars() || {})
    });

    // Try text variable first
    let value = stateToUse.getTextVar(baseVar);
    console.log('*** Text variable lookup result:', {
      variable: baseVar,
      value: value
    });

    // If not found in text vars, try data vars
    if (value === undefined && context.allowedVariableTypes.data) {
      value = stateToUse.getDataVar(baseVar);
      console.log('*** Data variable lookup result:', {
        variable: baseVar,
        value: value
      });
    }

    // Handle environment variables
    if (value === undefined && baseVar.startsWith('ENV_')) {
      const envVar = process.env[baseVar];
      console.log('*** Environment variable lookup:', {
        variable: baseVar,
        value: envVar
      });

      if (envVar === undefined) {
        throw new MeldResolutionError(
          'Environment variable not set: ' + baseVar,
          {
            code: ResolutionErrorCode.UNDEFINED_VARIABLE,
            details: {
              variableName: baseVar,
              variableType: 'text'
            },
            severity: ErrorSeverity.Recoverable
          }
        );
      }
      return envVar;
    }

    // Handle undefined variables
    if (value === undefined) {
      console.log('*** Variable not found:', baseVar);
      console.log('*** Checking context state directly');

      // Double-check by directly examining all variables (debug help)
      const allTextVars = stateToUse.getAllTextVars ? stateToUse.getAllTextVars() : {};
      console.log('*** All text variables:', Object.fromEntries(allTextVars));

      throw new MeldResolutionError(
        'Undefined variable: ' + baseVar,
        {
          code: ResolutionErrorCode.UNDEFINED_VARIABLE,
          details: {
            variableName: baseVar,
            variableType: 'text'
          },
          severity: ErrorSeverity.Recoverable
        }
      );
    }

    // Handle field access for data variables
    if (parts.length > 1 && typeof value === 'object') {
      console.log('*** Resolving field access:', {
        baseVar,
        fields: parts.slice(1),
        baseValue: typeof value === 'object' ? JSON.stringify(value) : value
      });

      try {
        value = this.resolveFieldAccess(value, parts.slice(1), context);
        console.log('*** Field access result:', value);
      } catch (error) {
        console.log('*** Field access error:', String(error));
        throw new MeldResolutionError(
          'Invalid field access: ' + parts.slice(1).join('.'),
          {
            code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
            details: {
              fieldPath: parts.slice(1).join('.')
            },
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }

    const result = String(value);
    console.log('*** Final resolved value:', result);
    return result;
  }

  /**
   * Resolve field access for object properties
   */
  private resolveFieldAccess(
    obj: any,
    fieldPath: string[],
    context: ResolutionContext
  ): any {
    return fieldPath.reduce((current, field) => {
      if (current === null || current === undefined) {
        throw new Error(`Cannot access field ${field} of undefined or null`);
      }

      // Handle array access with [] notation
      if (field.includes('[') && field.includes(']')) {
        const [arrayName, indexExpr] = field.split('[');
        const index = indexExpr.slice(0, -1); // Remove closing bracket

        // If index is a variable reference, resolve it
        if (index.startsWith('{{') && index.endsWith('}}')) {
          const indexVar = index.slice(2, -2);
          const indexValue = this.stateService.getTextVar(indexVar);
          if (indexValue === undefined) {
            throw new MeldResolutionError(
              'Undefined index variable: ' + indexVar,
              {
                code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                details: {
                  variableName: indexVar,
                  variableType: 'text'
                },
                severity: ErrorSeverity.Recoverable
              }
            );
          }
          return current[indexValue];
        }

        return current[index];
      }

      return current[field];
    }, obj);
  }

  /**
   * Handles the resolution of standard text variables using a simpler approach
   * @param text Text containing variable references
   * @param context Resolution context
   * @returns Text with variables resolved
   */
  private resolveSimpleVariables(text: string, context: ResolutionContext): string {
    console.log('*** SimpleVariables: Starting resolution on:', text);

    // Choose state service - prefer context.state if available
    const stateToUse = context.state || this.stateService;

    console.log('*** SimpleVariables: Available state variables:', {
      textVars: stateToUse ? ['[state service available]'] : [],
      dataVars: stateToUse ? ['[state service available]'] : []
    });

    // Regular expression to match variable references
    const variableRegex = /\{\{([^{}]+?)\}\}/g;
    let result = text;
    let iteration = 1;

    // Find all variable references in the text
    const matches: { fullMatch: string; varRef: string; matchIndex: number }[] = [];
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      matches.push({
        fullMatch: match[0],
        varRef: match[1],
        matchIndex: match.index
      });
    }

    // If no matches, return the original text
    if (matches.length === 0) {
      return text;
    }

    // Sort matches by position to ensure correct replacement order
    matches.sort((a, b) => a.matchIndex - b.matchIndex);

    console.log('*** SimpleVariables: Iteration', iteration);

    // Process each match
    for (const match of matches) {
      console.log('*** SimpleVariables: Processing variable:', match);

      // Handle field access in variable names (e.g., "data.user.name")
      const parts = match.varRef.split('.');
      const baseVar = parts[0];

      console.log('*** SimpleVariables: Variable parts:', { parts, baseVar });

      let value: any;

      // First, try to find the variable in the text variables
      value = stateToUse?.getTextVar?.(baseVar);
      console.log('*** SimpleVariables: Text variable lookup:', { variable: baseVar, value });

      // If not found in text variables, try data variables
      if (value === undefined) {
        value = stateToUse?.getDataVar?.(baseVar);
        console.log('*** SimpleVariables: Data variable lookup:', { variable: baseVar, value });
      }

      // If variable is not found, throw an error
      if (value === undefined) {
        if (baseVar.startsWith('ENV_')) {
          console.log('*** SimpleVariables: Environment variable not set:', baseVar);
          throw new MeldResolutionError(
            `Environment variable not set: ${baseVar}`,
            ErrorSeverity.RECOVERABLE,
            ResolutionErrorCode.VARIABLE_NOT_FOUND
          );
        } else {
          console.log('*** SimpleVariables: Undefined variable:', baseVar);
          throw new MeldResolutionError(
            `Undefined variable: ${baseVar}`,
            ErrorSeverity.RECOVERABLE,
            ResolutionErrorCode.VARIABLE_NOT_FOUND
          );
        }
      }

      // Handle field access for object values
      if (parts.length > 1 && typeof value === 'object' && value !== null) {
        try {
          // Navigate the object properties
          for (let i = 1; i < parts.length; i++) {
            value = value[parts[i]];
            if (value === undefined) {
              throw new MeldResolutionError(
                `Field not found: ${parts.slice(0, i + 1).join('.')}`,
                ErrorSeverity.RECOVERABLE,
                ResolutionErrorCode.FIELD_NOT_FOUND
              );
            }
          }
          console.log('*** SimpleVariables: Field access result:', value);
        } catch (error) {
          if (error instanceof MeldResolutionError) {
            throw error;
          }
          throw new MeldResolutionError(
            `Error accessing field: ${match.varRef}`,
            ErrorSeverity.RECOVERABLE,
            ResolutionErrorCode.FIELD_ACCESS_ERROR
          );
        }
      }

      // Replace the variable reference with its value
      const before = result;
      result = result.replace(match.fullMatch, String(value));

      console.log('*** SimpleVariables: Result after replacement:', {
        before,
        currentMatch: match.fullMatch,
        resolvedValue: String(value),
        after: result
      });
    }

    console.log('*** SimpleVariables: Final result:', result);
    return result;
  }

  /**
   * Checks if a resolution path contains a circular reference
   */
  private hasCircularReference(path: string[]): boolean {
    const seen = new Set<string>();
    for (const varName of path) {
      if (seen.has(varName)) {
        return true;
      }
      seen.add(varName);
    }
    return false;
  }

  /**
   * Extract all variable references from input text
   * Note: This method is synchronous to match the interface expected by tests
   */
  extractReferences(text: string): string[] {
    if (!text) {
      return [];
    }

    try {
      // Try AST-based extraction first
      return this.extractReferencesAst(text);
    } catch (error) {
      console.log('Error in AST reference extraction, falling back to regex:', error);
      // Fall back to regex-based extraction
      return this.extractReferencesRegex(text);
    }
  }

  /**
   * Helper method to asynchronously extract references using AST parsing
   * @internal
   */
  private async extractReferencesAsync(text: string): Promise<string[]> {
    try {
      // Use AST-based extraction
      const nodes = await this.parserService.parse(text);
      if (nodes && nodes.length > 0) {
        return this.extractReferencesFromNodes(nodes);
      }
    } catch (error) {
      console.log('*** Error parsing for reference extraction:', String(error));
    }

    // Fallback to regex
    return this.extractReferencesWithRegex(text);
  }

  /**
   * Extract references from AST nodes
   */
  private extractReferencesFromNodes(nodes: MeldNode[]): string[] {
    const references: Set<string> = new Set();

    for (const node of nodes) {
      if (node.type === 'Text') {
        // Extract from text content
        const textNode = node as TextNode;
        const extracted = this.extractReferencesFromText(textNode.content);
        extracted.forEach(ref => references.add(ref));
      } else if (node.type === 'TextVar' || node.type === 'DataVar' || node.type === 'PathVar') {
        // Extract from variable nodes
        const varNode = node as any;
        const varName = varNode.identifier || varNode.variable;
        if (varName) {
          references.add(varName);
        }
      } else if (node.type === 'VariableReference') {
        // Handle direct variable reference nodes
        const varRef = (node as any).reference;
        if (varRef) {
          // Get base variable name (before any field access)
          const baseVar = varRef.split('.')[0];
          references.add(baseVar);
        }
      }
    }

    return Array.from(references);
  }

  /**
   * Extract references from text using regex (fallback)
   */
  private extractReferencesWithRegex(text: string): string[] {
    // Use the new unified {{variable}} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const matches = text.match(variablePattern);

    if (!matches) {
      return [];
    }

    const refs = matches.map(match => {
      // Remove {{}} and get base variable name (before any field access)
      const varRef = match.slice(2, -2);
      return varRef.split('.')[0];
    });

    // Return unique references
    return [...new Set(refs)];
  }

  /**
   * Extract references from text content (helper method)
   */
  private extractReferencesFromText(text: string): string[] {
    // Use the new unified {{variable}} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const references: Set<string> = new Set();

    let match;
    while ((match = variablePattern.exec(text)) !== null) {
      const varRef = match[1];
      const baseVar = varRef.split('.')[0];
      references.add(baseVar);
    }

    return Array.from(references);
  }

  /**
   * Extract references using regex pattern matching
   * @param text The text to search for references
   * @returns Array of unique variable names
   */
  private extractReferencesRegex(text: string): string[] {
    const references = new Set<string>();
    const pattern = /\{\{([^{}]+?)\}\}/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const varRef = match[1];
      const baseVar = varRef.split('.')[0];
      references.add(baseVar);
    }

    return Array.from(references);
  }

  /**
   * Extract references using AST parser
   * @param text The text to parse for references
   * @returns Array of unique variable names
   */
  private extractReferencesAst(text: string): string[] {
    const references = new Set<string>();

    // Use the parser to get AST nodes
    const nodes = this.parserService.parse(text);

    // Extract variable names from nodes
    for (const node of nodes) {
      if (node.type === 'TextVar' || node.type === 'PathVar' || node.type === 'DataVar') {
        const varName = node.value.split('.')[0];
        references.add(varName);
      }
    }

    return Array.from(references);
  }

  // Safe accessor methods to handle different context shapes
  private getSafeTextVars(context: ResolutionContext): Record<string, string> {
    const stateService = context.state || this.stateService;

    // Try various ways the state might expose text variables
    if (stateService?.getAllTextVars && typeof stateService.getAllTextVars === 'function') {
      return stateService.getAllTextVars() || {};
    }

    if (stateService?.getTextVars && typeof stateService.getTextVars === 'function') {
      return stateService.getTextVars() || {};
    }

    // Fallback for test mocks or other state implementations
    if (typeof stateService === 'object' && stateService !== null) {
      if ('textVars' in stateService && typeof stateService.textVars === 'object') {
        return stateService.textVars || {};
      }
    }

    return {};
  }

  private getSafeDataVars(context: ResolutionContext): Record<string, any> {
    const stateService = context.state || this.stateService;

    // Try various ways the state might expose data variables
    if (stateService?.getAllDataVars && typeof stateService.getAllDataVars === 'function') {
      return stateService.getAllDataVars() || {};
    }

    if (stateService?.getDataVars && typeof stateService.getDataVars === 'function') {
      return stateService.getDataVars() || {};
    }

    // Fallback for test mocks or other state implementations
    if (typeof stateService === 'object' && stateService !== null) {
      if ('dataVars' in stateService && typeof stateService.dataVars === 'object') {
        return stateService.dataVars || {};
      }
    }

    return {};
  }

  private async resolveWithAst(text: string, context: ResolutionContext): Promise<string> {
    // Parse the text to get AST nodes
    const nodes = await this.parserService.parse(text);

    console.log('*** Parser result:', {
      hasNodes: !!nodes,
      nodeCount: nodes?.length || 0,
      nodeTypes: nodes?.map(n => n.type) || []
    });

    // If parsing failed or returned empty, return original text
    if (!nodes || nodes.length === 0) {
      console.log('*** No AST nodes, falling back to simple variables');
      return this.resolveSimpleVariables(text, context);
    }

    // Process nodes to resolve variables
    console.log('*** Processing AST nodes');
    const result = await this.processNodes(nodes, context);
    console.log('*** AST processing result:', result);
    return result;
  }
}
```

# ParserService.ts

```typescript
import { IParserService } from './IParserService.js';
import type { MeldNode, CodeFenceNode } from 'meld-spec';
import { parserLogger as logger } from '@core/utils/logger.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { Location, Position } from '@core/types/index.js';

// Define our own ParseError type since it's not exported from meld-ast
interface ParseError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface MeldAstError {
  message: string;
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  toString(): string;
}

function isMeldAstError(error: unknown): error is MeldAstError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).toString === 'function'
  );
}

export class ParserService implements IParserService {
  private async parseContent(content: string): Promise<MeldNode[]> {
    try {
      const { parse } = await import('meld-ast');
      const options = {
        failFast: true,
        trackLocations: true,
        validateNodes: true,
        preserveCodeFences: true,
        validateCodeFences: true,
        structuredPaths: true,
        onError: (error: unknown) => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        }
      };

      const result = await parse(content, options);

      // Validate code fence nesting
      this.validateCodeFences(result.ast || []);

      // Log any non-fatal errors
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        });
      }

      return result.ast || [];
    } catch (error) {
      if (isMeldAstError(error)) {
        // Preserve original error message and location
        throw new MeldParseError(
          error.message,
          error.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        );
      }
      // For unknown errors, provide a generic message
      throw new MeldParseError(
        'Parse error: Unknown error occurred',
        { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
      );
    }
  }

  public async parse(content: string): Promise<MeldNode[]> {
    return this.parseContent(content);
  }

  public async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
    const nodes = await this.parseContent(content);
    if (!filePath) {
      return nodes;
    }

    return nodes.map(node => {
      if (node.location) {
        // Preserve exact column numbers from original location
        return {
          ...node,
          location: {
            ...node.location,  // Preserve all original location properties
            filePath          // Only add filePath
          }
        };
      }
      return node;
    });
  }

  private isParseError(error: unknown): error is ParseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      'location' in error &&
      typeof error.location === 'object' &&
      error.location !== null &&
      'start' in error.location &&
      'end' in error.location
    );
  }

  private validateCodeFences(nodes: MeldNode[]): void {
    // Validate that code fences are closed with exactly the same number of backticks
    for (const node of nodes) {
      if (node.type === 'CodeFence') {
        const codeFence = node as CodeFenceNode;
        const content = codeFence.content;

        // Extract opening and closing backticks
        const openMatch = content.match(/^(`+)/);
        const closeMatch = content.match(/\n(`+)$/);

        if (!openMatch || !closeMatch) {
          throw new MeldParseError(
            'Invalid code fence: missing opening or closing backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }

        const openTicks = openMatch[1];
        const closeTicks = closeMatch[1];

        if (openTicks.length !== closeTicks.length) {
          throw new MeldParseError(
            `Code fence must be closed with exactly ${openTicks.length} backticks, got ${closeTicks.length}`,
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
      }
    }
  }
}
```

# PathDirectiveHandler.ts

```typescript
import { DirectiveNode, DirectiveData } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger';
import { ErrorSeverity } from '@core/errors/MeldError.js';

// Updated to match meld-ast 1.6.1 structure exactly
interface StructuredPath {
  raw: string;
  normalized?: string;
  structured: {
    base: string;
    segments: string[];
    variables?: {
      text?: string[];
      path?: string[];
      special?: string[];
    };
  };
}

interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  path: StructuredPath;
}

/**
 * Handler for @path directives
 * Stores path values in state after resolving variables
 */
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing path directive', {
      location: node.location,
      context
    });

    try {
      // Log state service information
      logger.debug('State service details', {
        stateExists: !!context.state,
        stateMethods: context.state ? Object.keys(context.state) : 'undefined'
      });

      // Create a new state for modifications
      const newState = context.state.clone();

      // Initialize special path variables if not already set
      if (newState.getPathVar('PROJECTPATH') === undefined) {
        const projectPath = this.stateService.getPathVar('PROJECTPATH') || process.cwd();
        logger.debug('Setting PROJECTPATH', { projectPath });
        newState.setPathVar('PROJECTPATH', projectPath);
      }

      if (newState.getPathVar('HOMEPATH') === undefined) {
        const homePath = this.stateService.getPathVar('HOMEPATH') ||
                        (process.env.HOME || process.env.USERPROFILE || '/home');
        logger.debug('Setting HOMEPATH', { homePath });
        newState.setPathVar('HOMEPATH', homePath);
      }

      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and path from directive
      const { directive } = node;

      // Debug the actual properties available on the directive
      console.log('*** DIRECTIVE PROPERTIES ***');
      console.log('Properties:', Object.keys(directive));
      console.log('Full directive:', JSON.stringify(directive, null, 2));

      const directivePath = directive as PathDirective;

      // Check if we have identifier and path before accessing them
      console.log('*** DIRECTIVE CASTING RESULT ***');
      console.log('directivePath has identifier?', 'identifier' in directivePath);
      console.log('directivePath has path?', 'path' in directivePath);

      // Support both 'identifier' and 'id' field names for backward compatibility
      const identifier = directivePath.identifier || (directivePath as any).id;

      // Handle both structured paths and raw string paths for compatibility
      // Check for both 'path' and 'value' properties to handle different formats
      let pathValue: string | undefined;

      if ('path' in directivePath && directivePath.path) {
        // Handle structured path object
        if (typeof directivePath.path === 'object' && 'raw' in directivePath.path) {
          pathValue = directivePath.path.raw;
        } else {
          // Handle direct value
          pathValue = String(directivePath.path);
        }
      } else if ('value' in directive) {
        // Handle legacy path value
        pathValue = String(directive.value);
      }

      // Log path information
      logger.debug('Path directive details', {
        identifier,
        pathValue,
        directiveProperties: Object.keys(directive),
        pathType: typeof pathValue,
        nodeType: node.type,
        directiveKind: directive.kind
      });

      // 3. Check for required fields
      if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
        throw new DirectiveError(
          'Path directive requires a valid identifier',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context
          }
        );
      }

      if (!pathValue) {
        throw new DirectiveError(
          'Path directive requires a path value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context
          }
        );
      }

      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath,
        newState
      );

      // Log the resolution context and inputs
      console.log('*** ResolutionService.resolveInContext', {
        value: pathValue,
        allowedVariableTypes: resolutionContext.allowedVariableTypes,
        pathValidation: resolutionContext.pathValidation,
        stateExists: !!resolutionContext.state,
        specialPathVars: {
          PROJECTPATH: newState.getPathVar('PROJECTPATH'),
          HOMEPATH: newState.getPathVar('HOMEPATH')
        }
      });

      // Resolve the path value
      const resolvedValue = await this.resolutionService.resolveInContext(
        pathValue,
        resolutionContext
      );

      // Store the path value
      newState.setPathVar(identifier, resolvedValue);

      // CRITICAL: Path variables should NOT be mirrored as text variables
      // This ensures proper separation between variable types for security purposes
      // Path variables should only be accessible via $path syntax, not {{path}} syntax

      logger.debug('Path directive processed successfully', {
        identifier,
        resolvedValue,
        location: node.location
      });

      return newState;
    } catch (error) {
      // Handle errors
      if (error instanceof DirectiveError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error processing path directive';
      throw new DirectiveError(
        message,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }
}
```

# PathDirectiveValidator.ts

```typescript
import { DirectiveNode, PathDirectiveData } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Validates path directives based on the latest meld-ast 1.6.1 structure
 */
export async function validatePathDirective(node: DirectiveNode, context?: ResolutionContext): Promise<void> {
  // Debug: Log the node structure
  console.log('*** VALIDATOR: DIRECTIVE NODE STRUCTURE ***');
  console.log(JSON.stringify(node, null, 2));

  if (!node.directive) {
    throw new MeldDirectiveError(
      'Path directive is missing required fields',
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }

  // Log the directive properties for debugging
  console.log('*** VALIDATOR: DIRECTIVE PROPERTIES ***');
  console.log('Properties:', Object.keys(node.directive));
  console.log('Full directive:', JSON.stringify(node.directive, null, 2));

  // Cast to PathDirectiveData to access typed properties
  const directive = node.directive as PathDirectiveData;

  // Fix for different field names: AST can use either 'id' or 'identifier'
  const identifier = directive.identifier || (directive as any).id;

  // Check for required fields
  if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
    throw new MeldDirectiveError(
      'Path directive requires a valid identifier',
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }

  // Validate identifier format (only allows alphanumeric and underscore)
  const identifierRegex = /^[a-zA-Z0-9_]+$/;
  if (!identifierRegex.test(identifier)) {
    throw new MeldDirectiveError(
      `Invalid identifier format: ${identifier}. Must contain only letters, numbers, and underscores.`,
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }

  // Handle both direct string value and path object
  let pathObject = directive.path;
  let pathRaw: string;

  if (!pathObject) {
    // If path is missing, check for value property as fallback
    if (directive.value) {
      pathRaw = directive.value;
    } else {
      throw new MeldDirectiveError(
        'Path directive requires a path value',
        DirectiveErrorCode.VALIDATION_FAILED,
        { location: node.location?.start }
      );
    }
  } else if (typeof pathObject === 'string') {
    // Handle direct string path
    pathRaw = pathObject;
  } else if (typeof pathObject === 'object') {
    // Handle path object with raw property
    if (!pathObject.raw || typeof pathObject.raw !== 'string' || pathObject.raw.trim() === '') {
      throw new MeldDirectiveError(
        'Path directive requires a non-empty path value',
        DirectiveErrorCode.VALIDATION_FAILED,
        { location: node.location?.start }
      );
    }
    pathRaw = pathObject.raw;
  } else {
    throw new MeldDirectiveError(
      'Path directive requires a valid path',
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }

  // Ensure we have a non-empty path
  if (!pathRaw || pathRaw.trim() === '') {
    throw new MeldDirectiveError(
      'Path directive requires a non-empty path value',
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }

  // Validate absolute path requirement if needed
  if (context?.pathValidation?.requireAbsolute && pathRaw.startsWith('/')) {
    throw new MeldDirectiveError(
      'Raw absolute paths are not allowed',
      DirectiveErrorCode.VALIDATION_FAILED,
      {
        location: node.location?.start,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Validate path segments (no relative segments)
  if (pathRaw.includes('/./') || pathRaw.includes('/../') ||
      pathRaw === '.' || pathRaw === '..' ||
      pathRaw.startsWith('./') || pathRaw.startsWith('../') ||
      pathRaw.endsWith('/.') || pathRaw.endsWith('/..')) {
    throw new MeldDirectiveError(
      'Path cannot contain . or .. segments',
      DirectiveErrorCode.VALIDATION_FAILED,
      {
        location: node.location?.start,
        severity: ErrorSeverity.Fatal
      }
    );
  }
}
```

# dependencies.ts

```typescript
/**
 * Defines the dependency relationships between Meld services.
 * This is used to validate service initialization order and ensure all required
 * dependencies are available.
 */

/**
 * Mapping of service names to their dependencies
 */
export const SERVICE_DEPENDENCIES = {
  // Base Services
  filesystem: [],  // Base dependency
  path: ['filesystem'],

  // State Management
  eventService: [], // Event system, no dependencies
  state: ['eventService'], // Requires event service

  // Core Pipeline
  parser: [],      // Independent parsing

  // Resolution Layer
  resolution: ['state', 'filesystem', 'parser'],
  validation: ['resolution'],
  circularity: ['resolution'],

  // Pipeline Orchestration (circular dependency handled specially)
  interpreter: ['state', 'directive'],
  directive: [
    'validation',
    'state',
    'path',
    'filesystem',
    'parser',
    'interpreter',
    'circularity',
    'resolution'
  ],

  // Output Generation
  output: ['state', 'interpreter'],

  // Debug Support (optional)
  debug: ['state']
} as const;

/**
 * Valid service names
 */
export type ServiceName = keyof typeof SERVICE_DEPENDENCIES;

/**
 * Service dependency mapping type
 */
export type ServiceDependencies = typeof SERVICE_DEPENDENCIES;

/**
 * Interface for services that require initialization
 */
export interface InitializableService {
  initialize(...args: any[]): void;
}

/**
 * Interface for services that can be validated
 */
export interface ValidatableService extends InitializableService {
  validate(): void;
}

/**
 * Interface for services that support transformation
 */
export interface TransformationCapableService {
  hasTransformationSupport?(): boolean;
  canHandleTransformations?(): boolean;
}
```

\===============================
\=== FAILING TESTS =============

> meld@10.0.0 test
> vitest run --no-coverage "ResolutionService|PathResolver|ParserService|PathDirectiveHandler|PathDirectiveValidator" | grep -B 1 -A 10 "FAIL"

file:///Users/adam/dev/meld/node_modules/vitest/dist/chunks/cac.CB_9Zo9Q.js:403
          throw new CACError(`Unknown option \`${name.length > 1 ? `--${name}` : `-${name}`}\``);
                ^

CACError: Unknown option `-B`
    at Command.checkUnknownOptions (file:///Users/adam/dev/meld/node_modules/vitest/dist/chunks/cac.CB_9Zo9Q.js:403:17)
    at CAC.runMatchedCommand (file:///Users/adam/dev/meld/node_modules/vitest/dist/chunks/cac.CB_9Zo9Q.js:603:13)
    at CAC.parse (file:///Users/adam/dev/meld/node_modules/vitest/dist/chunks/cac.CB_9Zo9Q.js:544:12)
    at file:///Users/adam/dev/meld/node_modules/vitest/dist/cli.js:8:13
    at ModuleJob.run (node:internal/modules/esm/module_job:271:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:547:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:116:5)

Node.js v22.12.0

\===============================
\=== TEST UTILITIES ============

# TestContext.ts

```typescript
import { MemfsTestFileSystem } from './MemfsTestFileSystem.js';
import { ProjectBuilder } from './ProjectBuilder.js';
import { TestSnapshot } from './TestSnapshot.js';
import { FixtureManager } from './FixtureManager.js';
import * as testFactories from './testFactories.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { OutputFormat } from '@services/pipeline/OutputService/IOutputService.js';
import { StateTrackingService } from './debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from './debug/StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from './debug/StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from './debug/StateHistoryService/StateHistoryService.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import type { IStateTrackingService } from './debug/StateTrackingService/IStateTrackingService.js';
import type { IStateVisualizationService } from './debug/StateVisualizationService/IStateVisualizationService.js';
import type { IStateDebuggerService } from './debug/StateDebuggerService/IStateDebuggerService.js';
import type { IStateHistoryService } from './debug/StateHistoryService/IStateHistoryService.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import type { DebugSessionConfig, DebugSessionResult } from './debug/StateDebuggerService/IStateDebuggerService.js';
import { TestDebuggerService } from './debug/TestDebuggerService.js';
import { mockProcessExit } from './cli/mockProcessExit.js';
import { mockConsole } from './cli/mockConsole.js';

interface SnapshotDiff {
  added: string[];
  removed: string[];
  modified: string[];
  modifiedContents: Map<string, string>;
}

interface TestFixtures {
  load(fixtureName: string): Promise<void>;
}

interface TestSnapshotInterface {
  takeSnapshot(): Promise<Map<string, string>>;
  compare(before: Map<string, string>, after: Map<string, string>): SnapshotDiff;
}

interface TestServices {
  parser: IParserService;
  interpreter: IInterpreterService;
  directive: IDirectiveService;
  validation: IValidationService;
  state: IStateService;
  path: IPathService;
  circularity: ICircularityService;
  resolution: IResolutionService;
  filesystem: IFileSystemService;
  output: IOutputService;
  debug: IStateDebuggerService;
  eventService: IStateEventService;
}

/**
 * Main test context that provides access to all test utilities
 */
export class TestContext {
  public readonly fs: MemfsTestFileSystem;
  public builder: ProjectBuilder;
  public readonly fixtures: TestFixtures;
  public readonly snapshot: TestSnapshot;
  public factory: typeof testFactories;
  public readonly services: TestServices;
  private fixturesDir: string;
  private cleanupFunctions: Array<() => void> = [];

  constructor(fixturesDir: string = 'tests/fixtures') {
    this.fs = new MemfsTestFileSystem();
    this.fs.initialize();
    this.builder = new ProjectBuilder(this.fs);
    this.fixturesDir = fixturesDir;

    // Initialize fixtures
    this.fixtures = {
      load: async (fixtureName: string): Promise<void> => {
        const fixturePath = path.join(process.cwd(), this.fixturesDir, `${fixtureName}.json`);
        const fixtureContent = await fs.readFile(fixturePath, 'utf-8');
        const fixture = JSON.parse(fixtureContent);
        await this.fs.loadFixture(fixture);
      }
    };

    // Initialize snapshot
    this.snapshot = new TestSnapshot(this.fs);

    this.factory = testFactories;

    // Initialize services
    const pathOps = new PathOperationsService();
    const filesystem = new FileSystemService(pathOps, this.fs);
    const validation = new ValidationService();
    const path = new PathService();

    // Initialize PathService first
    path.initialize(filesystem);
    path.enableTestMode();
    path.setProjectPath('/project');

    // Make FileSystemService use PathService for path resolution
    filesystem.setPathService(path);

    const parser = new ParserService();
    const circularity = new CircularityService();
    const interpreter = new InterpreterService();

    // Initialize event service
    const eventService = new StateEventService();

    // Initialize state service
    const state = new StateService(eventService);
    state.setCurrentFilePath('test.meld'); // Set initial file path
    state.enableTransformation(true);

    // Initialize special path variables
    state.setPathVar('PROJECTPATH', '/project');
    state.setPathVar('HOMEPATH', '/home/user');

    // Initialize resolution service
    const resolution = new ResolutionService(state, filesystem, parser);

    // Initialize debugger service
    const debuggerService = new TestDebuggerService(state);
    debuggerService.initialize(state);

    // Initialize directive service
    const directive = new DirectiveService();
    directive.initialize(
      validation,
      state,
      path,
      filesystem,
      parser,
      interpreter,
      circularity,
      resolution
    );

    // Initialize interpreter service
    interpreter.initialize(directive, state);

    // Register default handlers after all services are initialized
    directive.registerDefaultHandlers();

    // Initialize output service last, after all other services are ready
    const output = new OutputService();
    output.initialize(state, resolution);

    // Expose services
    this.services = {
      parser,
      interpreter,
      directive,
      validation,
      state,
      path,
      circularity,
      resolution,
      filesystem,
      output,
      debug: debuggerService,
      eventService
    };
  }

  /**
   * Initialize the test context
   */
  async initialize(): Promise<void> {
    this.fs.initialize();
    // Ensure project directory exists
    await this.fs.mkdir('/project');
    // Ensure fixture directories exist
    await this.fs.mkdir('/project/src');
    await this.fs.mkdir('/project/nested');
    await this.fs.mkdir('/project/shared');
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.fs.cleanup();
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
  }

  /**
   * Write a file in the test context
   * This method will automatically create parent directories if needed
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    logger.debug('Writing file in test context', { relativePath });

    // Use the PathService to properly resolve the path
    let resolvedPath;

    try {
      // If path contains slashes, we should prefix it with a path variable
      // to ensure it's correctly resolved according to Meld's path rules
      if (relativePath.includes('/') && !relativePath.startsWith('$')) {
        // Prefix with project path variable
        resolvedPath = this.services.path.resolvePath(`$PROJECTPATH/${relativePath}`);
      } else {
        resolvedPath = this.services.path.resolvePath(relativePath);
      }

      logger.debug('Resolved path for writing', { relativePath, resolvedPath });
    } catch (error) {
      // If PathService validation fails, fall back to the original behavior
      // Normalize the path to use forward slashes
      const normalizedPath = relativePath.replace(/\\/g, '/');

      // Ensure the path is absolute
      resolvedPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

      logger.debug('Using fallback path resolution', { relativePath, resolvedPath });
    }

    // Write the file
    logger.debug('Writing file', { resolvedPath });
    await this.fs.writeFile(resolvedPath, content);
  }

  /**
   * Parse meld content using meld-ast
   */
  parseMeld(content: string) {
    return this.services.parser.parse(content);
  }

  parseMeldWithLocations(content: string, filePath?: string) {
    return this.services.parser.parseWithLocations(content, filePath);
  }

  /**
   * Convert content to XML using llmxml
   */
  public async toXML(content: any): Promise<string> {
    const { createLLMXML } = await import('llmxml');
    const llmxml = createLLMXML();
    return llmxml.toXML(content);
  }

  /**
   * Create a basic test project structure
   */
  async createBasicProject(): Promise<void> {
    await this.builder.createBasicProject();
  }

  /**
   * Take a snapshot of the current filesystem state
   */
  async takeSnapshot(dir?: string): Promise<Map<string, string>> {
    return this.snapshot.takeSnapshot(dir);
  }

  /**
   * Compare two filesystem snapshots
   */
  compareSnapshots(before: Map<string, string>, after: Map<string, string>): SnapshotDiff {
    return this.snapshot.compare(before, after);
  }

  /**
   * Start a debug session for test tracing
   */
  async startDebugSession(config?: Partial<DebugSessionConfig>): Promise<string> {
    const defaultConfig: DebugSessionConfig = {
      captureConfig: {
        capturePoints: ['pre-transform', 'post-transform', 'error'] as const,
        includeFields: ['nodes', 'transformedNodes', 'variables'] as const,
        format: 'full'
      },
      visualization: {
        format: 'mermaid',
        includeMetadata: true,
        includeTimestamps: true
      },
      traceOperations: true,
      collectMetrics: true
    };

    const mergedConfig = { ...defaultConfig, ...config };
    return await this.services.debug.startSession(mergedConfig);
  }

  /**
   * End a debug session and get results
   */
  async endDebugSession(sessionId: string): Promise<DebugSessionResult> {
    return this.services.debug.endSession(sessionId);
  }

  /**
   * Get a visualization of the current state
   */
  async visualizeState(format: 'mermaid' | 'dot' = 'mermaid'): Promise<string> {
    return this.services.debug.visualizeState(format);
  }

  /**
   * Enable transformation mode
   */
  enableTransformation(): void {
    this.services.state.enableTransformation(true);
  }

  /**
   * Disable transformation mode
   */
  disableTransformation(): void {
    this.services.state.enableTransformation(false);
  }

  /**
   * Enable debug mode
   */
  enableDebug(): void {
    // Initialize debug service if not already done
    if (!this.services.debug) {
      const debuggerService = new StateDebuggerService(
        this.services.debug.visualization,
        this.services.debug.history,
        this.services.debug.tracking
      );
      (this.services as any).debug = debuggerService;
    }
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    if (this.services.debug) {
      (this.services as any).debug = undefined;
    }
  }

  /**
   * Set output format
   */
  setFormat(format: OutputFormat): void {
    this.services.output.setFormat(format);
  }

  /**
   * Reset all services to initial state
   */
  reset(): void {
    // Reset state service
    this.services.state.reset();

    // Reset debug service if enabled
    if (this.services.debug) {
      this.services.debug.reset();
    }

    // Reset tracking service
    this.services.debug.tracking.reset();

    // Reset history service
    this.services.debug.history.reset();

    // Reset visualization service
    this.services.debug.visualization.reset();
  }

  /**
   * Mock process.exit to prevent tests from exiting the process
   * @returns Object with exit code and exit was called flag
   */
  mockProcessExit() {
    const result = mockProcessExit();
    this.registerCleanup(result.restore);
    return result;
  }

  /**
   * Mock console methods (log, error, warn) to capture output
   * @returns Object with captured output and restore function
   */
  mockConsole() {
    const result = mockConsole();
    this.registerCleanup(result.restore);
    return result;
  }

  /**
   * Set up environment variables for testing
   * @param envVars - Environment variables to set
   * @returns This TestContext instance for chaining
   */
  withEnvironment(envVars: Record<string, string>) {
    const originalEnv = { ...process.env };

    // Set environment variables
    Object.entries(envVars).forEach(([key, value]) => {
      process.env[key] = value;
    });

    // Register cleanup
    this.registerCleanup(() => {
      process.env = originalEnv;
    });

    return this;
  }

  /**
   * Set up a complete CLI test environment
   * @param options - Options for setting up the CLI test environment
   * @returns Object containing mock functions and file system
   */
  async setupCliTest(options: {
    files?: Record<string, string>;
    env?: Record<string, string>;
    mockExit?: boolean;
    mockConsoleOutput?: boolean;
    projectRoot?: string;
  } = {}) {
    const result: Record<string, any> = {};

    // Create project directory structure first
    const projectRoot = options.projectRoot || '/project';
    await this.fs.mkdir(projectRoot, { recursive: true });

    // Set up file system if needed
    if (options.files && Object.keys(options.files).length > 0) {
      // Add files to the memory file system
      for (const [filePath, content] of Object.entries(options.files)) {
        try {
          // Ensure the path is absolute
          const absolutePath = filePath.startsWith('/') ? filePath : `/${filePath}`;

          // Handle special paths like $./file.txt
          const resolvedPath = this.resolveSpecialPath(absolutePath, projectRoot);

          // Create parent directories if needed
          const dirPath = resolvedPath.substring(0, resolvedPath.lastIndexOf('/'));
          if (dirPath) {
            await this.fs.mkdir(dirPath, { recursive: true });
          }

          // Write the file
          await this.fs.writeFile(resolvedPath, content);
        } catch (error) {
          console.warn(`Failed to create file ${filePath}:`, error);
        }
      }

      result.fs = this.fs;
    }

    // Set up environment variables if needed
    if (options.env && Object.keys(options.env).length > 0) {
      this.withEnvironment(options.env);
    }

    // Mock process.exit if needed
    if (options.mockExit !== false) {
      result.exitMock = this.mockProcessExit();
    }

    // Mock console if needed
    if (options.mockConsoleOutput !== false) {
      result.consoleMocks = this.mockConsole();
    }

    return result;
  }

  /**
   * Resolve special path syntax ($./file.txt, $~/file.txt)
   * @param path The path to resolve
   * @param projectRoot The project root directory
   * @returns Resolved absolute path
   */
  private resolveSpecialPath(path: string, projectRoot: string): string {
    if (path.includes('$./') || path.includes('$PROJECTPATH/')) {
      return path.replace(/\$\.\//g, `${projectRoot}/`).replace(/\$PROJECTPATH\//g, `${projectRoot}/`);
    } else if (path.includes('$~/') || path.includes('$HOMEPATH/')) {
      return path.replace(/\$~\//g, '/home/user/').replace(/\$HOMEPATH\//g, '/home/user/');
    }
    return path;
  }

  /**
   * Use memory file system for testing
   * This is a no-op since TestContext already uses a memory file system by default
   * Added for compatibility with setupCliTest
   */
  useMemoryFileSystem(): void {
    // No-op: TestContext already uses MemfsTestFileSystem by default
    // This method exists for API compatibility with setupCliTest
  }

  /**
   * Register a cleanup function
   * @param fn - Cleanup function to register
   */
  registerCleanup(fn: () => void) {
    this.cleanupFunctions.push(fn);
  }
}
```

# StateTrackingService.ts

```typescript
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateTrackingService, StateMetadata, StateRelationship } from './IStateTrackingService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @package
 * Implementation of the state tracking service.
 *
 * @remarks
 * Provides state instance tracking, relationship management, and metadata storage.
 * Uses UUIDs for state identification and maintains relationship graphs.
 */
export class StateTrackingService implements IStateTrackingService {
  private states: Map<string, StateMetadata>;
  private relationships: Map<string, StateRelationship[]>;

  constructor() {
    this.states = new Map();
    this.relationships = new Map();
  }

  registerState(metadata: Partial<StateMetadata> & { id?: string }): string {
    // Use provided ID or generate a new one
    const stateId = metadata.id || uuidv4();

    if (this.states.has(stateId)) {
      // Update existing state metadata
      const existingMetadata = this.states.get(stateId)!;
      this.states.set(stateId, {
        ...existingMetadata,
        ...metadata,
        id: stateId
      });
    } else {
      // Create new state metadata
      this.states.set(stateId, {
        id: stateId,
        source: metadata.source || 'implicit',
        parentId: metadata.parentId,
        filePath: metadata.filePath,
        transformationEnabled: metadata.transformationEnabled || false,
        createdAt: Date.now()
      });
    }

    return stateId;
  }

  getStateMetadata(stateId: string): StateMetadata | undefined {
    return this.states.get(stateId);
  }

  addRelationship(sourceId: string, targetId: string, type: 'parent-child' | 'merge-source' | 'merge-target'): void {
    logger.debug('Adding relationship:', {
      operation: 'addRelationship',
      sourceId,
      targetId,
      type,
      sourceState: this.states.get(sourceId),
      targetState: this.states.get(targetId),
      sourceRelationships: this.relationships.get(sourceId),
      targetRelationships: this.relationships.get(targetId)
    });

    // Ensure both states exist
    if (!this.states.has(sourceId)) {
      logger.debug('Creating missing source state', { sourceId });
      this.registerState({ id: sourceId });
    }
    if (!this.states.has(targetId)) {
      logger.debug('Creating missing target state', { targetId });
      this.registerState({ id: targetId });
    }

    // Initialize relationships arrays if they don't exist
    if (!this.relationships.has(sourceId)) {
      logger.debug('Initializing source relationships array', { sourceId });
      this.relationships.set(sourceId, []);
    }
    if (!this.relationships.has(targetId)) {
      logger.debug('Initializing target relationships array', { targetId });
      this.relationships.set(targetId, []);
    }

    // Get the current relationships
    const relationships = this.relationships.get(sourceId)!;
    logger.debug('Current relationships before adding new one:', {
      sourceId,
      targetId,
      type,
      existingRelationships: relationships
    });

    // Check if this exact relationship already exists
    const existingRelationship = relationships.find(rel =>
      rel.targetId === targetId && rel.type === type
    );

    // Add the new relationship if it doesn't exist
    if (!existingRelationship) {
      relationships.push({ targetId, type });
      logger.debug('Added new relationship:', {
        sourceId,
        targetId,
        type,
        updatedRelationships: relationships
      });

      // For parent-child relationships, update the child's metadata
      if (type === 'parent-child') {
        const targetState = this.states.get(targetId);
        if (targetState) {
          const oldParentId = targetState.parentId;
          targetState.parentId = sourceId;
          this.states.set(targetId, targetState);
          logger.debug('Updated child state metadata for parent-child:', {
            childId: targetId,
            oldParentId,
            newParentId: sourceId,
            updatedMetadata: targetState
          });
        }
      }

      // For merge operations, we need to handle both source and target relationships
      if (type === 'merge-source' || type === 'merge-target') {
        const sourceState = this.states.get(sourceId);
        const targetState = this.states.get(targetId);

        logger.debug('Processing merge relationship:', {
          type,
          sourceState,
          targetState,
          sourceStateParentId: sourceState?.parentId,
          targetStateParentId: targetState?.parentId
        });

        if (sourceState && targetState) {
          if (type === 'merge-source') {
            const oldParentId = targetState.parentId;
            targetState.parentId = sourceId;
            this.states.set(targetId, targetState);
            logger.debug('Updated target state metadata for merge-source:', {
              targetId,
              oldParentId,
              newParentId: sourceId,
              updatedMetadata: targetState
            });
          } else if (type === 'merge-target') {
            const targetParentId = targetState.parentId;
            if (targetParentId) {
              const oldParentId = sourceState.parentId;
              sourceState.parentId = targetParentId;
              this.states.set(sourceId, sourceState);
              logger.debug('Updated source state metadata for merge-target:', {
                sourceId,
                oldParentId,
                newParentId: targetParentId,
                updatedMetadata: sourceState
              });
            }
          }
        }
      }
    }

    logger.debug('Final state after relationship operation:', {
      sourceId,
      targetId,
      type,
      sourceState: this.states.get(sourceId),
      targetState: this.states.get(targetId),
      sourceRelationships: this.relationships.get(sourceId),
      targetRelationships: this.relationships.get(targetId)
    });
  }

  getRelationships(stateId: string): StateRelationship[] {
    return this.relationships.get(stateId) || [];
  }

  getParentState(stateId: string): string | undefined {
    const metadata = this.states.get(stateId);
    return metadata?.parentId;
  }

  getChildStates(stateId: string): string[] {
    const relationships = this.relationships.get(stateId) || [];
    return relationships
      .filter(r => r.type === 'parent-child' || r.type === 'merge-source')
      .map(r => r.targetId);
  }

  hasState(stateId: string): boolean {
    return this.states.has(stateId);
  }

  getAllStates(): StateMetadata[] {
    return Array.from(this.states.values());
  }

  getStateLineage(stateId: string, visited: Set<string> = new Set()): string[] {
    logger.debug('Getting state lineage:', {
      operation: 'getStateLineage',
      stateId,
      visitedStates: Array.from(visited),
      currentState: this.states.get(stateId)
    });

    if (!this.states.has(stateId)) {
      logger.debug('State not found, returning empty lineage', { stateId });
      return [];
    }

    // If we've seen this state before, return empty array to prevent cycles
    if (visited.has(stateId)) {
      logger.debug('State already visited, preventing cycle', { stateId });
      return [];
    }

    // Mark this state as visited
    visited.add(stateId);
    logger.debug('Marked state as visited', {
      stateId,
      visitedStates: Array.from(visited)
    });

    // Get the state's metadata
    const metadata = this.states.get(stateId)!;
    logger.debug('Retrieved state metadata', {
      stateId,
      metadata,
      relationships: this.relationships.get(stateId) || []
    });

    // Get parent's lineage first (recursively)
    let parentLineage: string[] = [];
    if (metadata.parentId) {
      parentLineage = this.getStateLineage(metadata.parentId, visited);
      logger.debug('Retrieved parent lineage', {
        stateId,
        parentId: metadata.parentId,
        parentLineage,
        parentState: this.states.get(metadata.parentId)
      });
    }

    // Check for merge relationships
    const relationships = this.relationships.get(stateId) || [];
    const mergeTargets = relationships
      .filter(rel => rel.type === 'merge-target')
      .map(rel => rel.targetId);

    logger.debug('Found merge target relationships', {
      stateId,
      relationships,
      mergeTargets,
      mergeTargetStates: mergeTargets.map(id => this.states.get(id))
    });

    // Get lineage from merge targets AND their parents
    const mergeLineages = mergeTargets.flatMap(targetId => {
      logger.debug('Processing merge target', {
        stateId,
        targetId,
        targetState: this.states.get(targetId),
        targetRelationships: this.relationships.get(targetId)
      });

      if (visited.has(targetId)) {
        logger.debug('Merge target already visited, skipping', { targetId });
        return [];
      }

      const targetState = this.states.get(targetId);
      if (!targetState) {
        logger.debug('Merge target state not found', { targetId });
        return [];
      }

      // Include target's parent in lineage
      const targetParentId = targetState.parentId;
      logger.debug('Processing merge target parent', {
        targetId,
        targetParentId,
        targetParentState: targetParentId ? this.states.get(targetParentId) : undefined,
        targetParentRelationships: targetParentId ? this.relationships.get(targetParentId) : undefined
      });

      if (targetParentId && !visited.has(targetParentId)) {
        // Get parent's lineage first
        const parentLineage = this.getStateLineage(targetParentId, visited);
        // Then get target's lineage
        const targetLineage = this.getStateLineage(targetId, visited);

        logger.debug('Combined merge target lineages', {
          targetId,
          parentLineage,
          targetLineage,
          combined: [...new Set([...parentLineage, ...targetLineage])]
        });

        // Combine them, ensuring no duplicates
        return [...new Set([...parentLineage, ...targetLineage])];
      }

      // If no parent, just get target's lineage
      const targetLineage = this.getStateLineage(targetId, visited);
      logger.debug('Got merge target lineage (no parent)', {
        targetId,
        targetLineage
      });
      return targetLineage;
    });

    logger.debug('Processed all merge lineages', {
      stateId,
      mergeLineages,
      flattenedMergeLineages: mergeLineages.flat()
    });

    // Combine parent lineage with merge target lineages
    const combinedLineage = [...parentLineage];
    logger.debug('Starting lineage combination', {
      stateId,
      initialCombinedLineage: combinedLineage
    });

    // Ensure we're working with arrays, not strings
    const flattenedMergeLineages = mergeLineages.flat();
    logger.debug('Flattened merge lineages', {
      stateId,
      flattenedMergeLineages
    });

    // Add each ID from the flattened merge lineages
    for (const id of flattenedMergeLineages) {
      if (!combinedLineage.includes(id)) {
        combinedLineage.push(id);
        logger.debug('Added ID to combined lineage', {
          stateId,
          addedId: id,
          updatedCombinedLineage: combinedLineage
        });
      }
    }

    // Add current state to the lineage
    if (!combinedLineage.includes(stateId)) {
      combinedLineage.push(stateId);
      logger.debug('Added current state to lineage', {
        stateId,
        finalCombinedLineage: combinedLineage
      });
    }

    logger.debug('Final lineage result', {
      stateId,
      parentLineage,
      mergeLineages: flattenedMergeLineages,
      combinedLineage,
      relationships: this.relationships.get(stateId)
    });

    return combinedLineage;
  }

  getStateDescendants(stateId: string, visited: Set<string> = new Set()): string[] {
    if (!this.states.has(stateId)) {
      return [];
    }

    // If we've seen this state before, return empty array to prevent cycles
    if (visited.has(stateId)) {
      return [];
    }

    // Mark this state as visited
    visited.add(stateId);

    // Get all relationships where this state is the parent
    const childRelationships = this.relationships.get(stateId) || [];

    // Get immediate children
    const children = childRelationships
      .filter(rel => rel.type === 'parent-child' || rel.type === 'merge-source')
      .map(rel => rel.targetId);

    // Get descendants of each child
    const descendantArrays = children.map(childId =>
      this.getStateDescendants(childId, visited)
    );

    // Combine immediate children with their descendants
    return [...children, ...descendantArrays.flat()];
  }
}
```

# StateHistoryService.ts

```typescript
import { IStateEventService, StateEvent } from '@services/state/StateEventService/IStateEventService';
import { IStateHistoryService, StateOperation, StateTransformation, HistoryFilter } from './IStateHistoryService';

/**
 * @package
 * Implementation of state history tracking service.
 */
export class StateHistoryService implements IStateHistoryService {
  private operations: StateOperation[] = [];
  private transformations: StateTransformation[] = [];

  constructor(private eventService: IStateEventService) {
    // Subscribe to all state events
    this.setupEventSubscriptions();
  }

  private setupEventSubscriptions(): void {
    // Subscribe to create, clone, transform, and merge events
    this.eventService.on('create', this.handleStateEvent.bind(this));
    this.eventService.on('clone', this.handleStateEvent.bind(this));
    this.eventService.on('transform', this.handleStateEvent.bind(this));
    this.eventService.on('merge', this.handleStateEvent.bind(this));
  }

  private handleStateEvent(event: StateEvent): void {
    const operation: StateOperation = {
      type: event.type,
      stateId: event.stateId,
      source: event.source,
      timestamp: event.timestamp,
    };

    this.recordOperation(operation);

    // If it's a transformation, record it separately
    if (event.type === 'transform' && 'details' in event) {
      const transformation: StateTransformation = {
        stateId: event.stateId,
        timestamp: event.timestamp,
        operation: event.details?.operation || 'unknown',
        source: event.source,
        before: event.details?.before,
        after: event.details?.after,
      };
      this.transformations.push(transformation);
    }
  }

  public recordOperation(operation: StateOperation): void {
    this.operations.push({ ...operation });
  }

  public getOperationHistory(stateId: string): StateOperation[] {
    return this.operations
      .filter(op => op.stateId === stateId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public getTransformationChain(stateId: string): StateTransformation[] {
    return this.transformations
      .filter(t => t.stateId === stateId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public queryHistory(filter: HistoryFilter): StateOperation[] {
    return this.operations
      .filter(op => {
        // Apply each filter criteria
        if (filter.stateIds && !filter.stateIds.includes(op.stateId)) {
          return false;
        }
        if (filter.types && !filter.types.includes(op.type)) {
          return false;
        }
        if (filter.source && op.source !== filter.source) {
          return false;
        }
        if (filter.timeRange) {
          if (filter.timeRange.start && op.timestamp < filter.timeRange.start) {
            return false;
          }
          if (filter.timeRange.end && op.timestamp > filter.timeRange.end) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public getRelatedOperations(operation: StateOperation, windowMs: number): StateOperation[] {
    const windowStart = operation.timestamp - windowMs;
    const windowEnd = operation.timestamp + windowMs;

    return this.operations
      .filter(op =>
        op.timestamp >= windowStart &&
        op.timestamp <= windowEnd &&
        op.stateId !== operation.stateId
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public clearHistoryBefore(beforeTimestamp: number): void {
    this.operations = this.operations.filter(op => op.timestamp >= beforeTimestamp);
    this.transformations = this.transformations.filter(t => t.timestamp >= beforeTimestamp);
  }

  public getStateHistory(stateId: string): { operations: StateOperation[]; transformations: StateTransformation[] } {
    return {
      operations: this.getOperationHistory(stateId),
      transformations: this.getTransformationChain(stateId)
    };
  }
}
```

\===============================
\=== YOUR TASK =================

## Phase 1 Priority Tasks

### 1.1 Path Resolution and Parsing

- Fix the structured path format transition issues in ResolutionService
- Ensure proper handling of special path variables ($PROJECTPATH, $HOMEPATH, $., $~)
- Correct property name mismatches between AST nodes and validator expectations
- Update PathDirectiveHandler to properly handle the StructuredPath object format
- Update PathDirectiveValidator to align with expected test formats

### 1.2 AST Integration and Service Architecture

- Enforce ParserService as the sole interface to meld-ast
- Remove direct meld-ast imports from other services
- Remove custom code fence validation regex in favor of AST properties
- Update ContentResolver to leverage AST node properties

When providing solutions:

1. Focus on one issue at a time
2. Provide specific file paths and line numbers for changes
3. Explain your reasoning so we understand the fix
4. Ensure types and interfaces are properly maintained
5. Consider potential side effects of changes

IMPORTANT: We have robust test utilities - use them to validate your solutions! You can leverage StateTrackingService and StateHistoryService for debugging complex issues.