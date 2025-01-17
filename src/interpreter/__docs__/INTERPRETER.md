# Interpreter Module Documentation

## Overview
The interpreter module is the core execution engine of Meld. It processes AST nodes produced by the parser, handles directives through the directive registry, and maintains state during interpretation.

## Architecture

```
[Node[]] ---+
            |
            v
   interpret(nodes, state, context)
            |
            +---> for each DirectiveNode --> directiveRegistry.handle(...)
            |--> for each TextNode      --> (stored in state)
            |
            v
   [state is updated or side effects triggered]
```

## Core Components

### Interpreter
- Processes AST nodes sequentially
- Delegates directive handling to registry
- Maintains interpreter state
- Handles errors and logging

### State Management
Located in `state/`:
- Text variables
- Data variables
- Commands
- Imports
- Raw nodes
- Path variables

### Directive Registry
Located in `directives/`:
- Manages directive handlers
- Routes directives to appropriate handlers
- Validates directive syntax
- Tracks directive execution

## Directive Types
Each directive has its own handler in `directives/`:
- `@data`: JSON-like data storage
- `@define`: Variable definition
- `@embed`: File content embedding
- `@import`: File importing
- `@path`: Path variable management
- `@run`: Command execution
- `@text`: Text variable storage

## Error Handling
- `MeldInterpretError`: General interpretation errors
- `MeldDirectiveError`: Directive-specific errors
- Location tracking for precise error reporting
- Error factory for consistent error creation

## State Management
- Parent-child state inheritance
- Local change tracking
- Immutability support
- Merge strategies for state changes

## Logging
- Directive execution logging
- State change tracking
- Error reporting
- Debug information

## Troubleshooting

### Common Issues
- **"Unknown directive type"**
  - Solution: Check directive spelling and registration
- **"State is immutable"**
  - Solution: Ensure state modifications happen before setImmutable()
- **"Invalid directive syntax"**
  - Solution: Verify directive format matches documentation

### Debugging Tips
1. Enable debug logging
2. Check directive registry registration
3. Verify state modifications
4. Review error stack traces

## References
- [Architecture Overview](../../../docs/ARCHITECTURE.md)
- [CLI Documentation](../../cli/__docs__/README.md)
- [Parser Documentation](../../parser/__docs__/README.md)
- [Directive Documentation](../directives/__docs__/) 