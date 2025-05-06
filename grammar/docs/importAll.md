# Import All Directive

The `importAll` subtype imports all content from a source file.

## Syntax Variants

### Implicit Wildcard Import

```
@import [path/to/file.md]
```

This is the simplest form, where the imports list is omitted entirely. All content is imported.

### Explicit Wildcard Import

```
@import [*] from [path/to/file.md]
```

This explicitly uses the `*` wildcard to indicate importing all content.

## AST Structure

```typescript
{
  type: 'Directive',
  kind: 'import',
  subtype: 'importAll',
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: '*',
        valueType: 'import',
        isVariableReference: true
      }
    ],
    path: [
      // Path nodes - can include Text, PathSeparator, DotSeparator, VariableReference
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
    imports: '*',  // Always '*' for importAll, even with implicit syntax
    path: 'path/to/file.md'
  },
  meta: {
    path: {
      hasVariables: false
    }
  }
}
```

## Path Variations

### Static Path

```
@import [*] from [/absolute/path/to/file.md]
```

### Path Variable

```
@import [*] from [$path_var]
```

```typescript
{
  // ...other properties
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: '*',
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
    imports: '*',
    path: '$path_var'
  },
  meta: {
    path: {
      hasVariables: true
  }
}
```

### Text Variable

```
@import [*] from [{{text_var}}]
```

```typescript
{
  // ...other properties
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: '*',
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
    imports: '*',
    path: '{{text_var}}'
  },
  meta: {
    path: {
      hasVariables: true
    }
  }
}
```

### Mixed Variable Path

```
@import [*] from [$base_path/{{filename}}.md]
```

```typescript
{
  // ...other properties
  values: {
    imports: [
      {
        type: 'VariableReference',
        identifier: '*',
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
    imports: '*',
    path: '$base_path/{{filename}}.md'
  },
  meta: {
    path: {
      hasVariables: true
  }
}
```

## Important Notes

- The `imports` array will always contain a single `VariableReferenceNode` with identifier `*`, even when using the implicit syntax.
- The `path` array contains parsed path components representing the exact structure of the path.
- When a path contains both text and path variables, the `meta.path` object will track both variable types to indicate potential issues with mixing variable types.