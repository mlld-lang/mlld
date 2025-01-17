# Run Directive Handler Documentation

## Overview
The Run directive (`@run`) executes shell commands and can capture their output. It provides a way to integrate shell operations into Meld documents, with support for variable substitution and output capture.

## Syntax

### Basic Command
```
@run echo "Hello, world!"
```

### With Output Capture
```
@run command = ls -la
```

### With Variable Reference
```
@run echo {message}
```

## Architecture

```
   +----------------------+
   |   RunDirective       |
   |   kind: 'run'        |
   |   command: string    |
   |   capture?: string   |
   +--------+-------------+
            |
            v
   [ RunDirectiveHandler.handle(...) ]
            |
            +---> Execute command
            |
            +---> Capture output (optional)
            |
            v
   [Update state if output captured]
```

## Implementation Details

### Handler Interface
```typescript
class RunDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void
}
```

### Key Methods

#### `canHandle(kind: string, mode: string)`
- Returns `true` if `kind === 'run'`
- Mode-agnostic (works in any interpreter mode)

#### `handle(node: DirectiveNode, state: InterpreterState, context: Context)`
1. Validates command syntax
2. Resolves variables in command
3. Executes command via child_process
4. Captures output if requested
5. Stores output in state if captured
6. Logs progress via `directiveLogger`

## Command Execution
- Uses Node.js child_process
- Supports shell commands
- Handles environment variables
- Variable substitution in commands
- Output stream management

## Error Handling
- Command execution errors
- Permission errors
- Timeout errors
- Variable resolution errors
- Output capture errors

## Logging
- Logs command execution
- Records command output
- Logs execution errors
- Debug-level command details

## Examples

### Basic Commands
```
@run echo "Building project..."
@run npm install
```

### Output Capture
```
@run result = git status
@run version = node --version
```

### Variable Usage
```
@define script = build.sh
@run ./{script} --release
```

### Complex Commands
```
@run find . -name "*.js" | xargs grep "TODO"
```

## Security Considerations
- Command injection risks
- Working directory access
- Environment variable exposure
- Permission requirements
- Output sanitization

## Troubleshooting

### Common Issues
- **"Command not found"**
  - Solution: Verify command exists in PATH
- **"Permission denied"**
  - Solution: Check execution permissions
- **"Variable not resolved"**
  - Solution: Ensure referenced variables exist
- **"Output capture failed"**
  - Solution: Check command produces output on stdout

### Debugging Tips
1. Test command in shell
2. Check variable values
3. Enable debug logging
4. Review command output

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [Shell Integration](../../utils/__docs__/shell.md)
- [Security Guidelines](../../../docs/security.md) 