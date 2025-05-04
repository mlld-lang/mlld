# Data Directive

The Data directive is used to define and manipulate structured data variables in Meld. It supports various ways to assign data to variables, including JSON literals, embedding from files, and running commands.

## Syntax

```
@data variable = { "key": "value" }      // Assignment with JSON object
@data variable = [1, 2, 3]               // Assignment with JSON array
@data content = @embed "path/to/file.json" // Embed from file
@data result = @run [echo '{"key": "value"}'] // Run command
```

## Subtypes

The Data directive has one primary subtype:

1. dataAssignment - Direct assignment of a value to a variable: `@data var = value`

## AST Structure

Data directives follow this common structure:

```typescript
interface DataDirectiveNode {
  type: 'Directive';
  kind: 'data';
  subtype: 'dataAssignment';
  values: {
    identifier: VariableReferenceNode[];
    value: (TextNode | VariableReferenceNode)[]; // Parsed as JSON later
  };
  raw: {
    identifier: string;
    value: string;
  };
  meta: {
    // Data-specific metadata
  };
}
```

## Data Assignment Variants

The `dataAssignment` subtype supports several variants based on the source of content:

1. JSON literal: `@data var = { "key": "value" }`
2. Embed source: `@data var = @embed "path/to/file.json"`
3. Run command: `@data var = @run [echo '{"key": "value"}']`

Each variant can reference another directive as its source:

```typescript
interface DataAssignmentDirectiveNode {
  // Standard directive structure
  // ...
  
  // If assigned from another directive
  sourceDirective?: {
    directive: RunDirectiveNode | EmbedDirectiveNode; // The actual directive
    type: 'run' | 'embed';                           // Type discriminator
  }
}
```

## Variable References

Data directives can use two types of variable references:
- Path variables in commands and embeds: `$var` - Constrained by security rules
- Text variables in JSON string literals: `{{var}}` - General string interpolation

## Examples

Simple assignment:
```
@data config = { "server": "localhost", "port": 8080 }
```

Using embed:
```
@data userData = @embed "user-config.json"
```

Using run:
```
@data systemInfo = @run [uname -a | jq -R '{system: .}']
```

## Future Features (Planned)

### Nested Directive Support

In future versions, we plan to support embedding directives within structured data:

```
@data complexConfig = { 
  "content": @embed "file.md",
  "systemInfo": @run [echo "hello world" | jq -R '{output: .}']
}
```

This would require a more complex AST structure:

```typescript
// For direct values in structured data
interface DataValueNode {
  type: 'DataValue';
  valueType: 'string' | 'number' | 'boolean' | 'null' | 'directive';
  value: string | number | boolean | null | DirectiveNode;
}

// For object properties
interface DataObjectPropertyNode {
  type: 'DataObjectProperty';
  key: string;
  value: DataValueNode | DataObjectNode | DataArrayNode;
}

// For object structures
interface DataObjectNode {
  type: 'DataObject';
  properties: DataObjectPropertyNode[];
}

// For array structures
interface DataArrayNode {
  type: 'DataArray';
  items: (DataValueNode | DataObjectNode | DataArrayNode)[];
}
```

This recursive structure would allow directives to be embedded at any level within objects and arrays while maintaining each directive's full structure and behavior.