# Import Directive

## Overview

The `import` directive allows importing content from external files or from variables containing file paths. It's primarily used to include content from other Meld documents or to reference external resources.

## Syntax

```
@import { var1, var2 } from "path/to/file.meld"
@import { * } from "path/to/file.meld"
@import { var1 as alias1 } from "$pathVariable"
```

## Subtypes

The import directive has two subtypes:

- [importAll](./importAll.md): Imports all content from a source file
- [importSelected](./importSelected.md): Imports specifically selected items from a source file

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

- Static paths: `@import { * } from "path/to/file.md"`
- Path variables: `@import { imports } from "$path_var"`
- Text variables: `@import { imports } from "path/to/{{text_var}}.md"`
- Mixed variables: `@import { imports } from "$base_path/{{filename}}.md"`

Each path form has different metadata flags in the `meta` object. See the subtype documentation for detailed examples.

## Variable Reference Syntax

Import paths can use two types of variable references:
- Path variables: `$var` - Constrained by security rules to be within allowed paths
- Text variables: `{{var}}` - General string interpolation

This dual syntax approach is intentional and serves security purposes:
- `$var` clearly indicates a path variable that must adhere to security constraints
- `{{var}}` indicates general text interpolation


## See Also

For detailed implementation specifics, refer to the subtype documentation:

- [importAll](./importAll.md)
- [importSelected](./importSelected.md)