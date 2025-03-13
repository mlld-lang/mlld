# Comprehensive Plan for Addressing Output Formatting and Variable Resolution

## Issue Summary

The codebase has several critical issues related to output formatting and variable resolution:

1. **Object Property Access:** Complex objects and arrays are incorrectly serialized in transformation output, requiring regex-based workarounds in `api/index.ts`. When accessing nested properties using the `{{variable.property.path}}` syntax, the entire object is output rather than just the requested value.

2. **Newline Handling Inconsistency:** Markdown output uses inconsistent newline patterns between nodes, causing formatting issues in tests and output. This became apparent after changing from single newlines (`\n`) to double newlines (`\n\n`) between markdown nodes.

3. **Variable Substitution Formatting:** When replacing variable references, the context and formatting of the surrounding text is not preserved, breaking line formatting. For example, `The greeting is: {{greeting}}` becomes split across multiple lines.

4. **Output Format Differences:** Inconsistencies between different output formats (markdown vs XML) create unpredictable behavior, requiring additional workarounds.

## Root Causes Identified

1. **JSON Serialization Issue:** When accessing nested object properties, the entire object is serialized instead of just the requested value.

2. **Inconsistent Type Handling:** Different handling for strings, primitives, and objects creates inconsistent output.

3. **Field Access Implementation:** The `accessFields` method in `VariableReferenceResolver` correctly extracts the values, but the output pipeline doesn't use this value properly.

4. **Data Type Preservation:** During transformation, object structures are not properly maintained, resulting in stringification issues.

5. **Newline Standardization:** Lack of consistent standard for newline handling between markdown nodes.

6. **Variable Replacement Context Loss:** Variable replacement doesn't preserve the surrounding text context and formatting.

7. **OutputService Conversion:** The `convertToString` method forces JSON stringification for objects rather than extracting the specific requested field.

## Phase 1: Investigation and Test Suite Enhancement

**Goal:** Create a comprehensive test suite covering both object access and text formatting issues.

**Tasks:**
1. Create detailed syntax examples in `core/syntax/`:
   - Add dedicated section for object property access patterns in `data.ts`
   - Create newline handling examples in appropriate syntax files (e.g., `text.ts`)
   - Document variable resolution expectations in different contexts
   - Define invalid access patterns with expected errors
   - Follow the established centralized syntax pattern

2. Create dedicated test files with proper DI architecture:
   - Implement detailed object property access tests using `TestContextDI`
   - Add specific newline handling tests
   - Create variable substitution formatting tests
   - Follow test standards from `docs/dev/TEST_STANDARDS.md`
   - Ensure proper async resolution and cleanup
   - Record current behavior with and without workarounds

3. Set up debug instrumentation:
   - Use `StateVisualizationService` to visualize variable resolution
   - Add detailed logging for text transformation and formatting
   - Create tracers for both object resolution and text formatting
   - Create a visualization for newline handling and variable replacement

4. Document existing workarounds:
   - Add detailed comments explaining each regex replacement in `api/index.ts`
   - Document newline handling inconsistencies
   - Create a migration path for each workaround

**Exit Criteria:**
- Comprehensive test suite covering all object property access patterns
- Tests for newline handling in different contexts
- Variable substitution formatting tests
- Tests demonstrate current issues without workarounds and passing with workarounds
- Debug visualization shows exact point of failure in transformation pipeline
- Documentation of all workarounds with clear purpose explanation

Once you have confirmed all tests pass and the build runs without errors, create a commit for this phase.

## Phase 2: Text Formatting Enhancement and Standardization

**Goal:** Create consistent text formatting standards and implement them across the codebase.

**Tasks:**
1. Define formatting standards:
   - Document clear conventions for newlines in markdown output
   - Specify formatting rules for different node types (Text, TextVar, DataVar)
   - Create standard for variable substitution formatting
   - Define how context is preserved during variable substitution

