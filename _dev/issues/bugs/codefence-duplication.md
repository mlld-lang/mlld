# Code Fence Duplication Bug

## Overview

When outputting content with code fences (triple backticks), the output contained duplicated code fence markers, resulting in incorrect formatting. This particularly affected code blocks which appeared with double fence markers.

## Current Behavior

When a CodeFenceNode is processed by the OutputService, it adds code fence markers (triple backticks) around the content, even though the content itself already includes these markers. This results in output like:

```
```javascript
```javascript
const name = "Claude"
const function = (name) => {
    return `Hello, ${name}!`
}
```
```

This was due to a misunderstanding of how the AST handles CodeFenceNode objects. The content property of a CodeFenceNode already includes the code fence markers, so adding additional markers in the OutputService is incorrect.

## Expected Behavior

The code fence content should be used as-is, without adding additional fence markers. The correct output should be:

```javascript
const name = "Claude"
const function = (name) => {
    return `Hello, ${name}!`
}
```

## Reproduction Steps

1. Create a simple Meld file with a code fence:
```
@text name = "Claude"

```javascript
const name = "{{name}}"
const function = (name) => {
    return `Hello, ${name}!`
}
```
```

2. Process the file with Meld:
```bash
meld example.mld
```

3. Observe the duplicated fence markers in the output file.

## Investigation Notes

The issue was found in multiple places in the `OutputService` class:

1. In the `nodeToMarkdown` method:
```typescript
case 'CodeFence':
  const fence = node as CodeFenceNode;
  return `\`\`\`${fence.language || ''}\n${fence.content}\n\`\`\`\n`;
```

2. In the `codeFenceToMarkdown` method:
```typescript
private codeFenceToMarkdown(node: CodeFenceNode): string {
  return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\`\n`;
}
```

3. In the `nodeToXML` method, which reused `nodeToMarkdown` for CodeFence nodes.

## Fix Implemented

1. Updated the `codeFenceToMarkdown` method to use the content as-is:
```typescript
private codeFenceToMarkdown(node: CodeFenceNode): string {
  // The content already includes the codefence markers, so we use it as-is
  return node.content;
}
```

2. Updated the `nodeToMarkdown` method to handle CodeFence nodes correctly:
```typescript
case 'CodeFence':
  const fence = node as CodeFenceNode;
  // The content already includes the codefence markers, so we use it as-is
  return fence.content;
```

3. Updated the `nodeToXML` method to explicitly handle CodeFence nodes:
```typescript
private async nodeToXML(node: MeldNode, state: IStateService): Promise<string> {
  // We need to handle CodeFence nodes explicitly to avoid double-rendering the codefence markers
  if (node.type === 'CodeFence') {
    const fence = node as CodeFenceNode;
    // The content already includes the codefence markers, so we use it as-is
    return fence.content;
  }
  
  // For other node types, use the same logic as markdown for consistent behavior
  return this.nodeToMarkdown(node, state);
}
```

4. Updated tests to match the new behavior by including the code fence markers in the test data.

## Implementation Priority

High - This was a user-visible formatting issue that could affect the readability and correctness of output files.

## Resolution

✅ Fixed in v10.2.4

### Changes Made:
- Updated the OutputService to handle code fence nodes correctly without adding extra fence markers
- Modified unit tests to match the new code fence handling behavior
- All tests pass after implementing these changes
- Verified the fix by testing with a sample Meld file containing a code fence 