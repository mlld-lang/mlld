# Text Directive Handler Documentation

## Overview
The Text directive (`@text`) manages text variables and content within Meld documents. It provides a way to define and manipulate text that can be referenced elsewhere in the document, with support for both single-line and multi-line content.

## Syntax

### Single-line Text
```
@text message = Hello, world!
```

### Multi-line Text
```
@text content = """
This is a
multi-line
text block.
"""
```

### With Variable Reference
```
@text greeting = Hello, {name}!
```

## Architecture

```
   +----------------------+
   |   TextDirective      |
   |   kind: 'text'       |
   |   name: string       |
   |   value: string      |
   +--------+-------------+
            |
            v
   [ TextDirectiveHandler.handle(...) ]
            |
            v
  state.setTextVar(name, value)
```

## Implementation Details

### Handler Interface
```typescript
class TextDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void
}
```

### Key Methods

#### `canHandle(kind: string, mode: string)`
- Returns `true` if `kind === 'text'`
- Mode-agnostic (works in any interpreter mode)

#### `handle(node: DirectiveNode, state: InterpreterState, context: Context)`
1. Validates text syntax and name
2. Processes value (handles multi-line)
3. Resolves variable references
4. Stores in state via `setTextVar`
5. Logs progress via `directiveLogger`

## Text Processing
- Handles single/multi-line text
- Variable substitution
- Whitespace preservation
- Line ending normalization
- Escape sequence handling

## Error Handling
- Invalid variable names
- Missing required fields
- Name collision errors
- Variable resolution errors
- Multi-line syntax errors

## Logging
- Logs text definitions
- Records variable creation
- Logs validation errors
- Debug-level content details

## Examples

### Basic Usage
```
@text title = My Document
@text description = A detailed explanation
```

### Multi-line Content
```
@text template = """
Dear {recipient},

Thank you for your {topic} submission.

Best regards,
{sender}
"""
```

### Variable References
```
@text name = Alice
@text greeting = Hello, {name}!
@text message = {greeting} Welcome to our service.
```

### Special Characters
```
@text escaped = This includes \"quoted\" text
@text path = C:\\Program Files\\App
```

## Troubleshooting

### Common Issues
- **"Invalid variable name"**
  - Solution: Use alphanumeric names with underscores
- **"Variable already defined"**
  - Solution: Choose a unique variable name
- **"Unclosed multi-line string"**
  - Solution: Ensure triple quotes are properly closed
- **"Undefined variable reference"**
  - Solution: Define referenced variables before use

### Debugging Tips
1. Check variable naming
2. Verify multi-line syntax
3. Enable debug logging
4. Review variable references

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [Variable Usage](../../../docs/variables.md)
- [Text Processing](../../utils/__docs__/text.md) 