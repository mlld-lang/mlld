# AST Factory Pattern Implementation - Phase 1

This document outlines the specific implementation steps for Phase 1 of the AST Factory Pattern implementation plan described in `AST-FACTORY-PATTERN-PLAN.md`.

## Phase 1 Goals

1. Create the interface segregation structure
2. Implement the base factory patterns
3. Ensure backward compatibility during transition
4. Break the immediate circular dependencies

## Directory Structure

First, create the following directory structure:

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

## Implementation Details

### 1. Common Types (interfaces/common.ts)

```typescript
/**
 * Node types supported in the AST
 */
export type NodeType = 
  | 'Directive'
  | 'Text'
  | 'CodeFence'
  | 'Comment'
  | 'Error'
  | 'VariableReference';

/**
 * Position in source code
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Location in source code
 */
export interface SourceLocation {
  start: Position;
  end: Position;
  filePath?: string;
}
```

### 2. Base Node Interface (interfaces/INode.ts)

```typescript
import { NodeType, SourceLocation } from './common.js';

/**
 * Base interface for all AST nodes
 */
export interface INode {
  type: NodeType;
  location?: SourceLocation;
}
```

### 3. Variable Reference Interface (interfaces/IVariableReference.ts)

```typescript
import { INode } from './INode.js';

/**
 * Types of variables supported in Meld
 */
export type VariableType = 'text' | 'data' | 'path';

/**
 * Field access in a variable reference
 */
export interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * Interface for variable reference nodes
 */
export interface IVariableReference extends INode {
  type: 'VariableReference';
  identifier: string;
  valueType: VariableType;
  fields?: Field[];
  isVariableReference: true;
  format?: string;
}
```

### 4. Directive Node Interface (interfaces/IDirectiveNode.ts)

```typescript
import { INode } from './INode.js';

/**
 * Directive kinds supported in Meld
 */
export type DirectiveKind = 
  | 'text'
  | 'data'
  | 'path'
  | 'import'
  | 'embed'
  | 'run'
  | 'define';

export type DirectiveKindString = DirectiveKind;

/**
 * Base directive data interface
 */
export interface DirectiveData {
  kind: DirectiveKindString;
  [key: string]: any;
}

/**
 * Interface for directive nodes
 */
export interface IDirectiveNode extends INode {
  type: 'Directive';
  directive: DirectiveData;
}
```

### 5. Text Node Interface (interfaces/ITextNode.ts)

```typescript
import { INode } from './INode.js';

/**
 * Interface for text nodes
 */
export interface ITextNode extends INode {
  type: 'Text';
  content: string;
}
```

### 6. Code Fence Interface (interfaces/ICodeFenceNode.ts)

```typescript
import { INode } from './INode.js';

/**
 * Interface for code fence nodes
 */
export interface ICodeFenceNode extends INode {
  type: 'CodeFence';
  content: string;
  language?: string;
}
```

### 7. Comment Node Interface (interfaces/ICommentNode.ts)

```typescript
import { INode } from './INode.js';

/**
 * Interface for comment nodes
 */
export interface ICommentNode extends INode {
  type: 'Comment';
  content: string;
}
```

### 8. Interface Index (interfaces/index.ts)

```typescript
// Re-export all interfaces
export * from './common.js';
export * from './INode.js';
export * from './IDirectiveNode.js';
export * from './IVariableReference.js';
export * from './ITextNode.js';
export * from './ICodeFenceNode.js';
export * from './ICommentNode.js';
```

### 9. Base Node Factory (factories/NodeFactory.ts)

```typescript
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { NodeType, SourceLocation, INode } from '@core/syntax/types/interfaces/index.js';

/**
 * Factory for creating base nodes
 */
@injectable()
@Service({
  description: 'Factory for creating AST nodes'
})
export class NodeFactory {
  /**
   * Create a base node with the specified type and location
   */
  createNode(
    type: NodeType,
    location?: SourceLocation
  ): INode {
    return {
      type,
      location: location || {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 0 }
      }
    };
  }
}
```

### 10. Variable Node Factory (factories/VariableNodeFactory.ts)

```typescript
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  IVariableReference, 
  VariableType, 
  Field 
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating variable reference nodes
 */
@injectable()
@Service({
  description: 'Factory for creating variable reference nodes'
})
export class VariableNodeFactory {
  /**
   * Creates a new instance of VariableNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a variable reference node
   */
  createVariableReferenceNode(
    identifier: string,
    valueType: VariableType,
    fields?: Field[],
    format?: string,
    location?: SourceLocation
  ): IVariableReference {
    // Validate fields if provided
    if (fields && !this.isValidFieldArray(fields)) {
      throw new Error('Invalid fields array provided to createVariableReferenceNode');
    }

    const baseNode = this.nodeFactory.createNode('VariableReference', location);
    
    return {
      ...baseNode,
      identifier,
      valueType,
      fields,
      isVariableReference: true,
      ...(format && { format })
    };
  }

  /**
   * Validate a field array
   */
  isValidFieldArray(fields: any[]): fields is Field[] {
    return fields.every(
      field =>
        field &&
        (field.type === 'field' || field.type === 'index') &&
        (typeof field.value === 'string' || typeof field.value === 'number')
    );
  }

  /**
   * Check if a node is a variable reference node
   */
  isVariableReferenceNode(node: any): node is IVariableReference {
    return (
      node.type === 'VariableReference' &&
      typeof node.identifier === 'string' &&
      typeof node.valueType === 'string'
    );
  }
}
```

