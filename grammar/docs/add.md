# Add Directive

The `@add` directive is used to include content from external files or variables into a Mlld document. It supports multiple subtypes for different inclusion patterns, each with their own parsing rules and AST structure.

## Syntax Variations

### Path Inclusion

```mlld
@add "path"
@add "path # section_text"
@add "path" as ###
@add "path # section_text" as ###
@add "path" under header_text
```

### Template Inclusion

```mlld
@add [template_content]
@add [
  multiline
  template
  content
]
```

### Variable Inclusion

```mlld
@add {{variable}}
```

### Named Exports Inclusion

```mlld
@add {name1, name2} from "path"
```

## Subtypes

1. [`addPath`](./addPath.md) - Adds content from a file path, with optional section extraction, header level adjustment, and under header.
2. [`addTemplate`](./addTemplate.md) - Adds content from a template, with support for both single-line and multiline content.
3. [`addVariable`](./addVariable.md) - Adds content from a variable reference.

## AST Structure

Each add directive creates a node with the following structure:

```typescript
{
  type: 'Directive',
  kind: 'add',
  subtype: 'addPath' | 'addTemplate' | 'addVariable',
  values: {
    path?: PathNodeArray,           // For addPath
    section?: TextNodeArray,        // For addPath with section
    headerLevel?: TextNodeArray,    // For adjusting heading levels
    underHeader?: TextNodeArray,    // For adding header text
    content?: TextNodeArray,        // For addTemplate
    variable?: VariableNodeArray,   // For addVariable
    names?: VariableNodeArray,      // For named exports
  },
  raw: {
    path?: string,                  // Raw path string
    section?: string,               // Raw section string
    headerLevel?: string,           // Raw headerLevel string
    underHeader?: string,           // Raw underHeader string
    content?: string,               // Raw content string
    variable?: string,              // Raw variable reference
    names?: string,                 // Raw names string
  },
  meta: {
    path?: {                       // Path metadata
      hasVariables: boolean
    }
  }
}
```

## Special Considerations

1. Section extraction uses `#` as a delimiter within the path parameter.
2. Heading level adjustment uses `as ###` syntax where the number of `#` characters indicates the level.
3. Adding headers uses `under header_text` syntax.
4. Variables can be used in all parameters including path, section, and header text.
5. Path validation ensures security and prevents path traversal attacks.
6. When using variable references, the variable must contain either text or a valid path.

## Examples

1. Basic file inclusion:
   ```mlld
   @add "$PROJECTPATH/README.md"
   ```

2. Including with section extraction:
   ```mlld
   @add "guide.md # Getting Started"
   ```

3. Heading level adjustment:
   ```mlld
   @add "api.md" as ###
   ```

4. Adding headers:
   ```mlld
   @add "example.js" under Code Example
   ```

5. Variable inclusion:
   ```mlld
   @add {{content}}
   ```

## Notes

- During parsing, we maintain both the structured node representation and the raw text to support precise source mapping and error reporting.
- The parser extracts metadata about paths including whether they're absolute or contain variables.
- Error handling includes validation of paths, heading levels, and other parameters.