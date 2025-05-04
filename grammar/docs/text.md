# Text Directive

The Text directive is used to define and manipulate text variables in Meld. It supports various ways to assign content to variables, including literal text, interpolation, embedding from files, and running commands.

## Subtypes

The Text directive has two main subtypes:

1. [textAssignment](./text.textAssignment.md) - Direct assignment of a value to a variable using syntax: `text var = value`
2. [textBracketed](./text.textBracketed.md) - Bracket-enclosed text with interpolation: `text [content]`

## AST Structure

Text directives follow this common structure:

```typescript
interface TextDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textAssignment' | 'textBracketed';
  values: {
    identifier?: VariableReferenceNode[];
    content?: (TextNode | VariableReferenceNode)[];
    source?: 'literal' | 'embed' | 'run' | 'call';
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

1. Literal text: `text var = "Hello, world!"`
2. Embed source: `text var = @embed path/to/file.txt`
3. Run command: `text var = @run echo "Hello, world!"`
4. API call: `text var = @call api.method parameters`

Each variant has specific structure and metadata as detailed in their documentation.

## Examples

Simple assignment:
```
text greeting = "Hello, world!"
```

Interpolated text:
```
text username = "John"
text greeting = "Hello, {{username}}!"
```

Bracketed syntax:
```
text [This is a simple text block with no variable assignment]
```

Using embed:
```
text content = @embed path/to/file.txt
```

Using run:
```
text result = @run echo "The current directory is: $PWD"
```