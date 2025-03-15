# AST Factory Pattern Implementation Plan

## Background

After eliminating the external `meld-spec` dependency and integrating its functionality directly into the codebase, we're encountering circular dependency issues with the AST types. These circular dependencies are breaking the build process despite all tests passing.

## Current Issues

1. **Circular Dependencies**: Several files in the `core/syntax/types` directory are creating circular imports, particularly between `index.ts`, `variables.ts`, and `nodes.ts`.

2. **Build Failures**: The circular dependencies are preventing successful builds with error messages like "No matching export in X for import Y".

3. **Test Pass / Build Fail**: Tests pass because they rely on the TypeScript transpiled output, but strict ES module resolution in the build process fails.

## Proposed Solution

Apply our established factory pattern to the AST types to break circular dependencies while maintaining consistency with the rest of the codebase. This approach follows our existing patterns seen in services like FileSystemService, PathService, and ResolutionService.

## Implementation Outline

### 1. Interface Segregation

- Create a set of minimal interfaces for AST nodes in `core/syntax/types/interfaces/`
- Split monolithic interfaces into smaller, focused interfaces
- Establish clear dependency hierarchy between interfaces
- Follow our client interface pattern (e.g., `INodeClient`, `IVariableReferenceClient`)

Example directory structure:
```
core/syntax/types/interfaces/
  ├─ INode.ts                   # Base node interface
  ├─ INodeClient.ts             # Minimal client interface for node operations
  ├─ IDirectiveNode.ts          # Directive node interface
  ├─ ITextNode.ts               # Text node interface
  ├─ IVariableReference.ts      # Variable reference interface
  ├─ IVariableReferenceClient.ts # Minimal variable reference client interface
  └─ index.ts                   # Re-exports all interfaces
```

### 2. Factory Implementation

- Create factories in `core/syntax/types/factories/`
- Each factory responsible for producing specific node types
- Factories depend only on interfaces, not implementations
- Register factories with the DI container
- Follow established factory patterns in the codebase

Example directory structure:
```
core/syntax/types/factories/
  ├─ NodeFactory.ts             # Factory for creating basic nodes
  ├─ DirectiveNodeFactory.ts    # Factory for creating directive nodes
  ├─ VariableReferenceNodeFactory.ts # Factory for creating variable reference nodes
  ├─ TextNodeFactory.ts         # Factory for creating text nodes
  └─ index.ts                   # Re-exports all factories
```

### 3. Implementation Reorganization

- Move implementations to their own files to avoid circular imports
- Ensure one-way dependency flow from interfaces → factories → implementations
- Consolidate utility functions for node type checking
- Reorganize barrel files to prevent circular references

Example directory structure:
```
core/syntax/types/
  ├─ implementations/           # Concrete implementations
  │   ├─ DirectiveNode.ts       # Directive node implementation 
  │   ├─ TextNode.ts            # Text node implementation
  │   ├─ VariableReferenceNode.ts # Variable reference implementation
  │   └─ index.ts               # Re-exports all implementations
  ├─ utils/                     # Utility functions
  │   ├─ nodeTypeGuards.ts      # Type guards for node types
  │   ├─ nodeValidation.ts      # Node validation functions
  │   └─ index.ts               # Re-exports all utilities
  └─ index.ts                   # Main entry point that re-exports interfaces and factories
```

### 4. Dependency Injection Setup

- Register factories with the DI container
- Update existing code to request node instances from factories
- Use proper interface types rather than concrete implementations
- Follow established DI patterns from our ServiceClientFactory approach

Example registration:
```typescript
// In di-config.ts
container.register("NodeFactory", {
  useClass: NodeFactoryImpl
});
container.register("VariableReferenceNodeFactory", {
  useClass: VariableReferenceNodeFactoryImpl
});
```

Example usage:
```typescript
// Before
const node: VariableReferenceNode = createVariableReferenceNode(...);

// After
const nodeFactory = container.resolve("VariableReferenceNodeFactory");
const node = nodeFactory.createVariableReferenceNode(...);
```

## Detailed Factory Implementations

### Base Node Factory

```typescript
// core/syntax/types/factories/NodeFactory.ts
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { INode } from '@core/syntax/types/interfaces/INode.js';
import { INodeClient } from '@core/syntax/types/interfaces/INodeClient.js';

@injectable()
@Service({
  description: 'Factory for creating AST nodes'
})
export class NodeFactory implements INodeClient {
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

### Variable Reference Node Factory

```typescript
// core/syntax/types/factories/VariableReferenceNodeFactory.ts
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  IVariableReference, 
  VariableType, 
  Field 
} from '@core/syntax/types/interfaces/IVariableReference.js';
import { IVariableReferenceClient } from '@core/syntax/types/interfaces/IVariableReferenceClient.js';
import { NodeFactory } from './NodeFactory.js';

@injectable()
@Service({
  description: 'Factory for creating variable reference nodes'
})
export class VariableReferenceNodeFactory implements IVariableReferenceClient {
  constructor(
    private nodeFactory: NodeFactory
  ) {}

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

  isValidFieldArray(fields: any[]): fields is Field[] {
    return fields.every(
      field =>
        field &&
        (field.type === 'field' || field.type === 'index') &&
        (typeof field.value === 'string' || typeof field.value === 'number')
    );
  }

  isVariableReferenceNode(node: any): node is IVariableReference {
    return (
      node.type === 'VariableReference' &&
      typeof node.identifier === 'string' &&
      typeof node.valueType === 'string'
    );
  }
}
```

## Specific Components to Address

1. **Base Node Types**
   - `MeldNode` interface → `INode` interface
   - `NodeType` definition → Shared enum/type in `types/interfaces/common.ts`
   - `SourceLocation` interface → Standalone interface in `types/interfaces/common.ts`

2. **Variable-Related Types**
   - `VariableType` definition → Moved to `types/interfaces/IVariableReference.ts`
   - `VariableReferenceNode` interface → Moved to `types/interfaces/IVariableReference.ts`
   - `Field` interface → Moved to `types/interfaces/IVariableReference.ts`

3. **Directive-Related Types**
   - `DirectiveNode` interface → Moved to `types/interfaces/IDirectiveNode.ts`
   - `DirectiveData` interface → Moved to `types/interfaces/IDirectiveNode.ts`
   - `DirectiveKind` definition → Moved to `types/interfaces/IDirectiveNode.ts`

4. **Content Node Types**
   - `TextNode` interface → Moved to `types/interfaces/ITextNode.ts`
   - `CodeFenceNode` interface → Moved to `types/interfaces/ICodeFenceNode.ts`
   - `CommentNode` interface → Moved to `types/interfaces/ICommentNode.ts`

## Migration Strategy

1. **Staged Implementation**:
   - Create interfaces first
   - Implement factories next
   - Update client code gradually
   - Maintain backward compatibility during transition

2. **Testing Approach**:
   - Ensure all existing tests continue to pass
   - Write specific tests for factory implementations
   - Test client code updates in isolation
   - Verify circular dependencies are resolved

3. **Backward Compatibility**:
   - Keep existing creator functions but refactor them to use factories
   - Provide backward compatibility layers where needed
   - Use factory pattern when creating new nodes, but allow direct creation for tests

## Implementation Steps

1. Create interface directory structure and define basic interfaces
2. Implement base node factory
3. Implement specialized node factories
4. Register factories with DI container
5. Update key services to use factories
6. Test and verify build success
7. Gradually update remaining code to use factories
8. Remove backward compatibility layers once migration is complete

This plan will maintain backward compatibility while resolving the circular dependencies that are preventing successful builds.