# Text Directive

The Text directive is used to define and manipulate text variables in Meld. It supports various ways to assign content to variables, including literal text, interpolation, embedding from files, and running commands.

## Syntax

```
@text variable = "Hello, world!"              // Assignment with quoted content
@text template = [This is a {{variable}}]     // Template with interpolation
@text content = @embed "path/to/file.txt"     // Embed from file
@text result = @run [echo "Hello, $USER"]     // Run command
```

## Subtypes

The Text directive has two main subtypes:

1. [textAssignment](./text.textAssignment.md) - Direct assignment of a value to a variable: `@text var = "value"`
2. [textTemplate](./text.textTemplate.md) - Template text with interpolation: `@text var = [content with {{vars}}]`

## AST Structure

Text directives follow this common structure:

```typescript
interface TextDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textAssignment' | 'textTemplate';
  values: {
    identifier?: VariableReferenceNode[];
    content?: (TextNode | VariableReferenceNode)[];
    source?: 'literal' | 'embed' | 'run';
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
2. Embed source: `@text var = @embed "path/to/file.txt"`
3. Run command: `@text var = @run [echo "Hello, world!"]`

Each variant has specific structure and metadata as detailed in their documentation.

## Variable References

Text directives can use two types of variable references:
- Path variables in commands and embeds: `$var` - Constrained by security rules
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

Using embed:
```
@text content = @embed "path/to/file.txt"
```

Using run:
```
@text result = @run [echo "The current directory is: $PWD"]
```