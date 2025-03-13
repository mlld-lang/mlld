# Phase 4B Implementation Plan: Variable-based Embed Transformation Fix

## Issue Summary

We've identified an issue with variable-based embed directives in transformation mode. When an `@embed` directive uses a variable reference with field access (e.g., `@embed {{role.architect}}`), the transformation pipeline doesn't properly replace the directive with the resolved value. Instead, it keeps the variable reference text in the output.

## Root Cause

Through detailed investigation, we've determined the root cause:

1. In `EmbedDirectiveHandler.execute()`, the handler processes the directive and creates a `TextNode` replacement, but for variable references, it includes the variable reference text (e.g., `{{role.architect}}`) rather than the resolved value.

2. The handler correctly calls `state.transformNode(node, replacement)` to register the transformation.

3. In `OutputService.nodeToMarkdown()`, when processing an embed directive in transformation mode, it tries to find the transformed node for the directive by line number.

4. However, for variable-based embeds, the replacement text still contains the variable reference pattern, which doesn't get resolved in the transformation stage.

5. The root problem is that variable resolution for embed directives happens in two different stages: once during the directive execution and once during output formatting. This inconsistency causes the transformation pipeline to miss the proper resolution.

## Implementation Plan

### 1. Enhance OutputService.nodeToMarkdown Method

File: `services/pipeline/OutputService/OutputService.ts`
Method: `nodeToMarkdown`

Add special handling for variable-based embed directives in transformation mode:

```typescript
// In the nodeToMarkdown method, within the case 'Directive':
if (node.directive.kind === 'embed') {
  // Special handling for variable-based embed directives in transformation mode
  if (node.directive.path && 
      typeof node.directive.path === 'object' && 
      node.directive.path.isVariableReference === true &&
      state.isTransformationEnabled()) {
    
    // Extract variable name
    const varName = node.directive.path.identifier;
    
    // Extract field path if present
    let fieldPath = '';
    if (node.directive.path.fields && Array.isArray(node.directive.path.fields)) {
      fieldPath = node.directive.path.fields
        .map(field => {
          if (field.type === 'field') {
            return field.value;
          } else if (field.type === 'index') {
            return field.value;
          }
          return '';
        })
        .filter(Boolean)
        .join('.');
    }
    
    // Resolve the variable value
    let value;
    
    // Try data variable first
    value = state.getDataVar(varName);
    
    // If not found as data variable, try text variable
    if (value === undefined) {
      value = state.getTextVar(varName);
    }
    
    // If not found as text variable, try path variable
    if (value === undefined && state.getPathVar) {
      value = state.getPathVar(varName);
    }
    
    // Process field access if needed
    if (value !== undefined && fieldPath) {
      try {
        const fields = fieldPath.split('.');
        let current = value;
        
        for (const field of fields) {
          // Handle array indices
          if (/^\d+$/.test(field) && Array.isArray(current)) {
            const index = parseInt(field, 10);
            if (index >= 0 && index < current.length) {
              current = current[index];
            } else {
              // Array index out of bounds
              logger.warn('Array index out of bounds', { index, array: current });
              return '';
            }
          } 
          // Handle object properties
          else if (typeof current === 'object' && current !== null) {
            if (field in current) {
              current = current[field];
            } else {
              // Field not found
              logger.warn('Field not found in object', { field, object: current });
              return '';
            }
          } 
          // Cannot access properties on non-objects
          else {
            logger.warn('Cannot access field on non-object', { field, value: current });
            return '';
          }
        }
        
        // Convert to string with proper type handling
        if (current === undefined || current === null) {
          return '';
        } else if (typeof current === 'string') {
          return current;
        } else if (typeof current === 'number' || typeof current === 'boolean') {
          return String(current);
        } else if (typeof current === 'object') {
          try {
            return JSON.stringify(current, null, 2);
          } catch (error) {
            logger.error('Error stringifying object', { error });
            return '[Object]';
          }
        } else {
          return String(current);
        }
      } catch (error) {
        logger.warn(`Error resolving field ${fieldPath} in variable ${varName}:`, error);
      }
    } else if (value !== undefined) {
      // Convert the whole variable to string if no field path
      if (value === undefined || value === null) {
        return '';
      } else if (typeof value === 'string') {
        return value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      } else if (typeof value === 'object') {
        try {
          return JSON.stringify(value, null, 2);
        } catch (error) {
          logger.error('Error stringifying object', { error });
          return '[Object]';
        }
      } else {
        return String(value);
      }
    }
    
    // If we couldn't resolve the variable, log a warning and continue with normal processing
    logger.warn(`Could not resolve variable reference ${varName} in embed directive`);
  }
  
  // For non-variable embeds or if variable resolution failed, continue with normal processing
  // Existing code for finding transformed nodes by line number...
}
```

### 2. Remove Temporary Workarounds

Update the following test files to remove the temporary workarounds:

1. `tests/embed-transformation-e2e.test.ts`:
   - Remove the mock result and commented-out test
   - Restore the test to properly verify that `@embed {{role.architect}}` is transformed to "Senior architect"

2. `tests/embed-transformation-variable-fix.test.ts`:
   - Remove the mock result and commented-out test
   - Restore the test to verify that data variable embeds are correctly transformed

### 3. Add Comprehensive Test Coverage

Create a new test file `tests/variable-embed-transform.test.ts` to test all variable embed cases:

- Simple field access: `@embed {{user.name}}`
- Nested objects: `@embed {{user.info.contact.email}}`
- Array access: `@embed {{user.roles.0}}`
- Mixed access: `@embed {{user.projects.0.name}}`
- Error cases:
  - Non-existent variable
  - Non-existent field
  - Invalid array index
  - Accessing field on a primitive value

## Future Improvements

This implementation addresses the immediate issue, but there are future improvements to consider:

1. Enhance `EmbedDirectiveHandler.execute()` to resolve variable references and store the resolved value in the replacement node, rather than keeping the variable reference text.

2. Add metadata to transformed nodes to make them easier to match later in the pipeline.

3. Create a more generalized system for tracking transformations that doesn't rely solely on line numbers.

4. Consider adding dedicated methods for resolving variable references with field access to avoid code duplication between different parts of the pipeline.

## Timeline

This fix will be implemented as part of Phase 4B in the P0-fixing-plan, following the current Phase 4 for OutputService DI Refactoring.

## References

- Issue documentation: `_dev/issues/inbox/p1-variable-embed-transformation-issue.md`
- Implementation approach: `tests/embed-variable-transform-fix.test.ts`
- Tests with workarounds:
  - `tests/embed-transformation-e2e.test.ts`
  - `tests/embed-transformation-variable-fix.test.ts`