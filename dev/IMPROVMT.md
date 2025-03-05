# Improvement Opportunities

## Directive Validators and Handlers Consistency

After analyzing the code for directive validators and handlers, we've identified several areas of inconsistency in how they interact with AST node properties. Addressing these issues would improve code maintainability and reduce potential bugs.

### Current Inconsistencies

1. **Inconsistent Type Casting Approaches**
   - Some validators and handlers explicitly cast to specific interfaces:
     - `DataDirectiveValidator`: `const directive = node.directive as DataDirectiveData`
     - `PathDirectiveValidator`: `const directive = node.directive as PathDirectiveData`
   - Others access properties directly without explicit casting
   - **Recommendation**: Standardize on a consistent approach to type casting directives, preferably with explicit typing

2. **Field Name Variations**
   - Some handlers have special cases for handling both legacy and current property names:
     - Path directive validator: `const identifier = directive.identifier || (directive as any).id;`
   - **Recommendation**: Either standardize on one property name convention or create utility functions to handle the normalization

3. **Inconsistent Property Validation Strictness**
   - Some validators perform extensive validation:
     - `TextDirectiveValidator`: performs character-by-character checks for identifiers
     - `DefineDirectiveValidator`: has special logic for handling compound names with dots
   - Others are less thorough
   - **Recommendation**: Define minimum validation requirements for each property type and ensure all validators adhere to them

4. **Duplicated Helper Function Implementation**
   - Different validators implement similar validation functions (like `isValidIdentifier()`) in their own scopes
   - May lead to inconsistent validation logic across directives
   - **Recommendation**: Extract common validation functions to a shared utility module

5. **Multiple Definitions of Common Interfaces**
   - Multiple different definitions of `StructuredPath` interface exist in different files
   - **Recommendation**: Create a single definitive interface in a shared location

### Improvement Actions

1. **Create a Validation Utilities Module**
   - Implement shared validation functions for:
     - Identifier validation
     - Path validation
     - Source validation
     - Value type checking

2. **Standardize Directive Type Handling**
   - Create a single set of directive type interfaces
   - Implement a consistent pattern for type guarding/casting

3. **Property Name Normalization**
   - Create normalizer helpers for backward compatibility
   - Document which property names are canonical vs. legacy

4. **Validation Requirements Documentation**
   - Define and document the validation requirements for each directive type
   - Implement test cases that verify all validators meet these requirements

5. **Interface Consolidation**
   - Identify all duplicated interface definitions
   - Consolidate into a single shared location
   - Update imports across the codebase

By addressing these inconsistencies, we can improve the maintainability and reliability of the directive validation and handling system. 