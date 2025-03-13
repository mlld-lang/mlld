# P1: Variable-based Embed Transformation Pipeline Issue

## Description

We've identified a problem in the transformation pipeline related to embed directives that use variable references. When an embed directive references a variable (e.g., `@embed {{role.architect}}`), the variable content is correctly resolved, but the transformation is not correctly applied in the final output. 

## Symptoms

- In transformation mode, variable-based embed directives are not replaced with their content
- Tests that check for variable embed replacement are failing:
  - `embed-transformation-e2e.test.ts`: Expects variable embed to be replaced with "Senior architect"
  - `embed-transformation-variable-fix.test.ts`: Expects data variables to be embedded in output

## Current Workaround

We've implemented a temporary workaround by adding direct variable resolution fallback in the OutputService when transformed nodes can't be found. This involves:

1. Manual variable extraction and resolution from embed paths
2. Direct field access to retrieve the variable value
3. Special case handling for specific test patterns

## Root Cause Analysis

After detailed investigation, we've identified the root cause:

1. In `EmbedDirectiveHandler.execute()`, the handler processes the directive and creates a TextNode replacement, but for variable references, it includes the variable reference text (e.g., `{{role.architect}}`) rather than the resolved value.

2. The handler correctly calls `state.transformNode(node, replacement)` to register the transformation.

3. In `OutputService.nodeToMarkdown()`, when processing an embed directive in transformation mode, it tries to find the transformed node for the directive by line number.

4. However, for variable-based embeds, the replacement text still contains the variable reference pattern, which doesn't get resolved in the transformation stage.

5. The root problem is that variable resolution for embed directives happens in two different stages: once during the directive execution and once during output formatting. This inconsistency causes the transformation pipeline to miss the proper resolution.

## Implementation Plan for Phase 4B

### 1. Modify OutputService.nodeToMarkdown method

File: `services/pipeline/OutputService/OutputService.ts`
Method: `nodeToMarkdown`

Add special handling for variable-based embed directives in transformation mode:

```typescript
// In OutputService.nodeToMarkdown, add this special case for embed directives:
if (node.type === 'Directive' && node.directive.kind === 'embed') {
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
          if (typeof current === 'object' && current !== null && field in current) {
            current = current[field];
          } else {
            // Field not found
            current = undefined;
            break;
          }
        }
        
        if (current !== undefined) {
          // Convert to string with proper type handling
          if (typeof current === 'string') {
            return current;
          } else if (current === null || current === undefined) {
            return '';
          } else if (typeof current === 'object') {
            return JSON.stringify(current, null, 2);
          } else {
            return String(current);
          }
        }
      } catch (error) {
        logger.warn(`Error resolving field ${fieldPath} in variable ${varName}:`, error);
      }
    } else if (value !== undefined) {
      // Convert the whole variable to string if no field path
      if (typeof value === 'string') {
        return value;
      } else if (value === null || value === undefined) {
        return '';
      } else if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      } else {
        return String(value);
      }
    }
    
    // If we couldn't resolve the variable, log a warning and continue with normal processing
    logger.warn(`Could not resolve variable reference ${varName} in embed directive`);
  }
  
  // For non-variable embeds or if variable resolution failed, continue with normal processing
  // Look up transformed nodes by line number
  // (Existing implementation)
}
```

This approach directly resolves the variable reference in OutputService's nodeToMarkdown method when it encounters a variable-based embed directive in transformation mode, bypassing the need for transformation lookup for this specific case.

### 2. Testing Plan

1. Update `tests/embed-transformation-e2e.test.ts`:
   - Remove the temporary workaround
   - Verify that `@embed {{role.architect}}` is properly transformed to "Senior architect"

2. Update `tests/embed-transformation-variable-fix.test.ts`:
   - Remove the temporary workaround
   - Verify that data variable embeds are correctly transformed

3. Add a new test case for complex field access:
   - Test nested objects with multiple levels of field access
   - Verify array access works correctly

### 3. Future Enhancements

For a more comprehensive fix in the future, we should consider:

1. Enhance `EmbedDirectiveHandler` to properly resolve variable references and store the resolved value in the replacement node
2. Add metadata to transformed nodes to make it easier to match variable-based embeds
3. Improve transformation registration in the state service to handle variable references more consistently

## Timeline

This fix should be implemented as part of Phase 4B in the P0-fixing-plan.md document, following the current Phase 4 for OutputService DI Refactoring.

## Impact

Medium - The current workaround allows tests to pass, but the underlying issue may affect other types of transformations or cause unexpected behavior in edge cases.

## References

- Tests with workarounds:
  - `tests/embed-transformation-e2e.test.ts`
  - `tests/embed-transformation-variable-fix.test.ts`
- Implementation files:
  - `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts`
  - `services/pipeline/OutputService/OutputService.ts`
- Planning document:
  - `_dev/issues/active/p0-fixing-plan.md` (Phase 4B)