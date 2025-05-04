# Data Directive

The Data directive is used to define and manage structured data in Meld. It supports various types of values including primitives, objects, arrays, and nested directives for complex data structures.

## Syntax

```
@data variable = { "key": "value" }      // Assignment with JSON object
@data variable = [1, 2, 3]               // Assignment with JSON array
@data content = @add "path/to/file.json" // Add from file
@data result = @run [echo '{"key": "value"}'] // Run command
@data complex = {                        // Object with nested directives
  "content": @add "file.md",
  "systemInfo": @run [echo "hello world" | jq]
}
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
    value: DataValue; // Can be primitive, object, array, or directive
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

## Data Value Types

The `DataValue` type is recursive and can contain:

```typescript
type DataValue = 
  | ContentNodeArray // String literals, numbers, booleans represented as content nodes
  | DataObjectValue  // Objects with nested properties
  | DataArrayValue   // Arrays with nested items
  | DirectiveNode;   // Nested directive (add, run, etc.)

interface DataObjectValue {
  type: 'object';
  properties: {
    [key: string]: DataValue; // Each property can be any data value
  };
}

interface DataArrayValue {
  type: 'array';
  items: DataValue[]; // Each item can be any data value
}
```

## Nested Directives

Data directives support a powerful "directive nesting" feature, where other directives can be directly nested:

1. As the direct value of a data variable:
```
@data content = @add "file.json"
```

2. As properties within objects:
```
@data config = {
  "content": @add "file.md",
  "result": @run [echo "hello"]
}
```

3. As items within arrays:
```
@data results = [
  @run [command1],
  @run [command2],
  "static value"
]
```

### AST Structure for Nested Directives

```typescript
// Example of a data directive with a nested embed directive
{
  type: 'Directive',
  kind: 'data',
  subtype: 'dataAssignment',
  values: {
    identifier: [/* Variable reference node */],
    value: {
      // Full directive node structure
      type: 'Directive',
      kind: 'add',
      subtype: 'addPath',
      values: {
        path: [/* Path nodes */]
      },
      // ...rest of add directive
    }
  },
  // ...rest of data directive
}

// Example of a data directive with an object containing a nested directive
{
  type: 'Directive',
  kind: 'data',
  subtype: 'dataAssignment',
  values: {
    identifier: [/* Variable reference node */],
    value: {
      type: 'object',
      properties: {
        "content": {
          // Full directive node structure
          type: 'Directive',
          kind: 'add',
          // ...rest of add directive
        },
        "normalProp": "Normal value"
      }
    }
  },
  // ...rest of data directive
}
```

## Variable References

Data directives can use path variables in nested directives:
- Path variables in nested commands and embeds: `$var` - Constrained by security rules

## Examples

Simple primitives:
```
@data count = 42
@data name = "Alice"
@data active = true
```

Objects:
```
@data person = {
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}
```

Arrays:
```
@data colors = ["red", "green", "blue"]
@data matrix = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9]
]
```

Nested add directive:
```
@data config = @add "config.json"
```

Nested run directive:
```
@data systemInfo = @run [uname -a]
```

Complex object with nested directives:
```
@data dashboard = {
  "content": @add "dashboard.md",
  "systemInfo": @run [echo "System Info" | jq],
  "statistics": {
    "counts": @run [wc -l data.txt],
    "createdAt": "2025-05-05"
  }
}
```

Array with nested directives:
```
@data reports = [
  @add "report1.json",
  @add "report2.json",
  {
    "custom": true,
    "data": @run [generate-report]
  }
]
```

## Future Grammar Implementation

Our current implementation already supports directives as direct values:

```
@data config = @add "config.json"
```

The next phase will be to update the grammar to fully support directives within structured data objects and arrays:

```
@data complexConfig = { 
  "content": @add "file.md",
  "systemInfo": @run [echo "hello world" | jq]
}
```

We have already implemented the recursive type system needed for this feature:

```typescript
type DataValue = 
  | ContentNodeArray // String literals, numbers, booleans
  | DataObjectValue  // Objects with nested properties
  | DataArrayValue   // Arrays with nested items
  | DirectiveNode;   // Nested directive (add, run, etc.)

interface DataObjectValue {
  type: 'object';
  properties: {
    [key: string]: DataValue; // Each property can be any data value
  };
}

interface DataArrayValue {
  type: 'array';
  items: DataValue[]; // Each item can be any data value
}
```

This recursive structure allows directives to be embedded at any level within objects and arrays while maintaining each directive's full structure and behavior. The types are already in place, but the grammar parser for data.peggy will need to be enhanced to fully parse these complex nested structures.

### Implementation Plan

1. Modify the data.peggy grammar to handle directive nodes in object properties and array items
2. Add detailed parsing logic to correctly identify and nest directives within data structures
3. Create robust testing for complex nested objects and arrays with directives
4. Add validation for nested directive access in variable resolution
5. Ensure consistent error handling for all nested cases