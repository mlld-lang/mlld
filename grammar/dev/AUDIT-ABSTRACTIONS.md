# Grammar Abstractions Audit

This document contains the results of our grammar abstractions audit, focusing on identifying patterns for consolidation, unused abstractions, and recommendations for improvements.

## Current Architecture Overview

The Meld grammar system uses a layered approach to abstractions:

1. **Core Helpers and Types** (`grammar-core.ts`): Provides fundamental types and helper functions
2. **Lexer Abstractions** (`lexer/*.peggy`): Mid-level abstractions for parsing different content types
3. **Directive Implementations** (`directives/*.peggy`): Top-level directive-specific grammar rules

The abstractions are organized in a hierarchical structure, with `wrapped-content.peggy` providing the most comprehensive shared abstractions across directives.

## Findings

### 2. Wrapped Content Abstractions

The `wrapped-content.peggy` file contains well-structured abstractions for different content types:

- **WrappedPathContent**: Used by path, import, exec, add directives
- **WrappedTemplateContent**: Used by text, add directives
- **WrappedCommandContent**: Used by run, exec directives
- **WrappedCodeContent**: Used by run, exec directives

These abstractions successfully handle different interpolation contexts and delimiters, promoting consistent handling across directives.

### 3. Redundancy and Duplication

- **Template Content Handling**: Both `text.peggy` and `wrapped-content.peggy` define rules for template content.
  - `TemplatePlainContent` in text.peggy duplicates functionality in `WrappedTemplateContent`
  - `DoubleBracketContent` in wrapped-content.peggy has similar functionality as `TemplatePlainContent`

- **Debug Statements**: Extensive debug statements are scattered throughout the codebase without a consistent approach.
  - Some use conditional logging with helpers.debug()
  - Others use inline debug predicates with `&{ helpers.debug(); return true; }`

- **Variable Access Patterns**: The `variable-access.peggy` file defines variable reference patterns, but similar patterns are duplicated in multiple directives.

### 4. Context Detection

- The `context-detection.peggy` file provides rules for @ symbol disambiguation, but its integration with other parts of the grammar is not consistently applied.
- The context detection appears to be experimental or in transition, as it's not fully utilized across all directives.

### 5. Inconsistent Use of Abstractions

- Some directives use the wrapped content abstractions directly, while others reimplement similar functionality.
- Some directives implement their own versions of content parsing rather than leveraging existing abstractions.

## Recommendations

### 1. Directory Structure Simplification -- done

### 2. Abstraction Consolidation

- **Consolidate Template Content Handling**: 
  - Standardize on a single approach for template content handling (recommended: use `wrapped-content.peggy` abstractions)
  - Remove `TemplatePlainContent` from `text.peggy` and consistently use `WrappedTemplateContent`
  - Ensure all directives that handle template content use the same abstraction

- **Establish a Pattern for Extension**:
  - Create a clear pattern for directive-specific extensions to general abstractions
  - Define a standard approach for directive-specific rules that build on shared abstractions

### 3. Debug and Logging Standardization

- **Create a Consistent Debug Framework**:
  - Replace scattered debug statements with a structured approach
  - Define clear categories for debug messages (e.g., parsing, validation, node creation)
  - Only use helpers.debug() for debugging, not inline predicates

### 4. Context Detection Integration

- **Fully Integrate Context Detection**:
  - Ensure all directives properly utilize the context detection rules
  - Document the context detection system and its purpose
  - Or consider removing it if it's not providing clear value

### 5. Variable Access Standardization

- **Standardize Variable Access Patterns**:
  - Ensure all directives use `variable-access.peggy` for variable reference handling
  - Create clear guidelines for when to use @var vs {{var}} syntax
  - Document the variable access patterns in `variable-access.peggy`

### 6. Documentation Improvements

- **Document Abstraction Hierarchy**:
  - Create a comprehensive diagram of the abstraction hierarchy
  - Document the relationship between different abstractions
  - Provide usage examples for common patterns

### 7. New Abstraction Opportunities

- **Content Type Handling**:
  - Create a consistent set of content type handlers for common scenarios
  - Define interfaces for content handling in different contexts (path, command, template)
  - Consolidate redundant content handling logic across directives

- **Error Handling and Reporting**:
  - Implement consistent error reporting abstractions
  - Define common error patterns and recovery strategies
  - Create useful error messages with context information

## Implementation Priority

1. Consolidate Template Content Handling - Highest priority since we've already identified issues
2. Directory Structure Simplification - Relatively easy win for maintainability
3. Debug and Logging Standardization - Will help future development and debugging
4. Variable Access Standardization - Important for consistency across directives
5. Context Detection Integration - Requires deeper analysis of its value
6. Documentation Improvements - Supports all other improvements
7. New Abstraction Opportunities - Longer-term improvement
