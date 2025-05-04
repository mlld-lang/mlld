# Embed Directive

The `@embed` directive is used to include content from external files or variables into a Meld document. It supports multiple subtypes for different embedding patterns, each with their own parsing rules and AST structure.

## Syntax Variations

### Path Embedding

```meld
@embed [path]
@embed [path # section_text]
@embed [path] as ###
@embed [path # section_text] as ###
@embed [path] under header_text
```

### Template Embedding

```meld
@embed [[template_content]]
```

### Variable Embedding

```meld
@embed {{variable}}
```

### Multiline Embedding

```meld
@embed [[
  multiline
  content
]]
```

### Named Exports Embedding

```meld
@embed {name1, name2} from [path]
```

## Subtypes

1. `embedPath` - Embeds content from a file path, with optional section extraction, header level adjustment, and under header.
2. `embedTemplate` - Embeds content from a multiline template.
3. `embedVariable` - Embeds content from a variable reference.
4. `embedMultiline` - Embeds multiline content directly.

## AST Structure

Each embed directive creates a node with the following structure:

```typescript
{
  type: 'Directive',
  kind: 'embed',
  subtype: 'embedPath' | 'embedTemplate' | 'embedVariable' | 'embedMultiline',
  values: {
    path?: PathNodeArray,           // For embedPath
    section?: TextNodeArray,        // For embedPath with section
    headerLevel?: TextNodeArray,    // For adjusting heading levels
    underHeader?: TextNodeArray,    // For adding header text
    content?: TextNodeArray,        // For embedTemplate and embedMultiline
    variable?: VariableNodeArray,   // For embedVariable
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
      isAbsolute: boolean,
      hasVariables: boolean,
      hasTextVariables: boolean,
      hasPathVariables: boolean,
      isRelative: boolean
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

1. Basic file embedding:
   ```meld
   @embed ["$PROJECTPATH/README.md"]
   ```

2. Embedding with section extraction:
   ```meld
   @embed ["guide.md # Getting Started"]
   ```

3. Heading level adjustment:
   ```meld
   @embed ["api.md"] as ###
   ```

4. Adding headers:
   ```meld
   @embed ["example.js"] under Code Example
   ```

5. Variable embedding:
   ```meld
   @embed {{content}}
   ```

## Notes

- During parsing, we maintain both the structured node representation and the raw text to support precise source mapping and error reporting.
- The parser extracts metadata about paths including whether they're absolute or contain variables.
- Error handling includes validation of paths, heading levels, and other parameters.