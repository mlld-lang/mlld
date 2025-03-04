# Issue: Embed Directive Shows Placeholder Instead of Content

## Description

The `@embed` directive currently shows a placeholder `[directive output placeholder]` in the output instead of the actual content of the embedded file. This happens even in transformation mode, where the `@run` directive correctly shows the actual output.

## Current Behavior

When using the `@embed` directive, the output shows `[directive output placeholder]` instead of the actual content of the embedded file. This happens in both normal mode and transformation mode.

```meld
@embed [$./docs/UX.md]
```

Output:
```
[directive output placeholder]
```

In contrast, the `@run` directive correctly shows the actual output in transformation mode:

```meld
@run [echo "Hello, world!"]
```

Output in transformation mode:
```
Hello, world!
```

## Root Cause

The issue is in the `OutputService.ts` file, where the `nodeToMarkdown` method handles the `@embed` directive differently from the `@run` directive. For the `@embed` directive, it always returns a placeholder:

```typescript
// Handle other execution directives
if (['embed'].includes(kind)) {
  return '[directive output placeholder]\n';
}
```

For the `@run` directive, it checks if transformation mode is enabled and returns the actual output if it is:

```typescript
// Handle run directives
if (kind === 'run') {
  // In non-transformation mode, return placeholder
  if (!state.isTransformationEnabled()) {
    return '[run directive output placeholder]\n';
  }
  // In transformation mode, return the command output
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
  return '[run directive output placeholder]\n';
}
```

## Proposed Solution

The `OutputService.ts` file should be updated to handle the `@embed` directive in the same way as the `@run` directive, checking if transformation mode is enabled and returning the actual content if it is.

```typescript
// Handle other execution directives
if (['embed'].includes(kind)) {
  // In non-transformation mode, return placeholder
  if (!state.isTransformationEnabled()) {
    return '[directive output placeholder]\n';
  }
  // In transformation mode, return the actual content
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

## Benefits

- Consistent behavior between `@run` and `@embed` directives
- Ability to see the actual content of embedded files in transformation mode
- Better debugging experience when working with embedded files

## Related Issues

- This issue is related to the previously documented issue about the `@embed` directive treating files as strings instead of Meld code.
- It's also related to the source map enhancements for imported content. 