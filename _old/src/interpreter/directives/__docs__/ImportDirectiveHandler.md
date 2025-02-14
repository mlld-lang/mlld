# Import Directive Handler Documentation

## Overview
The Import directive (`@import`) allows importing and processing Meld files, merging their state into the current interpreter state. This enables modular Meld documents and state sharing between files.

## Syntax

### Basic Import
```
@import path/to/file.meld
```

### With Variable Path
```
@import {filePath}
```

## Architecture

```
   +----------------------+
   |   ImportDirective    |
   |   kind: 'import'     |
   |   path: string       |
   +--------+-------------+
            |
            v
   [ ImportDirectiveHandler.handle(...) ]
            |
            +---> Read Meld file
            |
            +---> Create subInterpreter
            |
            +---> Process file
            |
            v
   [Merge state changes]
```

## Implementation Details

### Handler Interface
```typescript
class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void
}
```

### Key Methods

#### `canHandle(kind: string, mode: string)`
- Returns `true` if `kind === 'import'`
- Mode-agnostic (works in any interpreter mode)

#### `handle(node: DirectiveNode, state: InterpreterState, context: Context)`
1. Resolves file path (handles variables)
2. Checks for circular imports
3. Creates subInterpreter with parent state
4. Processes imported file
5. Merges resulting state changes
6. Logs progress via `directiveLogger`

## State Management
- Creates child interpreter state
- Inherits parent state variables
- Tracks local changes
- Merges changes back to parent
- Handles variable collisions

## Error Handling
- File not found errors
- Permission errors
- Circular import detection
- State merge conflicts
- Meld processing errors

## Logging
- Logs import attempts
- Records successful imports
- Logs state changes
- Debug-level processing info

## Examples

### Basic Import
```
@import common.meld
```

### Variable Path Import
```
@define templatePath = templates/base.meld
@import {templatePath}
```

### Chained Imports
```
@import config.meld    # which might import settings.meld
```

### State Usage
```
@import utils.meld     # defines helper variables
@define message = Using {helperVar}  # uses imported variable
```

## Troubleshooting

### Common Issues
- **"File not found"**
  - Solution: Check file path and working directory
- **"Circular import detected"**
  - Solution: Review import chain for cycles
- **"Variable collision"**
  - Solution: Ensure imported variables don't conflict
- **"State merge error"**
  - Solution: Check for incompatible state changes

### Debugging Tips
1. Check file paths
2. Review import chain
3. Enable debug logging
4. Inspect state changes

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [State Management](../../state/__docs__/README.md)
- [SubInterpreter](../../__docs__/subInterpreter.md) 