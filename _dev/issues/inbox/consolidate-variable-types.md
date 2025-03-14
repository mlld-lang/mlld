I'll analyze this systematically:

1. First, let me look for the actual type definitions in meld-spec:

Ran tool
Let me try searching for where we use these types in our codebase to understand the current usage patterns:

Ran tool
Let me also check our documentation for any additional context:

Search files...
Based on the analysis of the codebase, here's what I've found:

1. **Types in meld-spec**:
- Base type: `MeldNode`
- Core node types:
  - `TextNode` - For static content
  - `DirectiveNode` - For directives (@text, @data, etc.)
  - `CodeFenceNode` - For code blocks
  - `CommentNode` - For comments
- Variable node types:
  - `TextVarNode` - For text variables (${var})
  - `DataVarNode` - For data variables (#{data})
  - `PathVarNode` - For path variables ($path)

2. **Types we're using in our codebase**:
- We have a `VariableReferenceNode` type that extends `MeldNode` with:
  - `type: 'VariableReference'`
  - `identifier: string`
  - `fields?: Field[]`
  - `isVariableReference: boolean`
- We also have specialized types:
  - `TextVarNode` extends `VariableReferenceNode` with `valueType?: 'text'`
  - `DataVarNode` extends `VariableReferenceNode` with `valueType?: 'data'`

3. **Analysis for standardization**:
Looking at the codebase, there are a few key insights:

a. **Legacy vs. New Format**:
```typescript
if (node.type === 'TextVar' || node.type === 'DataVar' || node.type === 'VariableReference') {
  // Handle text/data variable nodes (new meld-ast format)
  // or variable reference nodes (backward compatibility)
}
```

b. **Variable Types in State**:
```typescript
export type VariableType = 'text' | 'data' | 'path' | 'command';
```

c. **AST Processing**:
```typescript
// From _dev/scripts/review-later/variable-ast-analysis.mjs
function normalizeVarNode(node) {
  return {
    identifier: node.type === 'Directive' ? node.directive.identifier : node.identifier,
    varType: node.type === 'Directive' ? node.directive.kind : node.varType,
    fields: node.type === 'Directive' ? extractFieldsFromDirective(node.directive) : node.fields || []
  };
}
```

**Recommendation for Standardization**:

1. In `meld-spec`, we should standardize on a single approach for variable references:
```typescript
interface VariableReferenceNode extends MeldNode {
  type: 'VariableReference';
  identifier: string;
  valueType: 'text' | 'data' | 'path';
  fields?: Field[];
  isVariableReference: true;  // Always true for variable references
}
```

2. Update the `NodeType` type in `meld-spec` to include 'VariableReference' as a valid type.

3. Deprecate the separate `TextVarNode`, `DataVarNode`, and `PathVarNode` types in favor of the unified `VariableReferenceNode` with a `valueType` discriminator.

This approach would:
1. Unify variable handling under a single node type
2. Maintain backward compatibility through the `valueType` field
3. Make it explicit that a node is a variable reference through the `isVariableReference` property
4. Simplify type checking and node processing
5. Align with how we're already processing variables in the resolution service

Would you like me to proceed with implementing these changes?
