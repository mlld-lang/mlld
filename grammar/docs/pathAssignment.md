# Path Assignment

The Path Assignment form of the `@path` directive is used to define path variables that can be referenced in other directives.

## Syntax

```mlld
@path identifier = "path_value"
```

Where:
- `identifier` is a valid variable name
- `path_value` is a quoted string representing a filesystem path

## Examples

```mlld
@path docs = "$PROJECTPATH/documentation"
@path config = "$HOMEPATH/config/mlld"
@path templates = "$./templates"
@path userFiles = "$~/documents/mlld/files"
```

## AST Structure

The Path Assignment AST structure consists of an identifier and a path value:

```typescript
interface PathAssignmentNode extends DirectiveNode {
  kind: 'path';
  values: {
    // The identifier being assigned
    identifier: IdentifierNode[];
    
    // The path value being assigned
    path: PathValueNode[];
    
    // Raw text representations
    raw: {
      identifier: string;
      path: string;
    };
  };
}
```

## Path Value Types

The Path directive's `path` value can contain:

1. `StringLiteralNode` - A simple string path:
   ```mlld
   @path docs = "/absolute/path"
   ```

2. `InterpolatedStringNode` - A path with variable interpolation:
   ```mlld
   @path docs = "$PROJECTPATH/${folder}/docs"
   ```

3. `VariableReferenceNode` - A reference to another path variable:
   ```mlld
   @path backup = "$mainPath/backup"
   ```

## Path Validation

Path values are validated to ensure they follow security rules:
- Must not be empty
- Should start with a special path variable for portability
- Cannot contain null bytes
- Cannot use relative path references (../) outside test contexts

## Example AST Output

For the following Mlld code:

```mlld
@path docs = "$PROJECTPATH/documentation"
```

The AST output would be:

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

For a path with variable interpolation:

```mlld
@path config = "$HOMEPATH/${configDir}/settings"
```

The AST output would be:

```json
{
  "kind": "path",
  "values": {
    "identifier": [
      {
        "type": "identifier",
        "value": "config"
      }
    ],
    "path": [
      {
        "type": "interpolated",
        "value": "$HOMEPATH/${configDir}/settings",
        "components": [
          {
            "type": "specialVariable",
            "value": "HOMEPATH"
          },
          {
            "type": "text",
            "value": "/"
          },
          {
            "type": "variable",
            "value": "configDir"
          },
          {
            "type": "text",
            "value": "/settings"
          }
        ]
      }
    ],
    "raw": {
      "identifier": "config", 
      "path": "$HOMEPATH/${configDir}/settings"
    }
  }
}
```