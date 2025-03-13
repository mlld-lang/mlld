# VariableReferenceResolver Current Behavior

## Overview
The `VariableReferenceResolver` is responsible for resolving variable references in Meld content, specifically handling the `{{var}}` syntax. This document describes its current behavior and expected functionality.

## Constructor Dependencies
The resolver accepts three dependencies:
1. `stateService: IStateService` - Required for variable lookup
2. `resolutionService?: IResolutionService` - Optional for resolving nested variables
3. `parserService?: IParserService` - Used for parsing content to extract variable references

## Fallback Mechanisms
The resolver employs these fallback strategies:
1. Direct service use → client service access → error
2. Parser success → regex-based parsing
3. Variable lookups: text → data → path → empty/error

## Error Handling
- In strict mode: throws detailed errors with appropriate codes
- In non-strict mode: returns empty string for resolution failures
- Error codes used:
  - `VARIABLE_NOT_FOUND` - Variable doesn't exist
  - `FIELD_NOT_FOUND` - Field doesn't exist in the variable
  - `INVALID_ACCESS` - Invalid access pattern (e.g., accessing fields in a primitive)
  - `FIELD_ACCESS_ERROR` - General field access issues

## Field Access
- Supports dot notation for nested object access (`data.user.name`)
- Supports numeric indices for array access (`data.items.0`)
- Supports variable interpolation in field names (`data.{{fieldName}}`)

## Variable References Processing
1. Extract all variable references using AST parsing
2. If AST parsing fails, fall back to regex-based extraction
3. Resolve each variable reference by getting its value
4. Handle field access by traversing the object/array structure
5. Convert final values to strings

## Edge Cases
- Circular references detected through resolutionService
- Multiple parser fallback strategies ensure robustness
- Dynamic field access through variable references in field names
- Complex data structures with nested arrays and objects
- Array index bounds checking to prevent out-of-bounds access

## Runtime vs TypeScript Issues
- Code historically had TypeScript errors but functionally worked
- AST node type definitions didn't match runtime structure
- Error codes used didn't all exist in the type definitions
- Constructor parameter mismatch between implementation and tests

## Factory Pattern
The resolver can be created directly or through a factory:
```typescript
// Direct creation
const resolver = new VariableReferenceResolver(stateService, resolutionService, parserService);

// Factory creation
const resolver = variableResolverFactory.createResolver(stateService, resolutionService, parserService);
```

The factory pattern is preferred as it:
1. Ensures proper dependency injection
2. Can provide defaults for optional dependencies
3. Helps avoid circular dependencies
4. Makes testing easier with consistent instantiation