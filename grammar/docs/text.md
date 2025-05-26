# Text Directive

The Text directive is used to define and manipulate text variables in Mlld. It supports various ways to assign content to variables, including literal text, interpolation, embedding from files, running commands, and nested directives.

## Syntax

```
@text variable = "Hello, world!"              // Assignment with quoted content
@text template = [This is a {{variable}}]     // Template with interpolation
@text content = @add "path/to/file.txt"     // Add from file
@text result = @run [echo "Hello, $USER"]     // Run command
```

## Subtypes

The Text directive has two main subtypes:

1. [textAssignment](./textAssignment.md) - Direct assignment of a value to a variable: `@text var = "value"`
2. [textTemplate](./textTemplate.md) - Template text with interpolation: `@text var = [content with {{vars}}]`

## AST Structure

Text directives follow this common structure:

```typescript
interface TextDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textAssignment' | 'textTemplate';
  values: {
    identifier?: VariableReferenceNode[];
    content?: (TextNode | VariableReferenceNode)[] | DirectiveNode; // Can be content nodes OR a directive
    source?: 'literal' | 'embed' | 'run' | 'directive';
  };
  raw: {
    identifier?: string;
    content?: string;
  };
  meta: {
    // Text-specific metadata
  };
}
```

Values and raw structures will differ between subtypes, as detailed in their respective documentation.

## Text Assignment Variants

The `textAssignment` subtype supports several variants based on the source of content:

1. Literal text: `@text var = "Hello, world!"`
2. Nested add directive: `@text var = @add "path/to/file.txt"`
3. Nested run directive: `@text var = @run [echo "Hello, world!"]`

Each variant has specific structure and metadata as detailed in their documentation.

## Nested Directives

Text directives support a "directive nesting" feature, where other directives can be directly nested in the `content` field:

```typescript
// Example of a text directive with a nested embed directive
{
  type: 'Directive',
  kind: 'text',
  subtype: 'textAssignment',
  values: {
    identifier: [/* Variable reference node */],
    content: {
      // Full directive node structure
      type: 'Directive',
      kind: 'add',
      subtype: 'addPath',
      values: {
        path: [/* Path nodes */]
      },
      // ...rest of add directive
    },
    source: 'directive'
  },
  // ...rest of text directive
}
```

This allows for composable directive structures where one directive can use another directive as its value source.

## Variable References

Text directives can use two types of variable references:
- Path variables in commands and paths: `$var` - Constrained by security rules
- Text variables in templates: `{{var}}` - General string interpolation

Important: Interpolation with `{{var}}` is ONLY supported in template brackets `[...]`, not in quoted strings `"..."`. This provides a clear visual distinction between literal content and template content.

## Examples

Simple assignment:
```
@text greeting = "Hello, world!"
```

Interpolated text template:
```
@text username = "John"
@text greeting = [Hello, {{username}}!]
```

Multiline template:
```
@text email = [
  Dear {{name}},
  
  Thank you for your inquiry about {{product}}.
  
  Best regards,
  The Team
]
```

Using nested add directive:
```
@text content = @add "path/to/file.txt"
```

Using nested run directive:
```
@text result = @run [echo "The current directory is: $PWD"]
```