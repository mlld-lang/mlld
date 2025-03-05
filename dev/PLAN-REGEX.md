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