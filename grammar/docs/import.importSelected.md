# Import Selected Directive

The `importSelected` subtype allows importing specifically selected items from a source file.

## Syntax Variants

### Single Item Import

```
@import [name] from [path/to/file.md]
```

This imports a single named item from the source file.

### Multiple Item Import

```
@import [name1, name2, name3] from [path/to/file.md]
```

This imports multiple named items from the source file.

## AST Structure

### Single Import

```typescript
{
  type: 'Directive',
  kind: 'import',
  subtype: 'importSelected',
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: 'name',
        valueType: 'import',
        isVariableReference: true
      }
    ],
    path: [
      { type: 'Text', content: 'path' },
      { type: 'PathSeparator', value: '/' },
      { type: 'Text', content: 'to' },
      { type: 'PathSeparator', value: '/' },
      { type: 'Text', content: 'file' },
      { type: 'DotSeparator', value: '.' },
      { type: 'Text', content: 'md' }
    ]
  },
  raw: {
    imports: 'name',
    path: 'path/to/file.md'
  },
  meta: {
    isAbsolute: false,
    hasVariables: false,
    hasTextVariables: false,
    hasPathVariables: false,
    isRelativeToCwd: true
  }
}
```

### Multiple Imports

```typescript
{
  type: 'Directive',
  kind: 'import',
  subtype: 'importSelected',
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: 'name1',
        valueType: 'import',
        isVariableReference: true
      },
      {
        type: 'VariableReference',
        identifier: 'name2',
        valueType: 'import',
        isVariableReference: true
      },
      {
        type: 'VariableReference',
        identifier: 'name3',
        valueType: 'import',
        isVariableReference: true
      }
    ],
    path: [
      { type: 'Text', content: 'path' },
      { type: 'PathSeparator', value: '/' },
      { type: 'Text', content: 'to' },
      { type: 'PathSeparator', value: '/' },
      { type: 'Text', content: 'file' },
      { type: 'DotSeparator', value: '.' },
      { type: 'Text', content: 'md' }
    ]
  },
  raw: {
    imports: 'name1, name2, name3',
    path: 'path/to/file.md'
  },
  meta: {
    isAbsolute: false,
    hasVariables: false,
    hasTextVariables: false,
    hasPathVariables: false,
    isRelativeToCwd: true
  }
}
```

## Path Variations

### Static Path

```
@import [name] from [/absolute/path/to/file.md]
```

The AST for an absolute path will have `isAbsolute: true` in the `meta` object.

### Path Variable

```
@import [name] from [$path_var]
```

```typescript
{
  // ...other properties
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: 'name',
        valueType: 'import',
        isVariableReference: true
      }
    ],
    path: [
      {
        type: 'VariableReference',
        identifier: 'path_var',
        valueType: 'path',
        isVariableReference: true
      }
    ]
  },
  raw: {
    imports: 'name',
    path: '$path_var'
  },
  meta: {
    isAbsolute: false,
    hasVariables: true,
    hasTextVariables: false,
    hasPathVariables: true,
    isRelativeToCwd: false
  }
}
```

### Text Variable

```
@import [name] from [{{text_var}}]
```

```typescript
{
  // ...other properties
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: 'name',
        valueType: 'import',
        isVariableReference: true
      }
    ],
    path: [
      {
        type: 'VariableReference',
        identifier: 'text_var',
        valueType: 'text',
        isVariableReference: true
      }
    ]
  },
  raw: {
    imports: 'name',
    path: '{{text_var}}'
  },
  meta: {
    isAbsolute: false,
    hasVariables: true,
    hasTextVariables: true,
    hasPathVariables: false,
    isRelativeToCwd: true,
    variable_warning: true
  }
}
```

### Mixed Variable Path

```
@import [name] from [$base_path/{{filename}}.md]
```

```typescript
{
  // ...other properties
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: 'name',
        valueType: 'import',
        isVariableReference: true
      }
    ],
    path: [
      {
        type: 'VariableReference',
        identifier: 'base_path',
        valueType: 'path',
        isVariableReference: true
      },
      { type: 'PathSeparator', value: '/' },
      {
        type: 'VariableReference',
        identifier: 'filename',
        valueType: 'text',
        isVariableReference: true
      },
      { type: 'DotSeparator', value: '.' },
      { type: 'Text', content: 'md' }
    ]
  },
  raw: {
    imports: 'name',
    path: '$base_path/{{filename}}.md'
  },
  meta: {
    isAbsolute: false,
    hasVariables: true,
    hasTextVariables: true,
    hasPathVariables: true,
    isRelativeToCwd: false,
    variable_warning: true
  }
}
```

## Important Notes

- The `imports` array contains one `VariableReferenceNode` for each specific item being imported.
- Each import name is separated by commas in the original syntax, but parsed into individual nodes in the AST.
- The parser preserves the raw string of all imports in the `raw.imports` property.
- When using path variables with specific imports, the import resolution happens at runtime when the path variable value is known.