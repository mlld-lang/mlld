# Data Directive Handler Documentation

## Overview
The Data directive (`@data`) allows storing arbitrary JSON-like data into the interpreter's state. It provides a way to define structured data that can be referenced later in the Meld document.

## Syntax

```
@data variableName = { "key": "value" }
```

## Architecture

```
   +----------------------+
   |   DataDirective      |
   |   kind: 'data'       |
   |   name: 'user'       |
   |   value: {...}       |
   +--------+-------------+
            |
            v
   [ DataDirectiveHandler.handle(...) ]
            |
            v
  state.setDataVar(name, value)
```

## Implementation Details

### Handler Interface
```typescript
class DataDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void
}
```

### Key Methods

#### `canHandle(kind: string, mode: string)`
- Returns `true` if `kind === 'data'`
- Mode-agnostic (works in any interpreter mode)

#### `handle(node: DirectiveNode, state: InterpreterState, context: Context)`
1. Validates directive syntax
2. Parses JSON value
3. Stores in state via `setDataVar`
4. Logs progress via `directiveLogger`

## State Interaction
- Uses `state.setDataVar(name, value)`
- Validates variable name format
- Checks for name collisions
- Respects state immutability

## Error Handling
- Invalid JSON syntax
- Missing required fields
- Name validation errors
- State modification errors

## Logging
- Logs directive execution start/end
- Records variable creation
- Logs any validation errors
- Debug-level value logging

## Examples

### Basic Usage
```
@data user = { "name": "Alice", "age": 30 }
```

### Nested Data
```
@data config = {
  "server": {
    "port": 8080,
    "host": "localhost"
  },
  "timeout": 5000
}
```

### Array Data
```
@data items = ["one", "two", "three"]
```

## Troubleshooting

### Common Issues
- **"Invalid JSON syntax"**
  - Solution: Verify JSON is properly formatted
- **"Variable name already exists"**
  - Solution: Choose a unique variable name
- **"State is immutable"**
  - Solution: Ensure data directive runs before state is locked

### Debugging Tips
1. Check JSON syntax
2. Verify variable name format
3. Enable debug logging
4. Review state contents

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [State Management](../../state/__docs__/README.md)
- [Directive Registry](../registry/__docs__/README.md) 