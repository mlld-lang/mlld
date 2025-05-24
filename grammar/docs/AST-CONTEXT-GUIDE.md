# AST Context Guide

This guide documents how to interpret Meld AST nodes based on their context. The Meld grammar reuses node types across different contexts for modularity and consistency, which means the same node type can have different meanings depending on where it appears in the AST.

## Overview

### Philosophy of Context-Aware AST Design

Meld's AST design prioritizes:
1. **Grammar modularity** - Reusable patterns across different directives
2. **Consistent node structures** - Same node types work in multiple contexts
3. **Context-based interpretation** - Meaning derived from location and metadata

### How Context is Determined

Context is determined by four primary factors:
1. **Parent node type** - What contains this node
2. **Field location** - Which field of the parent contains this node
3. **Meta flags** - Explicit context indicators (e.g., `isDataValue`, `isRHSRef`)
4. **ValueType fields** - For polymorphic nodes like VariableReference

## Node Context Rules

### VariableReference Nodes

VariableReference nodes appear in many contexts with different `valueType` values:

#### `valueType: 'varIdentifier'`
- **Context**: Direct variable reference using `@` syntax
- **Examples**: `@myVar`, `@config.name`, `@list[0]`
- **Appears in**: 
  - Data values: `@data x = { field: @myVar }`
  - Path contexts: `[@projectPath/file.md]`
  - Variable fields in add directive

#### `valueType: 'varInterpolation'`
- **Context**: Variable inside template interpolation using `{{}}` syntax
- **Examples**: `{{name}}`, `{{user.email}}`
- **Appears in**:
  - Template content: `[[Hello {{name}}!]]`
  - Quoted strings in templates

#### `valueType: 'identifier'`
- **Context**: Variable name in assignments (LHS)
- **Examples**: The `x` in `@data x = ...`
- **Appears in**: 
  - `identifier` field of assignment directives

#### `valueType: 'variable'`
- **Context**: Legacy or special variable contexts
- **Note**: Being phased out in favor of more specific types

#### Field Access Patterns
```javascript
// Simple variable
{ type: 'VariableReference', identifier: 'myVar' }

// With field access
{ 
  type: 'VariableReference', 
  identifier: 'myVar',
  fields: [
    { type: 'field', name: 'property' },
    { type: 'arrayIndex', index: 0 }
  ]
}
```

### Directive Nodes

Directive nodes can appear at different levels with different meanings:

#### Top-Level Directives
- **Context**: Direct children of root/document
- **Detection**: Parent is root array or Document node
- **Example**: 
  ```javascript
  [
    { type: 'Directive', kind: 'data', ... },  // Top-level
    { type: 'Directive', kind: 'text', ... }   // Top-level
  ]
  ```

#### Directives as Values
- **Context**: Embedded in data structures
- **Detection**: `meta.isDataValue === true`
- **Example**:
  ```javascript
  // In @data results = { test: @run [cmd] }
  {
    type: 'object',
    properties: {
      test: { 
        type: 'Directive', 
        kind: 'run',
        meta: { isDataValue: true }  // Key indicator
      }
    }
  }
  ```

#### RHS Reference Directives
- **Context**: Right-hand side of assignments
- **Detection**: `meta.isRHSRef === true`
- **Example**: `@text content = @run [echo "hello"]`

### Text Nodes

Text nodes represent literal text content in various contexts:

#### Template Text
- **Context**: Part of template content
- **Detection**: Parent is an array that represents template content
- **Identifying template arrays**: Contains mix of Text and VariableReference nodes with `valueType: 'varInterpolation'`

#### Path Segments
- **Context**: Part of file paths
- **Detection**: Within path-related fields
- **Example**: The "folder" in `[folder/file.txt]`

#### Command/Code Text
- **Context**: Shell commands or code blocks
- **Detection**: Within command/code fields of run/exec directives

### Array Nodes as Containers

Arrays serve different purposes based on their content:

#### Template Content Arrays
- **Contains**: Text and VariableReference nodes
- **Detection**: 
  ```javascript
  function isTemplateArray(arr) {
    return arr.some(node => 
      node.type === 'VariableReference' && 
      node.valueType === 'varInterpolation'
    );
  }
  ```

#### Path Segment Arrays
- **Contains**: Text, PathSeparator, VariableReference nodes
- **Context**: Path construction in import/add directives

#### Data Arrays
- **Contains**: Any valid data value (primitives, objects, directives, etc.)
- **Context**: Array literals in data directives

## Context Detection Patterns

### TypeScript Helper Functions