### 11. Text Node Factory (factories/TextNodeFactory.ts)

```typescript
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  ITextNode 
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating text nodes
 */
@injectable()
@Service({
  description: 'Factory for creating text nodes'
})
export class TextNodeFactory {
  /**
   * Creates a new instance of TextNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a text node
   */
  createTextNode(
    content: string,
    location?: SourceLocation
  ): ITextNode {
    const baseNode = this.nodeFactory.createNode('Text', location);
    
    return {
      ...baseNode,
      content
    };
  }

  /**
   * Check if a node is a text node
   */
  isTextNode(node: any): node is ITextNode {
    return (
      node.type === 'Text' &&
      typeof node.content === 'string'
    );
  }
}
```

### 12. Directive Node Factory (factories/DirectiveNodeFactory.ts)

```typescript
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  IDirectiveNode,
  DirectiveData,
  DirectiveKindString
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating directive nodes
 */
@injectable()
@Service({
  description: 'Factory for creating directive nodes'
})
export class DirectiveNodeFactory {
  /**
   * Creates a new instance of DirectiveNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a directive node
   */
  createDirectiveNode(
    kind: DirectiveKindString,
    data: Partial<DirectiveData>,
    location?: SourceLocation
  ): IDirectiveNode {
    const baseNode = this.nodeFactory.createNode('Directive', location);
    
    return {
      ...baseNode,
      directive: {
        kind,
        ...data
      }
    };
  }

  /**
   * Check if a node is a directive node
   */
  isDirectiveNode(node: any): node is IDirectiveNode {
    return (
      node.type === 'Directive' &&
      node.directive &&
      typeof node.directive.kind === 'string'
    );
  }
}
```

### 13. Factory Index (factories/index.ts)

```typescript
// Re-export all factories
export * from './NodeFactory.js';
export * from './VariableNodeFactory.js';
export * from './DirectiveNodeFactory.js';
export * from './TextNodeFactory.js';
```

### 14. Backward Compatibility Layer

To maintain compatibility, create a legacy layer that uses factories but provides the same API:

```typescript
// legacy/variables.ts
import { container } from 'tsyringe';
import { 
  VariableType,
  Field,
  SourceLocation
} from '@core/syntax/types/interfaces/index.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/index.js';

/**
 * Legacy function to create variable reference nodes
 * @deprecated Use VariableNodeFactory directly
 */
export function createVariableReferenceNode(
  identifier: string,
  valueType: VariableType,
  fields?: Field[],
  format?: string,
  location?: SourceLocation
) {
  const factory = container.resolve(VariableNodeFactory);
  return factory.createVariableReferenceNode(identifier, valueType, fields, format, location);
}

/**
 * Legacy function to check if a node is a variable reference node
 * @deprecated Use VariableNodeFactory directly
 */
export function isVariableReferenceNode(node: any) {
  const factory = container.resolve(VariableNodeFactory);
  return factory.isVariableReferenceNode(node);
}

// Re-export types for backward compatibility
export type { VariableType, Field };
export { SPECIAL_PATH_VARS, ENV_VAR_PREFIX, VAR_PATTERNS } from '@core/syntax/types/variables.js';
```

### 15. DI Container Registration

Update the DI container registration in core/di-config.ts:

```typescript
// Add to existing container registrations
container.register(NodeFactory, { useClass: NodeFactory });
container.register(VariableNodeFactory, { useClass: VariableNodeFactory });
container.register(DirectiveNodeFactory, { useClass: DirectiveNodeFactory });
container.register(TextNodeFactory, { useClass: TextNodeFactory });
```

## Migration Strategy

1. First, create the interface structure and factory implementations
2. Next, implement the backward compatibility layer
3. Update the main index.ts to export both the new interfaces and backward compatibility layers
4. Gradually update client code to use the factory pattern directly

## Testing

1. Create specific tests for each factory to ensure correct functionality
2. Verify that existing tests continue to pass using the backward compatibility layer
3. Test the DI container registration and factory resolution

## Next Phase

Once Phase 1 is complete and all immediate circular dependencies are resolved, we can move to Phase 2:

1. Implement additional factories for remaining node types
2. Consolidate type guards and validation utilities
3. Create client interfaces for factory interaction
4. Update core services to use the factory pattern directly

This phased approach allows us to resolve the immediate build issues while setting up the foundation for a cleaner, more maintainable AST type system.