2. Enhance variable substitution mechanism:
   - Create context-aware variable replacement that preserves line structure
   - Implement intelligent newline handling for different variable types
   - Add special handling for inline vs. block-level variable substitution
   - Establish priority rules for formatting conflicts

3. Refactor `nodeToMarkdown` method in OutputService:
   - Implement the standardized formatting rules
   - Fix newline handling consistency
   - Add proper context tracking for text nodes
   - Handle different node types consistently

4. Update tests to verify formatting:
   - Create tests for variable substitution in various contexts
   - Test different newline handling scenarios
   - Verify formatting is consistent across node types
   - Test boundary cases (variables at line start/end)

**Exit Criteria:**
- Clearly documented formatting standards
- Consistent newline handling across the codebase
- Variable substitution preserves line formatting
- Tests pass with standardized formatting rules
- No regression in existing functionality

Once you have confirmed all tests pass and the build runs without errors, create a commit for this phase.

## Phase 3: Client Interface Enhancement for Resolution Services

**Goal:** Enhance the resolution pipeline to properly handle field access using the Client Factory pattern.

**Tasks:**
1. Create dedicated client interfaces:
   - Define `IVariableReferenceResolverClient` with clean field access methods
   - Create `VariableReferenceResolverClientFactory` following DI patterns
   - Update DI registration in `core/di-config.ts`

2. Improve field access implementation:
   - Enhance `accessFields` to handle all data types consistently
   - Add proper type preservation mechanisms
   - Integrate with the standardized formatting rules
   - Implement result caching for performance
   - Add comprehensive logging for debugging

3. Update variable resolution with context-awareness:
   - Implement context tracking to preserve text formatting
   - Add mechanisms to detect inline vs. block variable usage
   - Implement formatting preservation during substitution
   - Handle special cases (variables at line boundaries)

4. Update tests to use the new client interface:
   - Create mock implementations following test standards
   - Verify field access behavior with different data types
   - Test variable resolution in different contexts
   - Test performance with complex nested structures

**Exit Criteria:**
- Clean interface for accessing object properties
- Type-safe field access methods with formatting preservation
- Context-aware variable resolution
- Tests pass using the client interface with consistent formatting
- No regression in existing functionality

Once you have confirmed all tests pass and the build runs without errors, create a commit for this phase.

## Phase 4: OutputService DI Refactoring

**Goal:** Refactor the OutputService to correctly use the enhanced resolver client and standardized formatting.

**Tasks:**
1. Update OutputService to use VariableReferenceResolverClient:
   - Inject the factory following DI best practices
   - Create a dedicated client instance
   - Use the client for all variable resolution operations

2. Fix the transformation mode handling:
   - Create a clear handling path for transformed nodes
   - Preserve data types during transformation
   - Implement clean object access for variables
   - Ensure consistent newline handling in transformation mode

3. Update the nodeToMarkdown method:
   - Improve detection and handling of field access patterns
   - Add proper context tracking for resolution
   - Fix convertToString handling for objects and arrays
   - Implement standardized newline handling

4. Create unified handling for different output formats:
   - Standardize behavior between markdown and XML output
   - Create common formatting utilities for all output formats
   - Ensure consistent handling of special cases

5. Implement proper error handling:
   - Add specific error types for field access and formatting issues
   - Implement graceful fallbacks for certain error cases
   - Add detailed error information for debugging

**Exit Criteria:**
- OutputService passes all tests without workarounds
- Clean integration with the resolver client
- Consistent formatting across all output modes
- Proper error handling for field access and formatting issues
- No regression in existing functionality

Once you have confirmed all tests pass and the build runs without errors, create a commit for this phase.

## Phase 5: Central Syntax Integration and API Cleanup

**Goal:** Update central syntax examples and clean up workarounds in the API layer.

**Tasks:**
1. Enhance `core/syntax` with comprehensive examples:
   - Add complex object literals and access patterns
   - Include detailed formatting examples for different contexts
   - Define newline handling expectations
   - Include array access patterns
   - Define nested objects with mixed types
   - Create examples for common error patterns

