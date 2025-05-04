# Path Directive

The `@path` directive in Meld is used to define filesystem path variables that can be referenced in other directives like `@add` and `@run`. It provides a way to encapsulate filesystem paths and enhance cross-platform portability through special path variables.

## Syntax

```meld
@path identifier = "path_value"
```

## Subtypes

The Path directive has one main subtype:

1. [pathAssignment](./pathAssignment.md) - Assignment of a path value to a variable: `@path var = "path/value"`

Where:
- `identifier` is a valid variable name (must start with a letter or underscore, followed by letters, numbers, or underscores)
- `path_value` is a quoted string containing a filesystem path, which may include special variables

## Path Values

Path values in Meld follow specific formatting rules:
- Must be a quoted string (single, double, or backtick quotes)
- Forward slashes (`/`) are used as separators
- May include special variables like `$HOMEPATH`, `$~`, `$PROJECTPATH`, or `$.`
- May include text interpolation with `${variable_name}`
- May include path variables with `$variable_name` syntax

## AST Structure

The Path directive has a simpler structure compared to other directives as it consists of just an identifier and a path value:

```typescript
interface PathDirectiveNode extends DirectiveNode {
  kind: 'path';
  values: {
    // The identifier being defined
    identifier: Identifier[];
    
    // The path being assigned
    path: PathValueNode[];
    
    // Raw text representations
    raw: {
      identifier: string;
      path: string;
    };
  };
}
```

The `PathValueNode` can be one of:
- `StringLiteralNode` - A simple string path
- `InterpolatedStringNode` - A path with variable interpolation
- `VariableReferenceNode` - A reference to another path variable

## Example AST

For the following Meld code:

```meld
@path docs = "$PROJECTPATH/documentation"
```

The AST would look like:

```json
{
  "kind": "path",
  "values": {
    "identifier": [
      {
        "type": "identifier",
        "value": "docs"
      }
    ],
    "path": [
      {
        "type": "string",
        "value": "$PROJECTPATH/documentation",
        "components": [
          {
            "type": "specialVariable",
            "value": "PROJECTPATH"
          },
          {
            "type": "text",
            "value": "/documentation"
          }
        ]
      }
    ],
    "raw": {
      "identifier": "docs",
      "path": "$PROJECTPATH/documentation"
    }
  }
}
```

## Special Considerations

- Path directives require validation to ensure proper path formatting and security restrictions.
- Special path variables (`$HOMEPATH`, `$PROJECTPATH`) are automatically recognized and processed.
- Path variables are distinct from text and data variables, though they share some syntax.
- Path variables can be referenced using `$identifier` syntax in other directives.
- Path variables cannot use field access or formatting like text variables can.