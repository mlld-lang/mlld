# Import Directive

## Overview

The `import` directive allows importing content from external files or from variables containing file paths. It's primarily used to include content from other Meld documents or to reference external resources.

## Subtypes

The import directive has two subtypes:

- [importAll](./import.importAll.md): Imports all content from a source file
- [importSelected](./import.importSelected.md): Imports specifically selected items from a source file

## Common Structure

All import directives share this basic structure in the AST:

```typescript
{
  type: 'Directive',
  kind: 'import',
  subtype: 'importAll' | 'importSelected',
  values: {
    imports: VariableReferenceNode[],  // What is being imported
    path: MeldNode[]                   // Where it's being imported from
  },
  raw: {
    imports: string,  // Raw text of imports
    path: string      // Raw text of path
  },
  meta: {
    path: {
      isAbsolute: boolean,       // Path starts with /
      hasVariables: boolean,     // Contains any variables
      hasTextVariables: boolean, // Contains {{var}} syntax
      hasPathVariables: boolean, // Contains $var syntax
      isRelative: boolean        // Relative to current working dir
    }
  }
}
```

## Path Handling

Import paths can be specified in multiple ways:

- Static paths: `@import [path/to/file.md]`
- Path variables: `@import [imports] from [$path_var]`
- Text variables: `@import [imports] from [{{text_var}}]`
- Mixed variables: `@import [imports] from [$base_path/{{filename}}.md]`

Each path form has different metadata flags in the `meta` object. See the subtype documentation for detailed examples.

## See Also

For detailed implementation specifics, refer to the subtype documentation:

- [importAll](./import.importAll.md)
- [importSelected](./import.importSelected.md)