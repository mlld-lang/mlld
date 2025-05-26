# Add Variable Subtype

The `addVariable` subtype of the `@add` directive is used to add content from a variable reference.

## Syntax

```mlld
@add {{variable}}
@add {{variable}} as ###
@add {{variable}} under header_text
```

Where:
- `variable` is the variable reference whose value will be added
- `###` is an optional heading level (number of # characters) for the added content
- `header_text` is optional text to use as a header for the added content

## AST Structure

The `addVariable` subtype produces an AST node with the following structure:

```typescript
{
  type: 'Directive',
  kind: 'add',
  subtype: 'addVariable',
  values: {
    variable: VariableNodeArray,   // Array containing the variable reference node
    headerLevel?: NumberNode,      // Node representing the heading level (if specified)
    underHeader?: TextNodeArray,   // Array of nodes representing the header text (if specified)
  },
  raw: {
    variable: string,              // Raw variable reference string
    headerLevel?: string,          // Raw headerLevel string (if specified)
    underHeader?: string,          // Raw underHeader string (if specified)
  },
  meta: {}                         // No specific metadata for variable adding
}
```

## Example AST

For the directive `@add {{content}} as ## under Documentation`:

```json
{
  "type": "Directive",
  "kind": "add",
  "subtype": "addVariable",
  "values": {
    "variable": [
      {
        "type": "VariableReference",
        "identifier": "content",
        "raw": "{{content}}"
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
    "variable": "{{content}}",
    "headerLevel": "##",
    "underHeader": "Documentation"
  },
  "meta": {}
}
```

## Validation Rules

1. The variable must be a valid variable reference.
2. At runtime, the variable value must resolve to either a string or a valid path to a file.
3. If a heading level is specified, it should be 1-6 (corresponding to 1-6 # characters).

## Parsing Process

1. Parse the variable reference.
2. Parse optional "as" heading level parameter.
3. Parse optional "under" header text parameter.
4. Construct the AST node with all components.