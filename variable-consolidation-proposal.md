## Background

We're currently working on standardizing our variable node types across the codebase. The current implementation in meld-ast (now in core/ast) creates three different node types:

- TextVar
- DataVar
- PathVar

This requires transformation in the ParserService when we want to use them with our standardized VariableReferenceNode type.

## Current Implementation

I've implemented a temporary solution in `ParserService.ts` that transforms the parser's output to use the consolidated types:

```typescript
private transformVariableNode(node: MeldNode): MeldNode {
  if (!node || typeof node !== 'object') {
    return node;
  }
  
  // Using type assertion since we need to access properties not in base MeldNode
  const anyNode = node as any;
  
  // First transform arrays recursively
  if (Array.isArray(anyNode)) {
    return anyNode.map(item => this.transformVariableNode(item)) as any;
  }
  
  // Handle variable node types
  if (anyNode.type === 'TextVar' || anyNode.type === 'DataVar' || anyNode.type === 'PathVar') {
    // Determine the valueType based on the original node type
    let valueType: 'text' | 'data' | 'path';
    if (anyNode.type === 'TextVar') {
      valueType = 'text';
    } else if (anyNode.type === 'DataVar') {
      valueType = 'data';
    } else { // PathVar
      valueType = 'path';
    }
    
    // Create a variable reference node structure
    const variableRefNode: any = {
      type: 'VariableReference',
      valueType,
      fields: anyNode.fields || [],
      isVariableReference: true,
      location: anyNode.location
    };
    
    // Copy identifier and format if they exist
    if (anyNode.identifier) {
      variableRefNode.identifier = anyNode.identifier;
    }
    
    if (anyNode.format) {
      variableRefNode.format = anyNode.format;
    }
    
    return variableRefNode as MeldNode;
  }
  
  // Process other node types that might contain variable nodes
  return anyNode;
}
```

This transformation approach works for our current implementation, but it's more efficient to have the parser directly output the consolidated types.

## Proposed Changes

We propose updating the meld-ast grammar to directly output our consolidated VariableReferenceNode type:

```typescript
interface VariableReferenceNode {
  type: 'VariableReference';
  identifier: string;
  valueType: 'text' | 'data' | 'path';
  fields?: Field[];
  isVariableReference: true;
  format?: string;
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}
```

### Specific Grammar Changes Needed

1. Update the NodeType enum in `core/ast/grammar/meld.pegjs` to include 'VariableReference'
2. Modify the TextVar rule to create a VariableReference node with valueType: 'text'
3. Modify the DataVar rule to create a VariableReference node with valueType: 'data'
4. Modify the PathVar rule to create a VariableReference node with valueType: 'path'

The specific changes to the grammar would look something like this:

```javascript
// In the NodeType enum
const NodeType = {
  // ... existing types
  VariableReference: 'VariableReference',
  // Keep old types for backward compatibility
  TextVar: 'TextVar',
  DataVar: 'DataVar',
  PathVar: 'PathVar',
};

// Replace the TextVar rule
TextVar
  = "{{" _ id:Identifier format:VarFormat? _ "}}" !FieldAccess {
    return createNode(NodeType.VariableReference, {
      identifier: id,
      valueType: 'text',
      isVariableReference: true,
      ...(format ? { format } : {})
    }, location());
  }

// Replace the DataVar rule 
DataVar
  = "{{" _ id:Identifier accessElements:(FieldAccess / NumericFieldAccess / ArrayAccess)* format:VarFormat? _ "}}" {
    return createNode(NodeType.VariableReference, {
      identifier: id,
      valueType: 'data',
      fields: accessElements || [],
      isVariableReference: true,
      ...(format ? { format } : {})
    }, location());
  }

// Replace the PathVar rule
PathVar
  = "$" id:PathIdentifier {
    return createNode(NodeType.VariableReference, {
      identifier: normalizePathVar(id),
      valueType: 'path',
      isVariableReference: true,
      isSpecial: true
    }, location());
  }
```

## Impact Analysis

Running the full test suite with our temporary transformation layer in place shows that we need to update:

1. Tests in `core/ast/tests/parser.test.ts` that explicitly check for the old node types
2. The `VariableReferenceResolver` tests and implementation, which currently has references to the old types
3. Several other tests that depend on the exact shape of variable nodes

## Benefits

- Simplified type system with a single node type for all variable references
- Elimination of transformation layer in ParserService
- Clearer discrimination between variable types via the valueType field
- Consistent handling of fields and formatting options
- Improved type safety throughout the codebase

## Related Work

This is part of the consolidation effort outlined in _dev/issues/inbox/consolidate-variable-types.md 