2. Systematically remove workarounds from API layer:
   - Identify each regex replacement in `api/index.ts`
   - Remove workarounds for newline handling in tests
   - Test removal with the new implementation
   - Document the before/after behavior
   - Update any tests that depend on specific output formats

3. Update test expectations:
   - Fix hardcoded tests to properly check results
   - Update expected outputs to match new standardized formatting
   - Remove unnecessary test-specific workarounds

4. Review and cleanup all affected integration tests:
   - Ensure all tests properly use DI pattern
   - Fix any hidden dependencies on workarounds
   - Update expected values to match standardized formatting
   - Add specific tests for newline handling edge cases

**Exit Criteria:**
- Complete removal of regex workarounds from `api/index.ts`
- All tests pass with standardized DI approach and formatting
- Centralized syntax examples document all property access and formatting patterns
- Clean API layer with proper handling of all cases

Once you have confirmed all tests pass and the build runs without errors, create a commit for this phase.

## Phase 6: Documentation and Interface Standardization

**Goal:** Provide comprehensive documentation and standardize interfaces for future stability.

**Tasks:**
1. Update developer documentation:
   - Create detailed guide for object property access
   - Document formatting standards and newline handling
   - Add examples for common usage patterns with different data types
   - Document behavior with different data types
   - Update DI-ARCHITECTURE.md with new patterns

2. Standardize interfaces:
   - Review and refine client interfaces for clarity
   - Ensure consistent method naming and behavior
   - Define clear boundaries between services
   - Follow interface-first design principles

3. Add regression test coverage:
   - Create dedicated regression test file
   - Implement boundary condition tests for formatting
   - Add stress tests for complex objects with formatting
   - Test output formatting edge cases
   - Measure and document performance characteristics

4. Standardize error handling:
   - Create consistent error patterns for field access and formatting
   - Implement clear error messages
   - Add error codes for common issues
   - Document error handling best practices

**Exit Criteria:**
- Comprehensive documentation of object property access and formatting
- Clean, standardized interfaces for all resolution services
- Complete regression test coverage for all edge cases
- Consistent error handling for field access and formatting issues

Once you have confirmed all tests pass and the build runs without errors, create a commit for this phase.

## Additional Test Cases Needed

1. **Variable Substitution Context Tests:**
   - Create tests with variables embedded within different text contexts (inline, block)
   - Test variables at beginning, middle, and end of lines
   - Test multiple variables in a single line

2. **Newline Handling Tests:**
   - Test different combinations of newlines in input and expected output
   - Test newline handling in transformation vs standard mode
   - Test newline handling in different node types

3. **Object Property Access with Formatting:**
   - Test object properties accessed within formatted text
   - Test object properties that contain newlines
   - Test nested objects with different formatting contexts

4. **Mixed Formatting Tests:**
   - Test combination of text formatting and object property access
   - Test complex markdown with embedded variables
   - Test variables within lists, headings, and other markdown structures

## Implementation Notes

1. **DI Compliance:** The implementation must follow the established dependency injection patterns in `docs/dev/DI-ARCHITECTURE.md`, using client factories for handling circular dependencies.

2. **Test Standards:** Tests must follow the standards in `docs/dev/TEST_STANDARDS.md`, including proper async resolution, isolation, and cleanup.

3. **Syntax Centralization:** All examples must be centralized in the `core/syntax` directory following the established pattern in `core/syntax/README.md`.

4. **Formatting Consistency:** Implement a single source of truth for formatting rules to ensure consistency across the codebase.

5. **Performance Considerations:** Field access resolution and formatting operations should maintain or improve performance, with benchmarks before and after implementation.

6. **Interface-First Design:** Follow interface-first design principles, defining clear interfaces before implementation.

7. **Error Handling:** Use specialized MeldError classes (MeldResolutionError, MeldOutputError) with clear error codes and messages.

8. **Backward Compatibility:** Maintain backward compatibility with existing valid variable reference patterns and output formatting.