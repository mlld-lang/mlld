# Angle Bracket Literals in Templates

This test ensures that `<` characters in templates are correctly identified as:
- File references when content contains `.`, `*`, or `@`
- Literal text when they don't match file reference patterns

## Comparison Operators

### Less than with percentage

confidence <70%
### Less than with space

score < 70 points
### Greater than

value >90%
## XML/HTML Literals

### XML tag

content with <div> tag
### HTML elements

text <span>emphasized</span> more text
## File References Still Work

### Simple file reference

content from test file content here
### File with @ symbol

load test file content