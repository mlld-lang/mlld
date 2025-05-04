# Add Path Subtype

The `addPath` subtype of the `@add` directive is used to include content from an external file path, with optional section extraction, heading level adjustment, and header text.

## Syntax

```meld
@add "path"
@add "path # section_text"
@add "path" as ###
@add "path # section_text" as ###
@add "path" under header_text
@add "path # section_text" under header_text
```

Where:
- `path` is the path to the file to add (can use path variables)
- `section_text` is optional text that identifies a specific section to extract
- `###` is an optional heading level (number of # characters) for the added content
- `header_text` is optional text to use as a header for the added content

## AST Structure

The `addPath` subtype produces an AST node with the following structure:

```typescript
{
  type: 'Directive',
  kind: 'add',
  subtype: 'addPath',
  values: {
    path: PathNodeArray,           // Array of nodes representing the path
    section?: TextNodeArray,       // Array of nodes representing the section (if specified)
    headerLevel?: NumberNode,      // Node representing the heading level (if specified)
    underHeader?: TextNodeArray,   // Array of nodes representing the header text (if specified)
  },
  raw: {
    path: string,                  // Raw path string
    section?: string,              // Raw section string (if specified)
    headerLevel?: string,          // Raw headerLevel string (if specified)
    underHeader?: string,          // Raw underHeader string (if specified)
  },
  meta: {
    path: {                        // Path metadata
      isAbsolute: boolean,         // Whether the path is absolute
      hasVariables: boolean,       // Whether the path contains variables
      hasTextVariables: boolean,   // Whether the path contains text variables
      hasPathVariables: boolean,   // Whether the path contains path variables
      isRelative: boolean          // Whether the path is relative
    }
  }
}
```

## Example AST

For the directive `@add "$PROJECTPATH/README.md # Introduction" as ## under Documentation`:

```json
{
  "type": "Directive",
  "kind": "add",
  "subtype": "addPath",
  "values": {
    "path": [
      {
        "type": "StringLiteral",
        "value": "$PROJECTPATH/README.md",
        "raw": "\"$PROJECTPATH/README.md\""
      }
    ],
    "section": [
      {
        "type": "Text",
        "content": "Introduction",
        "raw": "Introduction"
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
    "path": "\"$PROJECTPATH/README.md\"",
    "section": "Introduction",
    "headerLevel": "##",
    "underHeader": "Documentation"
  },
  "meta": {
    "path": {
      "isAbsolute": true,
      "hasVariables": true,
      "hasTextVariables": false,
      "hasPathVariables": true,
      "isRelative": false
    }
  }
}
```

## Validation Rules

1. The path parameter is required and must be a valid file path.
2. Special path variables like `$PROJECTPATH` and `$HOMEPATH` are expanded during resolution.
3. If a section is specified, it should be a valid heading in the target file.
4. If a heading level is specified, it should be 1-6 (corresponding to 1-6 # characters).
5. The implementation handles security checks to prevent path traversal attacks.

## Parsing Process

1. Parse the bracket content to extract path and optional section (split by '#').
2. Validate the path and extract path metadata.
3. Parse optional "as" heading level parameter.
4. Parse optional "under" header text parameter.
5. Construct the AST node with all components.