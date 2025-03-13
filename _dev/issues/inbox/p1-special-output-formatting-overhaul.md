# Comprehensive Output Formatting and Variable Substitution Overhaul

## Related Issues

This issue encompasses several related issues in the codebase:

1. **Newline Handling and Variable Formatting** - `_dev/issues/inbox/newline-variable-issues.md`
2. **LLMXML Library Workarounds** - `_dev/issues/inbox/p2-special-resolution-llmxml-workarounds.md`
3. **Object Property Handling** - `_dev/issues/inbox/p0-special-api-object-property.md`

## Issue Overview

A review of the codebase has revealed inconsistent handling of formatting throughout the output pipeline, particularly around:

1. **Newline Handling**: Inconsistent approach to newlines between markdown nodes
2. **Variable Substitution**: Formatting issues when variables are replaced in output
3. **Object Serialization**: Problems with complex object property access in output
4. **Markdown Processing**: Workarounds for LLMXML library limitations
5. **Output Format Differences**: Inconsistencies between XML and Markdown output

Instead of addressing these issues individually with targeted fixes, we should conduct a comprehensive review of the output formatting system and implement a consistent, robust approach across the codebase.

## Symptoms

The issues manifest in various ways:

1. **Broken Formatting**: Variable substitution breaks line formatting, especially with complex objects
   ```
   Expected: The greeting is: Hello, World!
   Actual: The greeting is: 
           Hello, World!
   ```

2. **Test Workarounds**: Multiple regex-based workarounds in tests to fix output formatting:
   ```typescript
   // Special handling for object properties in test cases
   converted = converted.replace(/User: {\s*"name": "([^"]+)",\s*"age": (\d+)\s*}, Age: {\s*"name": "[^"]+",\s*"age": (\d+)\s*}/g, 'User: $1, Age: $3')
   ```

3. **Hardcoded Test Values**: Some tests contain hardcoded replacements rather than testing real behavior:
   ```typescript
   .replace(/Name: (.*?)\s+Hobby: ([^,\n]+).*$/s, 'Name: Alice\nHobby: reading')
   ```

4. **Library Limitations**: Manual fallbacks for the LLMXML library:
   ```typescript
   // This is a workaround for limitations in the llmxml library
   // TODO: Remove once llmxml reliability is improved
   ```

5. **Failing Tests**: Tests that pass only because of workarounds rather than correct functionality

## Root Causes

The underlying issues appear to stem from:

1. **Lack of Standardization**: Inconsistent newline handling conventions across the codebase
2. **Variable Replacement Logic**: The substitution mechanism doesn't preserve context
3. **Output Format Differences**: Different handling for markdown vs. XML output
4. **Library Limitations**: External dependencies with limitations and workarounds
5. **Complex Object Handling**: Issues with serializing and formatting complex data structures

## Proposed Solution

Rather than addressing each issue in isolation, a comprehensive solution should:

1. **Define Standard Formatting Rules**: Establish clear conventions for newlines, whitespace, and text formatting
2. **Refactor Variable Substitution**: Redesign the substitution system to preserve context and formatting
3. **Implement Unified Output Pipeline**: Create consistent processing for all output formats
4. **Address Library Limitations**: Either improve the LLMXML library or replace workarounds with better solutions
5. **Enhance Object Serialization**: Implement proper formatting for complex objects and arrays

## Implementation Plan

1. **Audit Phase (3-4 days)**:
   - Catalog all formatting issues across the codebase
   - Identify all workarounds and special handling
   - Document the expected behavior for each case

2. **Design Phase (2-3 days)**:
   - Define a consistent formatting model
   - Design improved variable substitution mechanism
   - Create specifications for object serialization

3. **Implementation Phase (7-10 days)**:
   - Refactor the OutputService formatting logic
   - Enhance variable resolution with context preservation
   - Improve LLMXML integration or implement alternatives
   - Develop proper object/array formatting

4. **Testing Phase (3-5 days)**:
   - Create comprehensive test suite for formatting
   - Update existing tests to remove workarounds
   - Verify expected behavior across output formats

5. **Documentation Phase (1-2 days)**:
   - Document the formatting conventions
   - Update user documentation with formatting examples
   - Add developer notes for future maintenance

## Impact

This overhaul will:

1. **Eliminate Workarounds**: Remove multiple special handling cases
2. **Improve Reliability**: Make tests validate actual behavior
3. **Enhance User Experience**: Provide consistent, well-formatted output
4. **Reduce Technical Debt**: Consolidate fragmented approaches to formatting
5. **Enable Future Features**: Create a solid foundation for new output formats

## Estimated Effort

**Total**: 16-24 days (3-5 weeks)

This comprehensive approach would address multiple issues at once and create a more robust architecture for output handling, saving time in the long run compared to addressing each issue individually. 