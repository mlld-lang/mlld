# @import Directive

The `@import` directive allows you to import variables and commands from other mlld files.

## Syntax

File imports:
```mlld
@import { * } from "path/to/file.mld"           # Import all variables
@import { var1, var2 } from "path/to/file.mld"  # Import specific variables
@import { var1 as alias1, var2 } from "path/to/file.mld" # Import with aliases
```

Module imports:
```mlld
@import { func1, func2 } from @author/module    # Import from registry module
```


Where:
- `path.mld` is the path to the mlld file to import
- `var1`, `var2` are variable names to import
- `alias1` is an alternative name to use for the imported variable

## Import Behavior

When you import a mlld file:
- All variables and commands defined in the imported file become available
- Text content from the imported file is NOT included
- Imports should be placed at the top of your file
- Imported files can import other files (nesting is supported)
- Circular imports are detected and will generate errors

## Supported Variable Types

The directive can import all types of variables:
- Text variables
- Data variables
- Path variables
- Command variables

## Path Specification

The path can be:
- A relative path from the importing file: `"./utils.mld"`
- An absolute path: `"/home/user/project/utils.mld"`
- A module reference (no quotes): `@author/module`

## Selective Imports and Aliases

Specify selective imports using curly braces:
```mlld
@import { var1, var2, var3 } from "path.mld"
```

Import with aliases to avoid name conflicts:
```mlld
@import { var1 as myVar1, var2 as myVar2 } from "path.mld"
```

## Examples

Basic import:
```mlld
@import { * } from "./utils.mld"
```

Selective import:
```mlld
@import { textVar, dataVar } from "./lib/utils.mld"
```

Import with aliases:
```mlld
@import { textVar as myText, dataVar as myData } from "./lib/utils.mld"
```

Module import:
```mlld
@import { http, utils } from @mlld/stdlib
```

Using imported variables:
```mlld
@import { importedName, importedCommand } from "./utils.mld"

@text message = [[Hello, {{importedName}}!]]
@run @importedCommand(@param)
```

## Error Handling

The implementation handles various error scenarios:
- File not found errors
- Circular import errors
- Validation errors (syntax, path constraints)
- Variable not found errors
- Parsing errors in imported files

## Notes

- Imported files must be valid mlld files
- Missing import files will generate fatal errors
- Imports should generally be placed at the top of your file
- Imported files can have their own imports (nesting is supported)
- Variables with the same name will be overwritten (last imported wins)
- Circular imports are detected and will generate errors