```typescript
// Check if a directive is embedded as a value
function isDirectiveAsValue(node: DirectiveNode): boolean {
  return node.meta?.isDataValue === true;
}

// Check if a directive is an RHS reference
function isRHSReference(node: DirectiveNode): boolean {
  return node.meta?.isRHSRef === true;
}

// Identify template content arrays
function isTemplateArray(arr: any[]): boolean {
  return Array.isArray(arr) && arr.some(node => 
    node.type === 'VariableReference' && 
    node.valueType === 'varInterpolation'
  );
}

// Check variable reference type
function getVariableContext(node: VariableReferenceNode): string {
  switch (node.valueType) {
    case 'varIdentifier': return 'direct-reference';
    case 'varInterpolation': return 'template-interpolation';
    case 'identifier': return 'assignment-target';
    default: return 'unknown';
  }
}

// Determine if node is top-level directive
function isTopLevelDirective(node: any, parent: any): boolean {
  return node.type === 'Directive' && 
         Array.isArray(parent) && 
         !node.meta?.isDataValue;
}
```

## Field Location Guide

### Data Directive Fields

**`values.value`** can contain:
- **Primitives**: strings, numbers, booleans, null
- **Objects**: `{ type: 'object', properties: {...} }`
- **Arrays**: `{ type: 'array', items: [...] }`
- **Directive nodes**: Full directive with `meta.isDataValue: true`
- **Variable references**: With `valueType: 'varIdentifier'`
- **Template arrays**: Array of Text/VariableReference nodes

### Text Directive Fields

**`values.content`** can contain:
- **Template array**: Mix of Text and VariableReference nodes
- **Single Text node**: For simple content

### Path-related Fields

**`values.path`** in import/add directives:
- **Array of nodes**: Text, PathSeparator, VariableReference
- **Variable references**: With `valueType: 'varIdentifier'`

## Meta Flags Reference

### Common Meta Flags

| Flag | Meaning | Set By |
|------|---------|--------|
| `isDataValue` | Directive embedded in data structure | Data directive value rules |
| `isRHSRef` | Directive used as RHS reference | RHS reference rules |
| `hasVariables` | Contains variable interpolation | Various content validators |
| `isMultiLine` | Content spans multiple lines | Content parsing rules |
| `isTemplateContent` | Content uses template syntax `[[...]]` | Template detection |
| `hasExtension` | Path includes file extension | Path validation |
| `isAbsolute` | Path is absolute | Path validation |

### Directive-Specific Meta

**Run Directive**:
- `language`: Programming language for code blocks
- `isMultiLine`: Command spans multiple lines

**Import Directive**:
- `hasWildcard`: Import uses `*` selector
- `importCount`: Number of items imported

**Data Directive**:
- `primitiveType`: Type of primitive value
- `objectData.propCount`: Number of object properties
- `arrayData.itemCount`: Number of array items

## Common Pitfalls

### 1. Assuming All Directives are Top-Level
**Wrong**:
```javascript
if (node.type === 'Directive') {
  // Process as top-level directive
}
```

**Right**:
```javascript
if (node.type === 'Directive' && !node.meta?.isDataValue) {
  // Process as top-level directive
}
```

### 2. Not Checking Variable ValueType
**Wrong**:
```javascript
if (node.type === 'VariableReference') {
  return `@${node.identifier}`;  // Assumes @ syntax
}
```

**Right**:
```javascript
if (node.type === 'VariableReference') {
  switch (node.valueType) {
    case 'varInterpolation': return `{{${node.identifier}}}`;
    case 'varIdentifier': return `@${node.identifier}`;
    // ...
  }
}
```

### 3. Misidentifying Template Content
**Wrong**:
```javascript
if (Array.isArray(value)) {
  // Assume it's a data array
}
```

**Right**:
```javascript
if (Array.isArray(value)) {
  if (isTemplateArray(value)) {
    // Handle as template content
  } else {
    // Handle as data array
  }
}
```

## Examples Section

### Same Construct in Different Contexts

#### Variable Reference: `@config`

**In Data Value**:
```javascript
// @data x = { setting: @config }
{
  type: 'VariableReference',
  valueType: 'varIdentifier',
  identifier: 'config'
}
```

**In Template**:
```javascript
// [[Settings: {{config}}]]
{
  type: 'VariableReference',
  valueType: 'varInterpolation',
  identifier: 'config'
}
```

**In Path**:
```javascript
// [@config/file.txt]
{
  type: 'VariableReference',
  valueType: 'varIdentifier',
  identifier: 'config'
}
```

#### Directive: `@run [test]`

**Top-Level**:
```javascript
// @run [test]
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  meta: { /* no special flags */ }
}
```

**As Data Value**:
```javascript
// @data result = { cmd: @run [test] }
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  meta: { isDataValue: true }
}
```

**As RHS Reference**:
```javascript
// @text output = @run [test]
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  meta: { isRHSRef: true }
}
```

## Best Practices for AST Consumers

1. **Always check context indicators** before processing nodes
2. **Use helper functions** to encapsulate context detection logic
3. **Handle all valueType cases** for polymorphic nodes
4. **Test with nested structures** to ensure context handling works at all levels
5. **Document assumptions** about node contexts in your code

## Conclusion

Understanding context is crucial for correctly interpreting Meld's AST. While the reuse of node types provides consistency and modularity in the grammar, it requires AST consumers to be context-aware. This guide should serve as a reference for implementing robust AST processing that handles all the nuances of Meld's context-dependent node system.