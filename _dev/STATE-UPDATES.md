# State Service AST Type Migration Plan

## Overview

This document outlines the changes needed to update the state service to use the new AST types from `core/ast/types` instead of the old types from `core/syntax/types`. Based on analysis of the Parser, Interpreter, and State services, we'll use a discriminated union approach.

## Architecture Context

Current flow:
1. **ParserService** → produces AST nodes with locations
2. **InterpreterService** → processes nodes, calls handlers, manages state updates
3. **StateService** → stores and manages nodes generically

Key insight: The state service doesn't need to understand specific node types - it just stores and tracks them. The interpreter handles type-specific logic.

## Current State

The state service currently uses:
```typescript
import type { MeldNode, TextNode } from '@core/syntax/types/index';
```

These map to:
- `MeldNode` → generic node interface
- `TextNode` → text-specific node type

## Target State

The state service should use a discriminated union of all node types:
```typescript
// Define our own union type that includes all possible nodes
type ASTNode = 
  | TextNode 
  | DirectiveNode 
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode;

// Import from wherever these types are defined
import type { TextNode, DirectiveNode, /* ... */ } from '@core/ast/types';
```

Note: While the new AST doesn't currently export a single union type, we can create one for the state service. All these types share:
- A discriminating `type` field (allows TypeScript to narrow types)
- A `nodeId` field (required for state tracking)
- An optional `location` field
- They all extend the base `MeldNode` interface

## Why Use Discriminated Unions?

1. **Type Safety**: TypeScript can narrow types based on the `type` field
2. **Natural Pattern Match**: Works perfectly with the interpreter's switch statements
3. **No Runtime Changes**: Just type-level improvements
4. **Future Flexibility**: Easy to add new node types to the union
5. **Generic Operations**: The union allows treating all nodes generically when needed

Example:
```typescript
function processNode(node: ASTNode) {
  // Generic operations work on all nodes
  console.log(node.nodeId);
  
  // Type-specific operations with narrowing
  switch (node.type) {
    case 'Text':
      console.log(node.content); // TypeScript knows this is a TextNode
      break;
    case 'Directive':
      console.log(node.kind); // TypeScript knows this is a DirectiveNode
      break;
  }
}
```

This gives us the benefits of discriminated unions while maintaining compatibility.

## Required Changes

### 1. Update Type Imports

**File:** `services/state/StateService/StateService.ts`

```typescript
// OLD
import type { MeldNode, TextNode } from '@core/syntax/types/index';

// NEW
import type { 
  TextNode, 
  DirectiveNode, 
  CodeFenceNode,
  CommentNode,
  VariableReferenceNode,
  // ... other node types
} from '@core/ast/types';

// Define the union type
type ASTNode = 
  | TextNode 
  | DirectiveNode 
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  // ... include all node types
```

### 2. Update Interface Definitions

**File:** `services/state/StateService/types.ts`

```typescript
// OLD
interface StateNode {
  nodes: MeldNode[];
  transformedNodes?: MeldNode[];
  // ... other properties
}

// NEW
interface StateNode {
  nodes: ASTNode[];
  transformedNodes?: ASTNode[];
  // ... other properties
}
```

### 3. Update Method Signatures

**File:** `services/state/StateService/IStateService.ts`

```typescript
// OLD
interface IStateService {
  addNode(node: MeldNode): Promise<void>;
  transformNode(index: number, replacement: MeldNode | MeldNode[] | undefined): Promise<void>;
  // ... other methods
}

// NEW
interface IStateService {
  addNode(node: ASTNode): Promise<void>;
  transformNode(index: number, replacement: ASTNode | ASTNode[] | undefined): Promise<void>;
  // ... other methods
}
```

### 4. Update appendContent Method

Since `appendContent` creates simple text nodes, it should create the appropriate AST node type:

```typescript
// OLD
async appendContent(content: string): Promise<void> {
  const textNode: TextNode = {
    type: 'Text',
    content,
    location: { start: { line: -1, column: -1 }, end: { line: -1, column: -1 } },
    nodeId: crypto.randomUUID()
  };
  await this.addNode(textNode);
}

// NEW - Check if TextNode exists in new AST, otherwise use appropriate type
async appendContent(content: string): Promise<void> {
  const textNode: TextNode = {
    type: 'Text',
    nodeId: crypto.randomUUID(),
    location: { start: { line: -1, column: -1 }, end: { line: -1, column: -1 } },
    content
  };
  await this.addNode(textNode);
}
```

### 5. Type Guards

The state service likely doesn't need many type guards since it treats nodes generically. The interpreter handles type-specific logic. Any existing guards can be simplified:

```typescript
// If needed, use discriminated union pattern
function isTextNode(node: ASTNode): node is TextNode {
  return node.type === 'Text';
}

// Or import from AST package if available
import { isTextNode } from '@core/ast/types/guards';
```

### 6. Node Cloning

The existing cloning approach should work unchanged:

```typescript
// This preserves nodeId and works with any node structure
const { nodeId, ...rest } = node;
const nodeClone = {
  ...cloneDeep(rest),
  nodeId
};
```

## Benefits of This Approach

1. **Type Safety**: Full TypeScript support with discriminated unions
2. **Simplicity**: State service remains generic, doesn't need to know specifics
3. **Compatibility**: Works naturally with interpreter's switch statements
4. **Future-proof**: Easy to add new node types to the union

## Migration Strategy

1. **Phase 1**: Update type imports and interfaces
2. **Phase 2**: Update method signatures 
3. **Phase 3**: Test with existing interpreter flow
4. **Phase 4**: Update any state-specific node creation
5. **Phase 5**: Run integration tests

## Testing Considerations

- State service tests can remain mostly unchanged
- Integration tests between parser → interpreter → state are critical
- Type checking will catch most issues at compile time

## Open Questions Resolved

1. **Text Node Creation**: Use the TextNode from new AST if available
2. **Type Guards**: Minimal guards needed, use union discrimination
3. **Backward Compatibility**: Clean cutover, no dual support needed

## Reduced Risks

- Using discriminated unions means less breaking changes
- State service complexity remains low
- Type system handles most validation

## Timeline (Revised)

- Type updates: 1 day
- Implementation updates: 1-2 days
- Testing: 1-2 days
- Integration verification: 1 day

Total: 4-6 days (reduced from 1-2 weeks)

## Success Criteria

1. State service compiles with new AST types
2. Existing functionality preserved
3. Integration with interpreter unchanged
4. Type safety improved
5. No additional complexity in state service

## Confidence Assessment

| Step | Description | Confidence | Notes |
|-----|-------------|-----------|-------|
| 1 | Update type imports | 95 | Straightforward path updates |
| 2 | Update interface definitions | 95 | Interfaces are small and easy to modify |
| 3 | Update method signatures | 88 | Many services depend on these signatures; a full list of affected methods would help |
| 4 | Update appendContent method | 85 | Text node shape in new AST not fully defined; finalized TextNode interface needed |
| 5 | Review type guards | 95 | Likely minimal changes |
| 6 | Verify node cloning | 95 | Existing logic should remain valid |
