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

The issue appears to be in how transformations for variable-based embeds are tracked and retrieved:

1. When the EmbedDirectiveHandler processes a variable reference, it resolves the variable correctly
2. It registers a transformation with `newState.transformNode(node, replacement)`
3. But later in the pipeline, OutputService can't find the transformed node when looking for the embed replacement

This suggests a potential issue in one of these areas:
- Transformation registration: Transformations might not be properly stored
- Transformation retrieval: Transformations might be stored but not found when needed
- State propagation: The state carrying transformations might not be correctly passed through the pipeline

## Related Components

- `EmbedDirectiveHandler`: Responsible for resolving variable references and registering transformations
- `OutputService`: Responsible for retrieving transformed nodes and applying them in the output
- `StateService`: Manages the state that tracks transformations

## Next Steps

1. Investigate the transformation tracking system in depth:
   - How transformations are registered and stored
   - How they're retrieved during output generation
   - How state is propagated through the pipeline

2. Determine if this is part of a broader issue with the transformation system or specific to variable-based embeds

3. Develop a proper fix that addresses the architectural issue rather than relying on special case handling

## Impact

Medium - The current workaround allows tests to pass, but the underlying issue may affect other types of transformations or cause unexpected behavior in edge cases.