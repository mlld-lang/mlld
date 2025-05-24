# MeldNode Design

This document captures the planned structure of the unified `MeldNode` type that will replace the legacy definitions. It consolidates information from `core/syntax/types` and the new files in `core/ast/types`.

## Base Interface

Every node shares a few common fields through the base interface:

```typescript
export interface BaseMeldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}
```

`SourceLocation` is the traditional `{ start: { line, column }, end: { line, column } }` object.

## Specific Node Types

The existing code defines interfaces such as `TextNode`, `DirectiveNode`, `CodeFenceNode`, etc.  Each extends `BaseMeldNode` and adds its own fields.  The list of base interfaces and how they map across old and new files is documented in `AST-BASE-INTERFACES.md`.

## Union Definition

A single discriminated union will encompass all node interfaces:

```typescript
export type MeldNode =
  | TextNode
  | DirectiveNode
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode;
```

Every interface in `core/ast/types` must be included.  This union becomes the primary node type consumed by ParserService, InterpreterService and StateService.

## Parser Transformation

ParserService currently returns legacy `MeldNode[]` (the old interface).  After the refactor it will perform a light transformation step to return the new `MeldNode[]` (the union type):

1. Invoke the Peggy-generated parser to obtain raw nodes with `type`, `nodeId` and `location`.
2. Validate that each node matches one of the known interfaces.
3. Cast the node as `MeldNode` (the union) and return the array.

Helper functions will encapsulate the validation logic so the ParserService remains readable.  The transformation helpers are the main area still requiring design refinement.

## Usage

All services will import `MeldNode` from `@core/ast/types` (or a dedicated entry point) instead of pulling individual interfaces from `core/syntax/types`.  The discriminated union allows generic processing while enabling type guards for specific node kinds.

This file serves as the reference design for the unified node type approach.
