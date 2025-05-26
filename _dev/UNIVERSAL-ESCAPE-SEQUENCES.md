# Universal Escape Sequences Implementation

## Summary

Successfully implemented universal escape sequences across the entire Mlld grammar, allowing users to escape special characters that would otherwise have syntactic meaning.

## Supported Escape Sequences

- `\@` → `@` (prevents variable interpretation)
- `\\` → `\` (literal backslash)
- `\[` → `[` (literal left bracket)
- `\]` → `]` (literal right bracket)
- `\{` → `{` (literal left brace)
- `\}` → `}` (literal right brace)

## Implementation Details

### Grammar Changes

1. **Added escape sequence support in `grammar/base/segments.peggy`:**
   - Defined core `EscapeSequence` rule
   - Added escape-aware string content rules for all quote types
   - Integrated escape support into existing text segments

2. **Updated `grammar/base/literals.peggy`:**
   - Modified string literals to use escape-aware content rules
   - Supports escapes in double, single, and backtick quoted strings

3. **Updated text segments:**
   - `BaseTextSegment` now supports escape sequences
   - `TemplateTextSegment` already had escape support
   - `CommandTextSegment` already had escape support
   - `PathTextSegment` already had escape support

### Context Support

Escape sequences work in all text contexts:
- String literals (`"..."`, `'...'`, `` `...` ``)
- Template literals (`[[...]]`)
- Path expressions
- Command expressions
- Variable assignments
- Any other text content

### Examples

```mlld
# Basic string escapes
@text email = "user\@example.com"
@text path = "C:\\Users\\Documents"
@text array = "data\[0\]"
@text template = "\{\{variable\}\}"

# Multiline template escapes
@text content = [[
Email: john\@company.com
Path: C:\\Program Files\\App
Array: items\[index\]
Template: \{\{name\}\}
]]

# URL with escaped @ symbol
@text socialUrl = "https://twitter.com/\@username"
```

## Benefits

1. **URL Support**: Can now include @ symbols in URLs without variable interpretation
2. **Path Support**: Windows paths with backslashes work correctly
3. **Template Safety**: Can include literal template syntax in documentation
4. **Array Notation**: Can document array access syntax literally
5. **Future Proof**: Easy to add more escape sequences if needed

## Testing

Verified all escape sequences work correctly:
- Parser properly converts escape sequences to literal characters
- AST shows correct content after escape processing
- Works in all string and template contexts

## Notes

- The escape system is universal - works everywhere text is parsed
- Backward compatible - existing code without escapes continues to work
- Simple and intuitive - follows common escape sequence conventions
- Minimal performance impact - processed during parsing