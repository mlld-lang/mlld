# Meld Grammar Types Audit Summary

This document summarizes the results of the grammar types audit, examining the type definitions and their alignment with the actual grammar implementation.

## Audit Process

We performed a comprehensive audit of the Meld grammar's type system by:
1. Examining each directive's grammar implementation in `/grammar/directives/*.peggy`
2. Comparing the implementation with corresponding type definitions in `/grammar/types/*.ts`
3. Analyzing the core type definitions in `/core/syntax/types/`
4. Documenting misalignments, gaps, and opportunities for improvement
5. Providing specific recommendations for type system enhancements

## Common Issues

Our audit identified several recurring issues across multiple directives:

### 1. Source Attribute Inconsistencies

**Problem**: All directive implementations set a `source` parameter in `createStructuredDirective`, but this attribute is not consistently typed or documented in the type definitions.

**Impact**: Type definitions don't fully represent the actual AST structure, making it harder to work with and validate the AST in a type-safe manner.

**Recommendation**: 
- Add explicit typing for source attributes in each directive's type definition
- Create directive-specific source type enums or union types
- Document the purpose and valid values for source attributes

### 2. Subtype Inconsistencies

**Problem**: Several directives have mismatches between the subtypes used in the implementation and those defined in the core DirectiveSubtype type.

**Impact**: Can lead to type errors or runtime issues when the core system attempts to validate subtypes that don't match the implementation.

**Recommendation**:
- Align subtype definitions in `/core/syntax/types/directives.ts` with the actual implementation
- Review all directive implementations to ensure consistent subtype naming
- Add proper JSDoc documentation for each subtype

### 3. Metadata Structure Differences

**Problem**: The metadata objects created during parsing often contain properties not reflected in the corresponding metadata type definitions.

**Impact**: The type system doesn't properly constrain or document the actual metadata available at runtime.

**Recommendation**:
- Update metadata interfaces to include all properties used in implementation
- Create more specific metadata types for each directive variant
- Document the purpose and valid values for each metadata property

### 4. Node Type Imports

**Problem**: Some type definitions still reference older node types or inconsistent imports, particularly around variable references.

**Impact**: Can lead to type errors or incorrect assumptions about node structure.

**Recommendation**:
- Standardize node type imports across all type definitions
- Ensure consistent use of VariableReferenceNode instead of legacy types
- Update array type definitions to match the actual node arrays created

### 5. RHS Context Handling

**Problem**: Several directives have special handling for "right-hand side" (RHS) contexts when embedded in other directives, but this isn't consistently typed.

**Impact**: The RHS variants may have additional metadata or structural differences not captured by the type system.

**Recommendation**:
- Create specific types for RHS variants of directives
- Add `isRHSRef` to metadata interfaces where applicable
- Add type guards for detecting RHS references

## Directive-Specific Findings

### Text Directive

The text directive showed several misalignments:
- Raw structure in TextRaw doesn't match implementation (`identifier` vs `variable`)
- Source types in implementation ('template', 'directive', etc.) aren't documented
- Basic TextMeta doesn't include the rich metadata used in implementation

[Detailed findings in TEXT-TYPES-AUDIT.md](./TEXT-TYPES-AUDIT.md)

### Run Directive

The run directive had issues with:
- Subtype inconsistencies with core types ('runExec' vs 'runDefined')
- Arguments typing doesn't match implementation (not only variable nodes)
- Missing RHS context metadata typing

[Detailed findings in RUN-TYPES-AUDIT.md](./RUN-TYPES-AUDIT.md)

### Import Directive

The import directive had issues with:
- Variable reference node structure lacking alias support
- Path metadata missing important properties like `isAbsolute`
- No source attribute typing

[Detailed findings in IMPORT-TYPES-AUDIT.md](./IMPORT-TYPES-AUDIT.md)

### Add Directive

The add directive had the most comprehensive types but still showed issues:
- No source attribute typing
- Header level type mismatch (number vs array of nodes)
- Variable node vs variable reference node inconsistency
- Missing RHS context typing

[Detailed findings in ADD-TYPES-AUDIT.md](./ADD-TYPES-AUDIT.md)

## Recommendations for Type System Improvements

Based on our detailed audits, we recommend the following improvements to the Meld grammar type system:

### 1. Standardize Core Types

- Update `DirectiveSubtype` in core types to match implementation
- Ensure consistent directive kind naming ('add' vs 'embed')
- Create a standard pattern for source attributes

### 2. Enhance Metadata Types

- Create more detailed metadata interfaces for each directive
- Include all properties actually used in implementation
- Add proper JSDoc documentation for metadata properties

### 3. Improve Type Guards

- Add comprehensive type guards for all directive variants
- Include guards for detecting RHS contexts
- Add utility functions for working with complex node structures

### 4. Consolidate Variable Reference Handling

- Ensure consistent use of VariableReferenceNode throughout the system
- Add support for extended properties like aliases where needed
- Deprecate and remove any remaining legacy variable node types

### 5. Standardize Documentation

- Add detailed JSDoc comments for all types
- Document the relationships between different parts of the type system
- Provide examples of correct usage patterns

## Implementation Plan

We recommend implementing these improvements in the following phases:

1. **Phase 1: Core Type Alignment**
   - Update DirectiveSubtype in core types
   - Standardize source attribute handling
   - Fix critical mismatches in basic type structures

2. **Phase 2: Enhanced Metadata Types**
   - Update all metadata interfaces to match implementation
   - Create more specific metadata types for subtypes
   - Add proper documentation

3. **Phase 3: Type Guards and Utilities**
   - Add comprehensive type guards
   - Create utility functions for common operations
   - Improve error detection for type mismatches

4. **Phase 4: Variable Reference Standardization**
   - Consolidate variable reference handling
   - Add support for extended properties
   - Remove legacy types

5. **Phase 5: Documentation and Examples**
   - Add detailed JSDoc comments
   - Create usage examples
   - Add warning comments for common pitfalls

## Conclusion

The Meld grammar type system is generally well-structured but has several areas where implementation and type definitions are not fully aligned. Addressing these issues will improve type safety, documentation, and developer experience when working with the Meld AST.

By implementing the recommended changes, we can create a more consistent, reliable, and self-documenting type system that accurately reflects the actual structure of the parsed AST nodes.