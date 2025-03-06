---
layout: docs.njk
title: "@path Directive"
---

{% raw %}
# @path Directive

The `@path` directive defines filesystem path variables that can be used in `@embed` and `@run` commands.

## Syntax

```meld
@path identifier = "$HOMEPATH/path"
@path identifier = "$~/path"
@path identifier = "$PROJECTPATH/path"
@path identifier = "$./path"
```

Where:
- `identifier` is the variable name (must be a valid identifier)
- Path must start with either `$HOMEPATH`, `$~`, `$PROJECTPATH`, or `$.`
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
- Cannot contain `.` or `..` directory segments (use `$.` or `$~` instead)
- Raw absolute paths (e.g., `/usr/local/bin`) are not allowed
- Simple filenames with no slashes are allowed without special prefixes

## Special Path Variables

Meld provides two special path variables:

- `$HOMEPATH` or `$~`: Refers to the user's home directory
- `$PROJECTPATH` or `$.`: Refers to the current project root directory

All paths with slashes must be rooted in a $path variable (including global $HOMEPATH and $PROJECTPATH path variables).

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
- `INVALID_PATH_FORMAT`: Path with slashes that doesn't use `$.` or `$~`
- `CONTAINS_DOT_SEGMENTS`: Path contains `.` or `..` segments
- `RAW_ABSOLUTE_PATH`: Path is absolute but doesn't use `$.` or `$~`
- `INVALID_PATH`: Path is empty or malformed
- `NULL_BYTE`: Path contains null bytes

## Variables in Paths

Paths can include variables, which are resolved during execution:

```meld
@text dir = "docs"
@path docs = "$PROJECTPATH/{{dir}}"
```

## Notes

- Path variables cannot use field access or formatting
- All paths with slashes must be rooted in a $path variable (including global $HOMEPATH and $PROJECTPATH path variables)
- Relative paths are not allowed for security reasons
- Path variables are distinct from text and data variables
- In test mode, existence checks can be bypassed
{% endraw %}