# Define Directive Handler Documentation

## Overview
The Define directive (`@define`) allows creating reusable text variables that can be referenced elsewhere in the Meld document. It supports both single-line and multi-line text definitions.

## Syntax

### Single-line
```
@define variableName = value
```

### Multi-line
```
@define variableName = """
Multi-line
content here
"""
```

## Architecture

```
   +----------------------+
   |   DefineDirective    |
   |   kind: 'define'     |
   |   name: 'var'        |
   |   value: string      |
   +--------+-------------+
            |
            v
   [ DefineDirectiveHandler.handle(...) ]
            |
            v
  state.setTextVar(name, value)
```

## Implementation Details

### Handler Interface
```typescript
class DefineDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void
}
```

### Key Methods

#### `canHandle(kind: string, mode: string)`
- Returns `true` if `kind === 'define'`
- Mode-agnostic (works in any interpreter mode)

#### `handle(node: DirectiveNode, state: InterpreterState, context: Context)`
1. Validates directive syntax and name
2. Processes value (handles multi-line if needed)
3. Stores in state via `setTextVar`
4. Logs progress via `directiveLogger`

## State Interaction
- Uses `state.setTextVar(name, value)`
- Validates variable name format
- Checks for name collisions
- Respects state immutability

## Error Handling
- Invalid variable names
- Missing required fields
- Name collision errors
- State modification errors
- Malformed multi-line content

## Logging
- Logs directive execution start/end
- Records variable creation
- Logs any validation errors
- Debug-level value logging

## Examples

### Basic Usage
```
@define greeting = Hello, world!
```

### Multi-line Definition
```
@define template = """
Dear {name},

Thank you for your message.

Best regards,
{sender}
"""
```

### Variable Reference
```
@define name = Alice
@define message = Hello, {name}!
```

## Troubleshooting

### Common Issues
- **"Invalid variable name"**
  - Solution: Use alphanumeric names with underscores
- **"Variable already defined"**
  - Solution: Choose a unique variable name
- **"Unclosed multi-line string"**
  - Solution: Ensure triple quotes are properly closed

### Debugging Tips
1. Check variable name format
2. Verify multi-line syntax
3. Enable debug logging
4. Review state contents

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [State Management](../../state/__docs__/README.md)
- [Text Variable Usage](../../../docs/variables.md) 