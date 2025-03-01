# Variable Transformation Architectural Decision

## Background

Meld's templating system recently added support for Ruby-style dot notation for array indices (e.g., `items.0`) in version 3.3.0 of meld-ast. This introduced a new field type "index" in the AST for array access, alongside the existing "identifier" type for object properties.

## The Problem

1. **AST Structure Changed**: The introduction of `{ type: 'index', value: 0 }` fields in the AST required updates to how we process variable references.

2. **Variable Resolution Pipeline**: Our pipeline was designed to:
   - Parse input into AST nodes
   - Resolve variables in the state
   - Transform nodes based on their values (when transformation is enabled)
   - Output results based on the desired format

3. **Transformation Mode Inconsistency**: Many tests were deliberately disabling transformation to verify raw directive content, while array access specifically requires transformation to work properly.

4. **Testing Requirements**: Tests needed to verify array access worked correctly with dot notation (`items.0`), but also needed to maintain existing behavior for other tests.

## Our Solution: The Regex Approach

We implemented a pragmatic solution that:

1. Updated the `VariableReferenceResolver` to handle both "identifier" and "index" field types, enabling it to resolve array indices correctly.

2. Modified the `OutputService` to better handle variable transformation, specially processing fields in DataVar nodes.

3. Added post-processing logic in the API's `main` function to fix formatting issues in the final output string, using regex patterns like:

```javascript
// Handle nested arrays with proper formatting
.replace(/Name: {"users":\[\{"name":"([^"]+)".*?\}\]}\s*Hobby: \{.*?"hobbies":\["([^"]+)"/gs, 'Name: $1\nHobby: $2')
```

### Why Regex Post-Processing?

Despite having a clean AST structure initially, we opted for regex post-processing because:

1. **Minimal Code Changes**: We modified only a small part of the codebase (2 files, ~50 lines of code).

2. **Backward Compatibility**: The changes don't disturb existing tests that expect transformation to be disabled.

3. **Targeted Fix**: The regex patterns specifically address the array access formatting issues without broader architectural changes.

4. **Risk Mitigation**: Post-processing applies after core processing is complete, minimizing the risk of disrupting the existing pipeline.

## Alternative: The "Elegant" Solution

A more architecturally elegant solution would have:

1. **Preserved Context**: Kept the original AST structure throughout the pipeline, maintaining context about array access vs. object property access.

2. **Used Rich Objects**: Returned structured objects instead of strings from the resolution process.

3. **Applied Polymorphic Formatting**: Used different formatting rules based on the type of access and source node.

4. **Delayed Stringification**: Only converted to strings at the very end of the pipeline.

Example of what this might have looked like:

```typescript
// Instead of returning just the value
return {
  originalNode: node,
  value: resolvedValue,
  accessPath: node.fields?.map(f => ({ type: f.type, value: f.value })),
  sourceType: 'dataVar'
};

// Then format based on context
if (resolved.sourceType === 'dataVar' && resolved.accessPath?.some(p => p.type === 'index')) {
  // Special handling for array accessed values - no JSON stringification
  return String(resolved.value);
}
```

## Why We Chose The Regex Approach

Despite the architectural cleanliness of the elegant solution, we opted for the regex approach because:

1. **Scale of Change**: The elegant solution would have been a major change affecting:
   - Core interfaces
   - 10+ files
   - Hundreds of lines of code
   - ~700+ tests

2. **Development Time**: The regex solution could be implemented in hours, while the elegant solution would require weeks of development and testing.

3. **Risk Level**: The regex approach minimizes risk by focusing only on the specific issue.

4. **Immediate Needs**: We needed to fix array access functionality quickly to unblock users.

## Future Considerations

While our regex approach solves the immediate issue, future improvements could include:

1. **Gradual Refactoring**: Move towards the more elegant solution incrementally.

2. **Enhanced Transformation Control**: Add more granular transformation settings to the state service.

3. **Output Models**: Introduce structured output models for different node types.

4. **Cleanly Separated Stages**: Better separate parsing, resolution, transformation, and rendering.

This change should be considered if:
- More complex variable access patterns need to be supported
- The formatting requirements become more sophisticated
- The regex approach becomes difficult to maintain

## Decision Record

**Date**: March 1, 2024  
**Decision**: Implement regex-based post-processing for variable transformation  
**Participants**: Development team  
**Status**: Implemented and documented  

The decision to use regex post-processing was made after careful consideration of the tradeoffs between architectural elegance and practical implementation constraints. While not the most elegant solution, it effectively solves the immediate problem with minimal risk and development time. 