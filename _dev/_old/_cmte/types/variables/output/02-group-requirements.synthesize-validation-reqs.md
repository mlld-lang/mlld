# Variable Validation Requirements for Meld

Based on the feedback from the VariableHandler, StateManagement, and ParserCore components, I've synthesized the following validation requirements for variable definitions and usage in the Meld system.

## Static Validation (Compile-Time)

### Identifier Validation
- **Requirement 1**: Variable identifiers must follow a consistent naming convention (alphanumeric, underscores, no spaces).
- **Requirement 2**: Reserved keywords cannot be used as variable identifiers.
- **Requirement 3**: Variable names should be case-sensitive and unique within their scope.

### Type Validation
- **Requirement 4**: Variable definitions must use a recognized type ('text', 'path', 'data', 'command').
- **Requirement 5**: Variable type must be explicitly specified in definitions and cannot change after initialization.
- **Requirement 6**: Type-specific syntax validation for each variable type (e.g., path format for path variables).

### Structure Validation
- **Requirement 7**: Field access expressions must use proper dot notation (e.g., `data.field.subfield`).
- **Requirement 8**: Field identifiers must follow valid property naming conventions.
- **Requirement 9**: Array indexing must use valid numeric indices.

## Runtime Validation

### Existence Validation
- **Requirement 10**: Variable references must check for existence before access, with behavior determined by `strict` mode.
- **Requirement 11**: In strict mode, missing variables should throw errors; in non-strict mode, they should return undefined.
- **Requirement 12**: Variable deletion should verify the variable exists before attempting removal.

### Type Compatibility
- **Requirement 13**: Type checking when accessing variables to ensure they match expected types.
- **Requirement 14**: Data variable field access should validate that the parent is an object or array.
- **Requirement 15**: Type coercion rules should be clearly defined for cross-type operations.

### Path Validation
- **Requirement 16**: Path variables must resolve to valid file system paths or URLs.
- **Requirement 17**: Path variables should be validated against allowed path patterns.
- **Requirement 18**: Path variables should detect and prevent directory traversal attacks.

### Circular Reference Detection
- **Requirement 19**: Track variable resolution depth to detect circular references.
- **Requirement 20**: Implement a maximum resolution depth (e.g., 10 levels) to prevent infinite loops.
- **Requirement 21**: Maintain a set of visited variables during resolution to detect cycles.

### Data Structure Validation
- **Requirement 22**: Data variables should validate against allowed data structures (primitive, object, array).
- **Requirement 23**: Deep validation of nested data structures to ensure they contain only allowed types.
- **Requirement 24**: Size limits for data variables to prevent memory issues.

## Context-Aware Validation

### Resolution Context
- **Requirement 25**: Validate variable references against allowed variable types in the resolution context.
- **Requirement 26**: Respect context-specific constraints (e.g., block vs. inline context).
- **Requirement 27**: Validate transformation options based on variable type and context.

### State Management
- **Requirement 28**: Validate immutability constraints when attempting to modify variables.
- **Requirement 29**: Ensure proper variable copying between parent and child states.
- **Requirement 30**: Validate variable updates against defined update contexts.

## Error Handling and Reporting

- **Requirement 31**: Provide detailed error messages for validation failures, including source location.
- **Requirement 32**: Standardize error reporting format across all validation checks.
- **Requirement 33**: Include context information in validation errors (file, line, column, variable name).

## Implementation Considerations

- **Requirement 34**: Use discriminated unions for variable types to enable exhaustive type checking.
- **Requirement 35**: Implement type guards for runtime type checking of variable values.
- **Requirement 36**: Centralize validation logic to ensure consistent behavior across components.
- **Requirement 37**: Provide validation utilities that can be reused across the codebase.

These requirements provide a comprehensive framework for ensuring variable definitions and usage are properly validated throughout the Meld system, reducing runtime errors and improving code safety and maintainability.