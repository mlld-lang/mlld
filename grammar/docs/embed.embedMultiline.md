# Embed Multiline Subtype

The `embedMultiline` subtype of the `@embed` directive is used to embed static multiline content directly within the Meld document.

## Syntax

```meld
@embed [[
  multiline
  content
]]
```

Where:
- The content between the double brackets is embedded as-is, preserving all whitespace and newlines

## AST Structure

The `embedMultiline` subtype produces an AST node with the following structure:

```typescript
{
  type: 'Directive',
  kind: 'embed',
  subtype: 'embedMultiline',
  values: {
    content: TextNodeArray,        // Array of nodes representing the multiline content
  },
  raw: {
    content: string,               // Raw multiline content string
  },
  meta: {}                         // No specific metadata for multiline embedding
}
```

## Example AST

For the directive:
```meld
@embed [[
  # Example Heading
  This is some multiline content.
  It preserves all formatting.
]]
```

The AST would be:

```json
{
  "type": "Directive",
  "kind": "embed",
  "subtype": "embedMultiline",
  "values": {
    "content": [
      {
        "type": "Text",
        "content": "\n  # Example Heading\n  This is some multiline content.\n  It preserves all formatting.\n",
        "raw": "\n  # Example Heading\n  This is some multiline content.\n  It preserves all formatting.\n"
      }
    ]
  },
  "raw": {
    "content": "\n  # Example Heading\n  This is some multiline content.\n  It preserves all formatting.\n"
  },
  "meta": {}
}
```

## Validation Rules

1. The multiline content must be enclosed in double brackets `[[...]]`.
2. All whitespace and newlines within the double brackets are preserved.
3. Unlike `embedTemplate`, this subtype does not process variable interpolations.

## Parsing Process

1. Parse the content between double brackets.
2. Preserve all whitespace and newlines.
3. Construct the AST node with the content.

## Key Differences from embedTemplate

- `embedMultiline` treats the content as static text without processing any variable interpolations.
- `embedMultiline` does not support the `as` or `under` modifiers.
- This subtype is simpler and more straightforward for cases where you just want to include static, preformatted content.