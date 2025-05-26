# @import Directive

The `@import` directive allows you to import variables and commands from other Mlld files.

## Syntax

Modern syntax:
```mlld
@import [path.mld]                           # Import all variables
@import [*] from [path.mld]                  # Import all variables (equivalent)
@import [var1, var2] from [path.mld]        # Import specific variables
@import [var1 as alias1, var2] from [path.mld] # Import with aliases
```

Legacy syntax (also supported):
```mlld
@import path="path.mld"                     # Import all variables
@import path="path.mld" imports=[var1, var2] # Import specific variables
```

Where:
- `path.mld` is the path to the Mlld file to import
- `var1`, `var2` are variable names to import
- `alias1` is an alternative name to use for the imported variable

## Import Behavior

When you import a Mlld file:
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
- An absolute path using `$HOMEPATH` or `$PROJECTPATH`
- A path variable: `@import [$utils]`

## Selective Imports and Aliases

Specify selective imports using a comma-separated list:
```mlld
@import [var1, var2, var3] from [path.mld]
```

Import with aliases to avoid name conflicts:
```mlld
@import [var1 as myVar1, var2 as myVar2] from [path.mld]
```

Alternative alias syntax with colon:
```mlld
@import [var1:myVar1, var2:myVar2] from [path.mld]
```

## Examples

Basic import:
```mlld
@import ["$PROJECTPATH/utils.mld"]
```

Import with path variables:
```mlld
@path lib = "$PROJECTPATH/lib"
@import [$lib/utils.mld]
```

Selective import:
```mlld
@import [textVar, dataVar] from [$lib/utils.mld]
```

Import with aliases:
```mlld
@import [textVar as myText, dataVar as myData] from [$lib/utils.mld]
```

Using imported variables:
```mlld
@import ["$PROJECTPATH/utils.mld"]

@text message = `Hello, {{importedName}}!`
@run [$importedCommand({{param}})]
```

## Error Handling

The implementation handles various error scenarios:
- File not found errors
- Circular import errors
- Validation errors (syntax, path constraints)
- Variable not found errors
- Parsing errors in imported files

## Notes

- Imported files must be valid Mlld files
- Missing import files will generate fatal errors
- Imports should generally be placed at the top of your file
- Imported files can have their own imports (nesting is supported)
- Variables with the same name will be overwritten (last imported wins)
- Circular imports are detected and will generate errors