# Interpolatable Values AST Specification

## Breaking change

This change will break any code that depends on the old `structured` property.

## Architectural Approach

Based on review of the existing codebase and usage patterns, we are implementing **Option 2**:

- Standardize on `values` as the property name for AST node arrays
- Ensure all directive types follow this pattern consistently
- Enable future phasing out of redundant properties as the codebase evolves

## Implementation Checklist

- [x] Debug logging improvements in grammar
- [x] Basic path interpolation structure
- [x] Special path variable recognition
- [x] Path base normalization
- [x] Rename `interpolatedValue` to `values` for consistency and simplicity
- [x] Add `values` arrays to run directives
- [x] Add `values` arrays to embed directives
- [x] Ensure consistent node structure across all directive types
- [x] Update ResolutionService to use `values` when available
- [x] Update type definitions and type guards
- [x] Add new tests specifically for `values` arrays
- [x] Verify services can fall back to `raw` when needed

Remaining Issues:
- [ ] Fix variable type handling in path variables (current blocker)
- [ ] Complete import path interpolation integration
- [ ] Fix failing tests to expect new AST structure

## Path Variable Handling Issue

The current blocker is related to how path variables are handled in the grammar. The issue manifests in two ways:

1. **Node Type Mismatch**: Path variables should be represented as `VariableReference` nodes with specific properties:
   ```typescript
   {
     type: 'VariableReference',
     valueType: 'path',
     identifier: 'path',
     isSpecial: false,
     isVariableReference: true
   }
   ```
   However, they are currently not being created with the correct structure.

2. **Raw Path Preservation**: The grammar needs to preserve path variables in both:
   - The raw path string (e.g., `$VAR` or `${path}`)

This affects both import and embed directives since they share the same path handling logic.

The fix requires:
1. Updating the `PathVar` rule in the grammar
2. Modifying the `validatePath` helper
3. Ensuring path normalization preserves variables


## Overview

This specification defines a consistent approach for implementing interpolatable content within the Meld AST. This standardizes how the parser handles content that may contain variables across different directive types.

## Core Concept

"Interpolatable values" are content segments that:
1. May contain a mix of literal text and variable references
2. Need to be resolved at runtime based on variable context
3. Should be parsed into distinct typed nodes to enable fine-grained resolution

## AST Structure

### InterpolatableValue Array

For relevant directives, the AST will include a `values` array of nodes, where each node is one of:

1. **Text Node**
   ```typescript
   {
     "type": "Text",
     "content": string,
     "location": SourceLocation,
     "nodeId": string
   }
   ```

2. **Variable Reference Node**
   ```typescript
   {
     "type": "VariableReference",
     "valueType": "text" | "data" | "path",
     "isVariableReference": true,
     "identifier": string,
     "fields"?: Array<FieldAccess | ArrayAccess>,
     "format"?: string,
     "isSpecial"?: boolean,
     "location": SourceLocation,
     "nodeId": string
   }
   ```

## Implementation By Directive Type

### 1. Path Values (Embed & Path Directives)

Path values will maintain their existing `raw` and `normalized` properties while adding `values`:

```typescript
{
  "raw": string,                // Original unparsed path (e.g., "$HOMEPATH/{{subdir}}/file.md")
  "normalized": string,         // Path after initial normalization (if any)
  "values": [                   // Array of parsed path components
    { "type": "VariableReference", "valueType": "path", "identifier": "HOMEPATH", "isSpecial": true, ... }, // Example Special Variable
    { "type": "PathSeparator", "value": "/" },                        // Example Separator
    { "type": "VariableReference", "valueType": "text", "identifier": "subdir", ... },      // Example Text Variable
    { "type": "PathSeparator", "value": "/" },                        // Example Separator
    { "type": "Literal", "value": "file.md" }                         // Example Literal Segment
    // ... potentially other node types like Interpolation if needed
  ],
}
```

### 2. Import Directives

Import directives will have path objects with the same structure as above:

```typescript
{
  "directive": {
    "kind": "import",
    "imports": [...],           // Import items as before
    "path": {
      "raw": string,
      "normalized": string,
      "values": [...],           // Array of parsed path components
    },
    "subtype": "importStandard" | "importAll" | "importNamed" | "importPath"
  },
  "type": "Directive",
  "location": {...},
  "nodeId": string
}
```

### 3. Embed Directives

Embed directives with path sources will use the path structure:

```typescript
{
  "directive": {
    "kind": "embed",
    "subtype": "embedPath",
    "path": {
      "raw": string,
      "normalized": string,
      "values": [...],           // Array of parsed path components
    },
    "section"?: string,
    "options"?: {}
  },
  "type": "Directive",
  "location": {...},
  "nodeId": string
}
```

