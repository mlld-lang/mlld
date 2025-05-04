# Text Bracketed Directive

The `textBracketed` subtype of the Text directive creates a block of text without assigning it to a variable, using the syntax: `text [content]`.

## Syntax

```
text [content with optional {{variable}} interpolation]
```

Where:
- `content`: Text content that may include variable interpolation using the `{{variable}}` syntax

## AST Structure

```typescript
interface TextBracketedDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textBracketed';
  values: {
    content: (TextNode | VariableReferenceNode)[];
  };
  raw: {
    content: string;
  };
  meta: {
    // Bracketed text metadata
  };
}
```

## Usage

The bracketed text directive is useful for including text content directly in a Meld document without assigning it to a variable. It supports variable interpolation, making it powerful for template-like usage.

This directive:
1. Does not assign to a variable
2. Immediately outputs its content when executed
3. Supports variable interpolation using `{{variable}}` syntax
4. Can span multiple lines

## Examples

Simple usage:
```
text [This is a simple text block that will be output directly]
```

With variable interpolation:
```
text name = "John"
text [Hello, {{name}}! Welcome to Meld.]
```

Multi-line content:
```
text [
  This is a multi-line
  text block that will
  be output with its
  line breaks preserved.
]
```

With multiple variables:
```
text firstName = "John"
text lastName = "Doe"
text [
  User Profile:
  Name: {{firstName}} {{lastName}}
  Created: {{now}}
]
```

## Notes

- Unlike `textAssignment`, the bracketed syntax does not support `@embed`, `@run`, or `@call` sources directly
- However, it can interpolate variables that were created using those sources
- Whitespace is preserved as-is within the brackets
- Variable interpolation is processed before the text is output