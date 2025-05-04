# Text Assignment Directive

The `textAssignment` subtype of the Text directive assigns a value to a variable using the syntax: `@text variable = value`.

## Syntax

```
@text identifier = value
```

Where:
- `identifier`: A valid variable name
- `value`: Can be one of:
  - A literal string: `"content"` or `'content'` or `"""multiline content"""`
  - An embed source: `@embed "path/to/file.txt"`
  - A run command: `@run [echo "Hello, world!"]`

## AST Structure

```typescript
interface TextAssignmentDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textAssignment';
  values: {
    identifier: VariableReferenceNode[];
    content: (TextNode | VariableReferenceNode)[];
  };
  raw: {
    identifier: string;
    content: string;
  };
  meta: {
    // Metadata based on the value source
  };
  
  // Only present when the value comes from another directive
  sourceDirective?: {
    directive: DirectiveNode; // The actual directive providing the value
    type: 'embed' | 'run';    // Type discriminator
  };
}
```

## Variants

### Literal Text

The most common form, assigning a literal string to a variable.

```
@text greeting = "Hello, world!"
```

AST structure for literals:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: [/* Text nodes (no variable interpolation) */]
  },
  // No sourceDirective since the content is a direct literal
}
```

### Embed Source

Assigns the content of a file to a variable using `@embed`.

```
@text content = @embed "path/to/file.txt"
```

AST structure for embed source:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: [/* Processed content after embedding */]
  },
  sourceDirective: {
    type: 'embed',
    directive: {
      // The full embed directive node with its own structure
      kind: 'embed',
      // ...other embed directive properties
    }
  }
}
```

### Run Command

Assigns the output of a command to a variable using `@run`.

```
@text result = @run [echo "The current directory is: $PWD"]
```

AST structure for run command:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: [/* Processed content after running command */]
  },
  sourceDirective: {
    type: 'run',
    directive: {
      // The full run directive node with its own structure
      kind: 'run',
      // ...other run directive properties
    }
  }
}
```

## Variable References

Text assignment directives can use two types of variable references:
- Path variables in `@run` commands and `@embed` paths: `$var` - Constrained by security rules
- Text variables in string literals: `{{var}}` - General string interpolation

## Examples

Simple literal:
```
@text greeting = "Hello, world!"
```

Simple string literals (no interpolation):
```
@text name = "John"
@text greeting = "Hello, John!"
```

Multi-line content:
```
@text message = """
This is a multi-line
text value with
several lines.
"""
```

Embed a file:
```
@text content = @embed "README.md"
```

Embed with path variable:
```
@text content = @embed "$SOURCE_DIR/config.json"
```

Run a command:
```
@text files = @run [ls -la]
```

Run with command variables:
```
@text result = @run [find $SEARCH_PATH -name "*.js"]
```