Embed directives with template content will also support interpolation:

```typescript
{
  "directive": {
    "kind": "embed",
    "subtype": "embedTemplate",
    "content": [...],           // Already an array of nodes
    "isTemplateContent": true,
    "options"?: {}
  },
  "type": "Directive",
  "location": {...},
  "nodeId": string
}
```

### 4. Run Directives

Run directives will use the same pattern for command content:

```typescript
{
  "directive": {
    "kind": "run",
    "subtype": "runCommand",
    "command": string,            // Original command string
    "values": [...],           // Array of parsed nodes
    "outputVariable": string,
    "errorVariable": string
  },
  "type": "Directive",
  "location": {...},
  "nodeId": string
}
```

## Variable Type Consistency

Variable references will have their `valueType` set according to these rules:

1. `"path"`: For path variables (`$var_name`) and special path variables (`$HOMEPATH`, `$~`, etc.)
2. `"text"`: For text variables with double-brace syntax (`{{var_name}}`)
3. `"data"`: For data variables with JSON path syntax (`{{var_name.field}}` or `{{var_name[index]}}`)

## Implementation Notes

1. **Special Cases**: Path variables that use the `$` prefix should be properly identified as path variables, not text variables.

2. **Naming**: Though previous work used `interpolatedValue`, the property should be named `values` for simplicity and clarity while still conveying the purpose.

3. **Escaping**: The parser should properly handle escaped variable references.

4. **Test Updates**: Tests should be updated to expect nodes with `values` arrays while maintaining assertions on existing properties.

## Examples

### Path Variable in Import

```
import [file] from [$path_var/{{subdir}}/index.md]
```

Produces:

```json
{
  "directive": {
    "kind": "import",
    "imports": [{"name": "file", "alias": null}],
    "path": {
      "raw": "$path_var/{{subdir}}/index.md",
      "normalized": "$path_var/{{subdir}}/index.md",
      "values": [
        {
          "type": "VariableReference",
          "valueType": "path", 
          "isVariableReference": true,
          "identifier": "path_var",
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "PathSeparator",
          "value": "/",
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "VariableReference",
          "valueType": "text",
          "isVariableReference": true,
          "identifier": "subdir",
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "PathSeparator",
          "value": "/",
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "Literal",
          "value": "index.md",
          "location": {...},
          "nodeId": "..."
        }
      ],
    },
    "subtype": "importStandard"
  },
  "type": "Directive",
  "location": {...},
  "nodeId": "..."
}
```

### Special Path Variable in Embed

```
@embed [$./{{filename}}.md]
```

Produces:

```json
{
  "directive": {
    "kind": "embed",
    "subtype": "embedPath",
    "path": {
      "raw": "$./{{filename}}.md",
      "normalized": "$PROJECTPATH/{{filename}}.md",
      "values": [
        {
          "type": "VariableReference",
          "valueType": "path",
          "isVariableReference": true,
          "identifier": ".",
          "isSpecial": true,
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "PathSeparator",
          "value": "/",
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "VariableReference",
          "valueType": "text",
          "isVariableReference": true,
          "identifier": "filename",
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "PathSeparator",
          "value": ".",
          "location": {...},
          "nodeId": "..."
        },
        {
          "type": "Literal",
          "value": "md",
          "location": {...},
          "nodeId": "..."
        }
      ],
    }
  },
  "type": "Directive",
  "location": {...},
  "nodeId": "..."
}
```

### Run Command with Variables

```
@run [ls {{dir}}/*.{{ext}}]
```

Produces:

```json
{
  "directive": {
    "kind": "run",
    "subtype": "runCommand",
    "command": "ls {{dir}}/*.{{ext}}",
    "values": [
      {
        "type": "Text",
        "content": "ls ",
        "location": {...},
        "nodeId": "..."
      },
      {
        "type": "VariableReference",
        "valueType": "text",
        "isVariableReference": true,
        "identifier": "dir",
        "location": {...},
        "nodeId": "..."
      },
      {
        "type": "Text",
        "content": "/*.",
        "location": {...},
        "nodeId": "..."
      },
      {
        "type": "VariableReference",
        "valueType": "text",
        "isVariableReference": true,
        "identifier": "ext",
        "location": {...},
        "nodeId": "..."
      }
    ],
    "outputVariable": "stdout",
    "errorVariable": "stderr"
  },
  "type": "Directive",
  "location": {...},
  "nodeId": "..."
}
```
