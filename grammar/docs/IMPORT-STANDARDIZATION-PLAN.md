# Import Directive Standardization Plan

## Current Import Syntax

The current import directive supports multiple formats:

```
import [path/to/file]             // Import all (*) with bracketed path
import $pathVariable              // Import all (*) with variable path
import [var1, var2] from [path]   // Import specific vars with bracketed paths
```

## New Standardized Syntax

We will update the import directive to use a more familiar JS-like syntax:

```
@import { * } from "path/to/file"         // Import all
@import { var1, var2 } from "path/to/file" // Import specific vars
@import { var1 as alias } from "$pathVar"  // Import with alias and path variable
```

## Implementation Strategy

1. **Update Grammar**:
   - Create a new `StandardImportDirective` rule in import.peggy
   - Support curly braces `{}` for import lists instead of brackets `[]`
   - Use quotes for paths instead of brackets
   - Handle both string literals and variables for paths

2. **Update AST Structure**:
   - Maintain the current structure with values, raw, and meta objects
   - Keep path metadata in the nested structure

3. **Backward Compatibility**:
   - Keep the existing import rules for backward compatibility 
   - Support transition strategy for deprecating old syntax
   - Add appropriate log warnings for deprecated syntax

4. **Testing Strategy**:
   - Create tests for the new standardized syntax
   - Ensure backward compatibility still works
   - Test variable interpolation in the new syntax

## Type Definitions Update

No changes needed to the type definitions, as the logical structure (subtypes of importAll and importSelected) remains valid.

## Documentation

Update the import directive documentation to:
1. Feature the new syntax as the primary recommended approach
2. Explain the security model around path variables
3. Document the alias functionality

## Implementation Plan

1. Add new standardized syntax rules to import.peggy
2. Add appropriate helper functions if needed
3. Create tests for the new syntax
4. Update documentation
5. Ensure backward compatibility through the transition period