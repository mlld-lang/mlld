# AST Context Guide

This guide documents how to interpret Mlld AST nodes based on their context. The Mlld grammar reuses node types across different contexts for modularity and consistency, which means the same node type can have different meanings depending on where it appears in the AST.

## Overview

### Philosophy of Context-Aware AST Design

Mlld's AST design prioritizes:
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

### CommandBase Nodes

CommandBase nodes appear within command directives to identify executable commands:

#### Security Authorization Context
- **Context**: Within `values.commandBases` array of run/exec directives
- **Purpose**: Identify executables for security authorization
- **Examples**: 
  - Simple: `{ command: "ls" }`
  - Script runner: `{ command: "npm run", script: "build", isScriptRunner: true }`
  - Package runner: `{ command: "npx", package: "prettier", isPackageRunner: true }`

#### Detection Patterns
```javascript
// Simple command detection
{ command: "grep" }

// Script runner detection (npm/yarn/pnpm run)
{ 
  command: "npm run", 
  script: "test",
  isScriptRunner: true 
}

// Special command patterns
{
  command: "python -m",
  module: "http.server"
}
```

### VariableReference Nodes

VariableReference nodes appear in many contexts with different `valueType` values:

#### `valueType: 'varIdentifier'`
- **Context**: Direct variable reference using `@` syntax
- **Examples**: `@myVar`, `@config.name`, `@list[0]`
- **Appears in**: 
  - Var values: `/var @x = { field: @myVar }`
  - Path contexts: `[@projectPath/file.md]`
  - Variable fields in add directive

#### `valueType: 'varInterpolation'`
- **Context**: Variable inside template interpolation using `{{}}` syntax
- **Examples**: `{{name}}`, `{{user.email}}`
- **Appears in**:
  - Template content: `:::Hello {{name}}!:::`
  - Quoted strings in templates

#### `valueType: 'identifier'`
- **Context**: Variable name in assignments (LHS)
- **Examples**: The `x` in `/var @x = ...`
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
  // In /var @results = { test: run [(cmd)] }
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
- **Example**: `/var @content = run [(echo "hello")]`

### Text Nodes

Text nodes represent literal text content in various contexts:

#### Template Text
- **Context**: Part of template content
- **Detection**: Parent is an array that represents template content
- **Identifying template arrays**: Contains mix of Text and VariableReference nodes with `valueType: 'varInterpolation'`

#### File Reference Segments
- **Context**: Part of file references and sections
- **Detection**: Within path/section nodes produced by angle-bracket syntax
- **Example**: The "folder" in `<folder/file.txt>`

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

#### File Reference Arrays
- **Contains**: Text, PathSeparator, VariableReference nodes
- **Context**: Angle-bracket file references and sections

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

### Var Directive Fields

**`values.value`** can contain:
- **Primitives**: strings, numbers, booleans, null (stored directly, not as node arrays)
- **Objects**: `{ type: 'object', properties: {...} }` with type discriminator
- **Arrays**: `{ type: 'array', items: [...] }` with type discriminator
- **Directive nodes**: Full directive with `meta.isDataValue: true`
- **Variable references**: With `valueType: 'varIdentifier'`
- **Template arrays**: Array of Text/VariableReference nodes

**Important**: The `/var` directive is the place where primitive values in objects/arrays are NOT wrapped in node arrays. This is because:
1. `/var` represents JavaScript data structures
2. Primitives in var contexts are literals without interpolation
3. Type discriminators (`type: 'object'`, `type: 'directive'`, etc.) provide the necessary type information
4. This design enables lazy evaluation of embedded directives

Example of var directive value structure:
```javascript
// /var @config = { name: "app", version: 1.0, test: run [(npm test)] }
{
  "type": "object",
  "properties": {
    "name": "app",              // Direct string, not node array
    "version": 1.0,             // Direct number, not node array
    "test": {
      "type": "directive",      // Type discriminator
      "directive": { /* ... */ }
    }
  }
}
```

### Template/Text Fields

**`values.content`** can contain:
- **Template array**: Mix of Text and VariableReference nodes
- **Single Text node**: For simple content

### Path-related Fields

**`values.path`** in file/section nodes (angle-bracket syntax):
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
| `isTemplateContent` | Content uses template syntax `::...::` | Template detection |
| `hasExtension` | Path includes file extension | Path validation |
| `isAbsolute` | Path is absolute | Path validation |

### Directive-Specific Meta

**Run/Exec Directive**:
- `language`: Programming language for code blocks
- `isMultiLine`: Command spans multiple lines
- `commandCount`: Number of command bases detected
- `hasScriptRunner`: Contains npm/yarn/pnpm run commands

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

