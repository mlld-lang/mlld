# Text Template Directive

The `textTemplate` subtype of the Text directive creates template text with variable interpolation using the syntax: `@text variable = [content with {{vars}}]`.

## Syntax

```
@text [template content with optional {{variable}} interpolation]
```

or

```
@text variable = [content with optional {{variable}} interpolation]
```

Where:
- `variable`: Optional variable name to store the template
- `content`: Text content that may include variable interpolation using the `{{variable}}` syntax

## AST Structure

```typescript
interface TextTemplateDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textTemplate';
  values: {
    identifier?: VariableReferenceNode[];  // Optional
    content: (TextNode | VariableReferenceNode)[];
  };
  raw: {
    identifier?: string;
    content: string;
  };
  meta: {
    // Template text metadata
  };
}
```

## Usage

The text template directive is ideal for template-like content with interpolation. It can either be assigned to a variable or output directly. This directive:

1. May optionally assign to a variable
2. Supports variable interpolation using `{{variable}}` syntax
3. Can span multiple lines with preserved formatting
4. Is particularly useful for generating structured content like emails, reports, etc.

## Variable References

Templates use `{{variable}}` syntax for interpolation, which makes them distinct from other variable references:
- Text variables in templates: `{{var}}` - Used for general string interpolation
- Unlike path variables (`$var`), template variables are not constrained by security rules

## Examples

Simple usage with direct output:
```
@text [This is a simple text block that will be output directly]
```

With variable interpolation:
```
@text name = "John"
@text [Hello, {{name}}! Welcome to Meld.]
```

Assigned to a variable:
```
@text greeting = [Hello, {{name}}! Welcome to Meld.]
```

Multi-line content:
```
@text email = [
  Dear {{recipient}},
  
  This is a multi-line
  template with variable
  interpolation.
  
  Best regards,
  {{sender}}
]
```

With multiple variables:
```
@text firstName = "John"
@text lastName = "Doe"
@text userProfile = [
  User Profile:
  Name: {{firstName}} {{lastName}}
  Created: {{now}}
]
```

## Notes

- Templates preserve whitespace exactly as written within the brackets
- Variable interpolation is processed when the template is evaluated
- Templates can be nested by referencing template variables inside other templates