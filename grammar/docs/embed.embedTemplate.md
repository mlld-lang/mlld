# Embed Template Subtype

The `embedTemplate` subtype of the `@embed` directive is used to embed content from a multiline template that can include variable interpolations.

## Syntax

```meld
@embed [[template_content]]
@embed [[
  multiline
  template
  content
]] as ###
@embed [[template_content]] under header_text
```

Where:
- `template_content` is the content to embed, which can include variable interpolations like `{{variable}}`
- `###` is an optional heading level (number of # characters) for the embedded content
- `header_text` is optional text to use as a header for the embedded content

## AST Structure

The `embedTemplate` subtype produces an AST node with the following structure:

```typescript
{
  type: 'Directive',
  kind: 'embed',
  subtype: 'embedTemplate',
  values: {
    content: TextNodeArray,        // Array of nodes representing the template content
    headerLevel?: NumberNode,      // Node representing the heading level (if specified)
    underHeader?: TextNodeArray,   // Array of nodes representing the header text (if specified)
  },
  raw: {
    content: string,               // Raw template content string
    headerLevel?: string,          // Raw headerLevel string (if specified)
    underHeader?: string,          // Raw underHeader string (if specified)
  },
  meta: {
    isTemplateContent: boolean     // Always true for embedTemplate
  }
}
```

## Example AST

For the directive:
```meld
@embed [[
  # Example 
  This is a {{type}} template.
]] as ## under Documentation
```

The AST would be:

```json
{
  "type": "Directive",
  "kind": "embed",
  "subtype": "embedTemplate",
  "values": {
    "content": [
      {
        "type": "Text",
        "content": "\n  # Example \n  This is a ",
        "raw": "\n  # Example \n  This is a "
      },
      {
        "type": "VariableReference",
        "identifier": "type",
        "raw": "{{type}}"
      },
      {
        "type": "Text",
        "content": " template.\n",
        "raw": " template.\n"
      }
    ],
    "headerLevel": {
      "type": "Number",
      "value": 2,
      "raw": "##"
    },
    "underHeader": [
      {
        "type": "Text",
        "content": "Documentation",
        "raw": "Documentation"
      }
    ]
  },
  "raw": {
    "content": "\n  # Example \n  This is a {{type}} template.\n",
    "headerLevel": "##",
    "underHeader": "Documentation"
  },
  "meta": {
    "isTemplateContent": true
  }
}
```

## Validation Rules

1. The template content can contain text and variable interpolations.
2. If a heading level is specified, it should be 1-6 (corresponding to 1-6 # characters).
3. The template content can span multiple lines.

## Parsing Process

1. Parse the double bracket content to extract the template.
2. Identify and parse any variable interpolations within the template.
3. Parse optional "as" heading level parameter.
4. Parse optional "under" header text parameter.
5. Construct the AST node with all components and set isTemplateContent flag to true.