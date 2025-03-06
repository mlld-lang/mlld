# Embed Directive Transformation Fix

## Issue

The `EmbedDirectiveHandler` was not properly registering transformations in transformation mode, unlike the `RunDirectiveHandler`. This caused embed directives to always show as placeholders in the output, even when transformation mode was enabled.

## Root Cause

The `EmbedDirectiveHandler.execute()` method was returning a replacement node, but it wasn't calling `transformNode()` to register the transformation in the state service. The `RunDirectiveHandler` correctly calls `transformNode()` before returning, which is why run directives were working properly.

## Fix

1. Updated the `EmbedDirectiveHandler` to call `transformNode()` when in transformation mode:
   ```typescript
   // In transformation mode, register the replacement
   if (newState.isTransformationEnabled()) {
     newState.transformNode(node, replacement);
   }
   ```

2. Updated the `OutputService` to handle embed directives in transformation mode the same way as run directives:
   ```typescript
   // Handle other execution directives
   if (['embed'].includes(kind)) {
     // In non-transformation mode, return placeholder
     if (!state.isTransformationEnabled()) {
       return '[directive output placeholder]\n';
     }
     // In transformation mode, return the embedded content
     const transformedNodes = state.getTransformedNodes();
     if (transformedNodes) {
       const transformed = transformedNodes.find(n => 
         n.location?.start.line === node.location?.start.line
       );
       if (transformed && transformed.type === 'Text') {
         const content = (transformed as TextNode).content;
         return content.endsWith('\n') ? content : content + '\n';
       }
     }
     // If no transformed node found, return placeholder
     return '[directive output placeholder]\n';
   }
   ```

3. Added end-to-end tests to verify that embed directives are properly transformed:
   - Test for file embeds
   - Test for section embeds
   - Test for variable embeds

## Verification

The fix was verified using both unit tests and end-to-end tests:

1. Created a new test file `tests/embed-transformation-e2e.test.ts` that verifies all three types of embed directives are properly transformed.
2. Created a test script that demonstrates the fix works for both file and variable embeds.

## Future Work

This fix addresses the immediate issue with embed directives in transformation mode, but there's a larger architectural issue with the `@embed` directive handling three different use cases (file embeds, variable embeds, and template embeds). The proposal in `_issues/features/subdivide-embed-types.md` outlines a more comprehensive solution that would separate these concerns into distinct handlers. 