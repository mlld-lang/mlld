# @path Directive

The `@path` directive defines filesystem path variables that can be used in `@embed` and `@run` commands.

## Syntax

```meld
@path identifier = "$HOMEPATH/path"
@path identifier = "$~/path"
@path identifier = "$PROJECTPATH/path"
@path identifier = "$./path"
@path identifier = "/absolute/path"
@path identifier = "relative/path"
@path identifier = "../parent/path"
@path identifier = "./current/path"
```

Where:
- `identifier` is the variable name (must be a valid identifier)
- Path segments are separated by forward slashes
- Path must be quoted (single, double, or backtick quotes)

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## Path Value Rules

- Must not be empty
- Cannot contain null bytes
- Any standard path format is allowed:
  - Absolute paths (e.g., `/usr/local/bin`) 
  - Relative paths (e.g., `path/to/file`)
  - Paths with dot segments (e.g., `./current` or `../parent`)
  - Paths with special variables (e.g., `$HOMEPATH/path`)

## Special Path Variables (Optional)

Meld provides special path variables for enhanced cross-platform portability:

- `$HOMEPATH` or `$~`: Refers to the user's home directory
- `$PROJECTPATH` or `$.`: Refers to the current project root directory

Using special path variables is recommended (but not required) for best cross-platform portability.

## Referencing Path Variables

Path variables are referenced using the `$identifier` syntax:

```meld
@path docs = "$PROJECTPATH/docs"
@embed [$docs/guide.md]
```

Path variables can be used:
- Inside square brackets `[...]` for paths and commands
- After a space in command arguments
- With additional path segments appended using `/`

## Examples

Basic path variables:
```meld
@path docs = "$PROJECTPATH/docs"
@path configs = "$PROJECTPATH/configs"
@path home = "$HOMEPATH/meld"
```

Using path variables in commands:
```meld
@path src = "$PROJECTPATH/src"
@run [ls -la $src]
```

Embedding files with path variables:
```meld
@path templates = "$PROJECTPATH/templates"
@embed [$templates/header.md]
```

Using path segments:
```meld
@path src = "$PROJECTPATH/src"
@embed [$src/components/button.js]
```

## Error Handling

The following errors are possible with path directives:
- `INVALID_PATH`: Path is empty or malformed
- `NULL_BYTE`: Path contains null bytes (security restriction)

## Variables in Paths

Paths can include variables, which are resolved during execution:

```meld
@text dir = "docs"
@path docs = "$PROJECTPATH/{{dir}}"
```

## Path Best Practices

- For cross-platform compatibility, use special path variables `$PROJECTPATH` and `$HOMEPATH`
- Use forward slashes for path separators (even on Windows)
- Be cautious when using absolute paths or parent directory references (`..`), as they may make your Meld files less portable
- Consider using path variables to encapsulate filesystem paths for better maintainability

## Notes

- Path variables cannot use field access or formatting
- Path variables are distinct from text and data variables
- In test mode, existence checks can be bypassed