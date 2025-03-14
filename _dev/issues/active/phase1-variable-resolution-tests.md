# Phase 1: Comprehensive Test Suite for Variable Resolution and Object Property Access

## Overview

This document summarizes the test suite created for Phase 1 of the p0-fixing-plan.md implementation. The test suite focuses on documenting and analyzing the current behavior of variable resolution, object property access, newline handling, and transformation pipeline issues.

## Test Files Created

1. **object-property-access-comprehensive.test.ts**
   - Tests all object property access patterns
   - Documents current behavior of field access for objects and arrays
   - Covers basic, nested, and complex property access scenarios
   - Includes error handling and edge cases

2. **embed-transformation-variable-comprehensive.test.ts**
   - Tests variable-based embed directive transformation
   - Identifies the exact failure points in the transformation pipeline
   - Covers basic, complex, and edge case scenarios for embed transformations
   - Documents behavior differences across output formats

3. **Standard documentation**
   - Added docs/dev/OBJECT-PROPERTY-ACCESS.md with definitive guide for syntax and behavior

## Key Issues Documented

### 1. Object Property Access Issues

- **Field Extraction**: When accessing object properties like `{{user.name}}`, the entire object is serialized instead of just extracting the requested property.
- **Inconsistent Type Handling**: Different handling for strings, primitives, and objects creates inconsistent output.
- **Formatting Inconsistency**: Arrays and objects are formatted inconsistently based on context and type.

### 2. Newline Handling Issues

- **Newline Normalization**: Inconsistent handling of newlines in different contexts and output formats.
- **Context-Unaware Substitution**: Variable substitution doesn't preserve the surrounding text context and formatting.
- **Transformation Mode Differences**: Different behavior in transformation vs. standard mode.

### 3. Embed Transformation Issues

- **Node Tracking**: Transformation tracking for variable-based embed directives is inconsistent.
- **Variable Field Access**: Field access for object properties within variable-based embed directives fails in some cases.
- **Nested References**: Nested variable references in embed directives show inconsistent behavior.

## Current Behavior Analysis

### Object Property Access

1. **Simple Property Access**: `{{user.name}}` correctly resolves to `Alice` in most cases.
2. **Nested Property Access**: `{{user.contact.email}}` correctly resolves to `alice@example.com`.
3. **Array Access**: `{{fruits.0}}` correctly resolves to the first array element.
4. **Complex Access**: For more complex structures, inconsistent serialization occurs.

### Newline Handling

1. **Single Newlines**: Generally preserved in variable values.
2. **Multiple Newlines**: Inconsistently normalized in transformation mode.
3. **Context-Aware Formatting**: Currently lacking; inline and block contexts handled similarly.

### Embed Transformations

1. **Text Variables**: Simple text variables work correctly in embed directives.
2. **Object Properties**: Accessing properties of objects in embed directives is problematic.
3. **Transformation Tracking**: The transformation pipeline is not consistently tracking node replacements for variable-based embeds.

## Root Causes Identified

1. **VariableReferenceResolver**:
   - The `accessFields` method correctly extracts values, but the output pipeline doesn't use this value properly.
   - Type information is lost during string conversion.

2. **OutputService**:
   - The `convertToString` method forces JSON stringification for objects rather than extracting specific fields.
   - Lacks context awareness for inline vs. block formatting.

3. **StateService**:
   - Transformation tracking doesn't properly handle variable-based replacements in embed directives.

4. **Formatting Pipeline**:
   - Newline handling is inconsistent between standard and transformation modes.
   - No standardized rules for context-aware formatting.

## Recommendations for Phase 2

1. **Enhance VariableReferenceResolver**:
   - Improve context awareness for string conversion
   - Maintain type information throughout the resolution process
   - Add formatting context parameters to control output format

2. **Update OutputService**:
   - Add context-aware formatting for inline vs. block contexts
   - Standardize newline handling across output formats
   - Implement proper field access for object properties

3. **Fix StateService Transformation Tracking**:
   - Ensure variables in embed directives are properly tracked
   - Maintain node identity throughout the transformation pipeline

4. **Create Formatting Standards**:
   - Standardize array formatting in different contexts
   - Define consistent newline handling rules
   - Document formatting expectations with examples

## Next Steps

1. Implement the formatting standards defined in docs/dev/OBJECT-PROPERTY-ACCESS.md
2. Enhance VariableReferenceResolver with context awareness
3. Fix OutputService to properly handle field access
4. Fix transformation tracking for variable-based embed directives

The test suite provides a comprehensive baseline for understanding the current behavior and identifying the specific changes needed in Phase 2.