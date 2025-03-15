# AST Types and Factory Pattern

This directory contains the AST (Abstract Syntax Tree) types and factory implementations for the Meld codebase.

## Directory Structure

```
core/syntax/types/
  ├─ interfaces/                # Interface definitions
  │   ├─ common.ts              # Shared types (NodeType, SourceLocation, etc.)
  │   ├─ INode.ts               # Base node interface
  │   ├─ IDirectiveNode.ts      # Directive node interface
  │   ├─ IVariableReference.ts  # Variable reference interface
  │   ├─ ITextNode.ts           # Text node interface
  │   ├─ ICodeFenceNode.ts      # Code fence node interface
  │   ├─ ICommentNode.ts        # Comment node interface
  │   └─ index.ts               # Re-exports all interfaces
  ├─ factories/                 # Factory implementations
  │   ├─ NodeFactory.ts         # Base node factory
  │   ├─ VariableNodeFactory.ts # Variable node factory
  │   ├─ DirectiveNodeFactory.ts # Directive node factory
  │   ├─ TextNodeFactory.ts     # Text node factory
  │   └─ index.ts               # Re-exports all factories
  └─ legacy/                    # Backward compatibility layer
      ├─ variables.ts           # Legacy variable functions
      ├─ nodes.ts               # Legacy node functions
      └─ index.ts               # Re-exports for backward compatibility
```

## Interfaces

The AST interfaces define the structure of nodes in the syntax tree.

### Base Interfaces

- `INode`: The base interface for all AST nodes.
  - Properties: `type`, `location`

### Node Interfaces

- `IDirectiveNode`: Interface for directive nodes (e.g., `@text`, `@data`).
  - Extends: `INode`
  - Properties: `directive`

- `IVariableReference`: Interface for variable reference nodes.
  - Extends: `INode`
  - Properties: `identifier`, `valueType`, `fields`, `isVariableReference`, `format`

- `ITextNode`: Interface for text nodes.
  - Extends: `INode`
  - Properties: `content`

- `ICodeFenceNode`: Interface for code fence nodes.
  - Extends: `INode`
  - Properties: `content`, `language`

- `ICommentNode`: Interface for comment nodes.
  - Extends: `INode`
  - Properties: `content`

- `IErrorNode`: Interface for error nodes.
  - Extends: `INode`
  - Properties: `message`, `stack`

## Factories

Factories are responsible for creating AST node instances.

### Node Factories

- `NodeFactory`: Creates base nodes.
  - Methods: `createNode(type, location)`

- `VariableNodeFactory`: Creates variable reference nodes.
  - Methods: 
    - `createVariableReferenceNode(identifier, valueType, fields, format, location)`
    - `isValidFieldArray(fields)`
    - `isVariableReferenceNode(node)`

- `DirectiveNodeFactory`: Creates directive nodes.
  - Methods: 
    - `createDirectiveNode(kind, data, location)`
    - `isDirectiveNode(node)`

- `TextNodeFactory`: Creates text nodes.
  - Methods: 
    - `createTextNode(content, location)`
    - `isTextNode(node)`

- `CodeFenceNodeFactory`: Creates code fence nodes.
  - Methods: 
    - `createCodeFenceNode(content, language, location)`
    - `isCodeFenceNode(node)`

- `CommentNodeFactory`: Creates comment nodes.
  - Methods: 
    - `createCommentNode(content, location)`
    - `isCommentNode(node)`

- `ErrorNodeFactory`: Creates error nodes.
  - Methods: 
    - `createErrorNode(message, stack, location)`
    - `isErrorNode(node)`

## Legacy Functions

For backward compatibility, legacy functions are provided that use the factory pattern internally:

```typescript
// Instead of using this legacy function
const node = createVariableReferenceNode('myVar', 'text');

// Use the factory directly
const nodeFactory = container.resolve(VariableNodeFactory);
const node = nodeFactory.createVariableReferenceNode('myVar', 'text');
```

## DI Container Registration

All factories are registered with the dependency injection container in `core/di-config.ts`:

```typescript
// Register AST factory classes
container.register(NodeFactory, { useClass: NodeFactory });
container.register(VariableNodeFactory, { useClass: VariableNodeFactory });
container.register(DirectiveNodeFactory, { useClass: DirectiveNodeFactory });
container.register(TextNodeFactory, { useClass: TextNodeFactory });
container.register(CodeFenceNodeFactory, { useClass: CodeFenceNodeFactory });
container.register(CommentNodeFactory, { useClass: CommentNodeFactory });
container.register(ErrorNodeFactory, { useClass: ErrorNodeFactory });
```

## Usage Examples

### Creating Nodes with Factories

```typescript
import { container } from 'tsyringe';
import { 
  VariableNodeFactory, 
  DirectiveNodeFactory,
  TextNodeFactory
} from '@core/syntax/types/factories';

// Create a variable reference node
const variableFactory = container.resolve(VariableNodeFactory);
const varNode = variableFactory.createVariableReferenceNode('myVar', 'text');

// Create a directive node
const directiveFactory = container.resolve(DirectiveNodeFactory);
const directiveNode = directiveFactory.createDirectiveNode('text', { 
  identifier: 'greeting', 
  value: 'Hello, world!' 
});

// Create a text node
const textFactory = container.resolve(TextNodeFactory);
const textNode = textFactory.createTextNode('This is sample text content');
```

### Type Guards

```typescript
import { container } from 'tsyringe';
import { VariableNodeFactory } from '@core/syntax/types/factories';

const factory = container.resolve(VariableNodeFactory);
const node = factory.createVariableReferenceNode('myVar', 'text');

// Check if a node is a variable reference node
if (factory.isVariableReferenceNode(node)) {
  console.log('Node is a variable reference');
}
```

## Type Aliases for Backward Compatibility

For backward compatibility, type aliases are provided for all interfaces:

```typescript
// Type aliases
export type MeldNode = INode;
export type DirectiveNode = IDirectiveNode;
export type TextNode = ITextNode;
export type CodeFenceNode = ICodeFenceNode;
export type CommentNode = ICommentNode;
export type ErrorNode = IErrorNode;
export type VariableReferenceNode = IVariableReference;
export type VariableNode = IVariableReference; // Legacy alias
```