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
  - A nested embed directive: `@embed "path/to/file.txt"`
  - A nested run directive: `@run [echo "Hello, world!"]`

## AST Structure

```typescript
interface TextAssignmentDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textAssignment';
  values: {
    identifier: VariableReferenceNode[];
    content: (TextNode | VariableReferenceNode)[] | DirectiveNode; // Can be content nodes OR a nested directive
  };
  raw: {
    identifier: string;
    content: string;
  };
  meta: {
    // Metadata based on the value source
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
  }
}
```

### Nested Embed Directive

Assigns the content of a file to a variable using `@embed`.

```
@text content = @embed "path/to/file.txt"
```

AST structure for nested embed directive:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: {
      // The full embed directive node directly nested
      type: 'Directive',
      kind: 'embed',
      subtype: 'embedPath',
      values: {
        path: [/* Path nodes */]
      },
      raw: {
        path: "path/to/file.txt"
      },
      meta: {}
    }
  }
}
```

### Nested Run Directive

Assigns the output of a command to a variable using `@run`.

```
@text result = @run [echo "The current directory is: $PWD"]
```

AST structure for nested run directive:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: {
      // The full run directive node directly nested
      type: 'Directive',
      kind: 'run',
      subtype: 'runCommand',
      values: {
        command: [/* Command nodes */]
      },
      raw: {
        command: "echo \"The current directory is: $PWD\""
      },
      meta: {}
    }
  }
}
```

## Recursive Directive Composition

The nested directive structure enables fully composable directive trees, where:

1. Directives can be nested directly in the values object
2. The nested structure is maintained throughout AST processing
3. The AST represents the exact directive relationships as written

This design enables directives to serve as values for other directives, creating a clean, recursive structure that accurately models complex compositions.

## Variable References

Text assignment directives can use two types of variable references:
- Path variables in `@run` commands and `@embed` paths: `$var` - Constrained by security rules
- Text variables in string literals: `{{var}}` - General string interpolation

Important: Interpolation with `{{var}}` is ONLY supported in template brackets `[...]`, not in quoted strings `"..."`. Use the textTemplate subtype for interpolation.

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