**In Var Value**:
```javascript
// /var @x = { setting: @config }
{
  type: 'VariableReference',
  valueType: 'varIdentifier',
  identifier: 'config'
}
```

**In Template**:
```javascript
// ::Settings: {{config}}::
{
  type: 'VariableReference',
  valueType: 'varInterpolation',
  identifier: 'config'
}
```

**In File Reference**:
```javascript
// <@root/config/file.txt>
{
  type: 'VariableReference',
  valueType: 'varIdentifier',
  identifier: 'config'
}
```

#### Directive: `run [(test)]`

**Top-Level**:
```javascript
// run [(test)]
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  meta: { /* no special flags */ }
}
```

**As Var Value**:
```javascript
// /var @result = { cmd: run [(test)] }
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  meta: { isDataValue: true }
}
```

**As RHS Reference**:
```javascript
// /var @output = run [(test)]
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  meta: { isRHSRef: true }
}
```

## Working with Command Bases

### Accessing Command Bases

```typescript
function getCommandBases(directive: RunDirective): CommandBase[] {
  return directive.values.commandBases || [];
}

function hasScriptRunner(directive: RunDirective): boolean {
  return directive.meta.hasScriptRunner || false;
}

function getFirstCommand(directive: RunDirective): string | undefined {
  return directive.values.commandBases?.[0]?.command;
}
```

### Security Authorization Example

```typescript
async function authorizeRunDirective(directive: RunDirective) {
  const commandBases = directive.values.commandBases || [];
  
  for (const base of commandBases) {
    // Different authorization for different command types
    if (base.isScriptRunner) {
      await checkScriptPermission(base.command, base.script);
    } else if (base.isPackageRunner) {
      await checkPackagePermission(base.package);
    } else {
      await checkExecutablePermission(base.command);
    }
  }
}
```

## Best Practices for AST Consumers

1. **Always check context indicators** before processing nodes
2. **Use helper functions** to encapsulate context detection logic
3. **Handle all valueType cases** for polymorphic nodes
4. **Test with nested structures** to ensure context handling works at all levels
5. **Document assumptions** about node contexts in your code
6. **Check commandBases array** when processing run/exec directives for security

## Conclusion

Understanding context is crucial for correctly interpreting Mlld's AST. While the reuse of node types provides consistency and modularity in the grammar, it requires AST consumers to be context-aware. This guide should serve as a reference for implementing robust AST processing that handles all the nuances of Mlld's context-dependent node system.

## New Node Types (Block Syntax Epic)

### ExeBlock Nodes

Exe blocks (`/exe @f() = [...]`) parse as:

```javascript
{
  type: 'Directive',
  kind: 'exe',
  subtype: 'exeBlock',
  source: 'block',
  values: {
    identifier: [...],      // VariableReference array
    params: [...],          // Parameter nodes
    statements: [...],      // Array of statement nodes
    return: {               // ExeReturn structure
      type: 'ExeReturn',
      values: [...],        // Return value nodes
      meta: { hasValue: true }
    }
  },
  meta: {
    statementCount: number,
    hasReturn: boolean
  }
}
```

### For Block Metadata

For blocks use `meta.actionType` discriminator:

```javascript
{
  kind: 'for',
  subtype: 'for',
  values: {
    action: [...]  // Array when block mode
  },
  meta: {
    actionType: 'block' | 'single',
    block: {
      statementCount: number  // When actionType='block'
    }
  }
}
```

### While Pipeline Stages

While loops in pipelines:

```javascript
{
  type: 'whileStage',
  cap: number,
  rateMs: number | null,
  processor: VariableReferenceNode,
  rawIdentifier: 'while',
  meta: { hasRate: boolean }
}
```

### Control Literals

Done and continue literals:

```javascript
{
  type: 'Literal',
  valueType: 'done' | 'continue',
  value: BaseMlldNode[]  // May be empty or contain expression
}
```

Type guards available in `core/types/control.ts`:
- `isDoneLiteral(node)`: checks for done
- `isContinueLiteral(node)`: checks for continue

## Normalization Notes

- Tail modifiers (e.g., `with { ... }`) normalize to a unified `withClause` on directives and exec invocations.
- Exec calls `@fn(...)` parse as distinct `ExecInvocation` nodes; plain `@fn` is a `VariableReference`.
- Quote/template syntaxes normalize to arrays for interpolation; interpreter handles them via `interpolate()`.
- Exe blocks normalize to `subtype: 'exeBlock'` with statement array and optional return.
- For blocks set `meta.actionType` to discriminate block vs single-action mode.
