# Meld Directives

## Quick Reference

### Variable Management
- [@data](./DataDirectiveHandler.md) - Store JSON-like data (`@data user = { "name": "Alice" }`)
- [@define](./DefineDirectiveHandler.md) - Create text variables (`@define greeting = Hello!`)
- [@text](./TextDirectiveHandler.md) - Manage text content (`@text message = Hello, {name}!`)

### File Operations
- [@embed](./EmbedDirectiveHandler.md) - Include file contents (`@embed README.md`)
- [@import](./ImportDirectiveHandler.md) - Import and process Meld files (`@import common.meld`)
- [@path](./PathDirectiveHandler.md) - Manage file paths (`@path config = {base}/config`)

### System Integration
- [@run](./RunDirectiveHandler.md) - Execute shell commands (`@run echo "Hello"`)

## Common Implementation Patterns

### Directive Handler Interface
All directives implement this common interface:
```typescript
interface DirectiveHandler {
  canHandle(kind: string, mode: string): boolean;
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void;
}
```

### State Interaction
- All directives interact with `InterpreterState`
- State modifications check immutability
- Variable name validation
- Collision detection
- Change tracking

### Error Handling
Common error patterns across directives:

- **Validation Errors**
  - Invalid names/identifiers
  - Missing required fields
  - Type mismatches
  - Format violations

- **State Errors**
  - Immutable state modifications
  - Name collisions
  - Missing dependencies
  - Invalid references

- **Resource Errors**
  - File not found
  - Permission denied
  - Timeout/interruption
  - Resource busy

### Logging
All directives use the `directiveLogger` for:
- Execution progress
- Error reporting
- Debug information
- State changes

## Security Considerations

### File System Access
- Path validation
- Permission checks
- Working directory restrictions
- Circular reference prevention

### Command Execution
- Command injection prevention
- Permission requirements
- Environment variable exposure
- Output sanitization

### State Protection
- Immutability enforcement
- Variable name validation
- Type checking
- Collision prevention

## Best Practices

### Variable Naming
1. Use descriptive names
2. Follow consistent conventions
3. Avoid reserved words
4. Consider scope and visibility

### File Operations
1. Use relative paths when possible
2. Check file existence
3. Handle permissions appropriately
4. Prevent circular references

### Command Execution
1. Validate commands
2. Handle errors gracefully
3. Capture output when needed
4. Consider security implications

### State Management
1. Check immutability
2. Validate inputs
3. Handle collisions
4. Track changes

## Troubleshooting

### Common Issues
- **"Invalid name/identifier"**
  - Solution: Use alphanumeric names with underscores
- **"Already defined"**
  - Solution: Choose unique names
- **"State is immutable"**
  - Solution: Ensure modifications happen before state is locked
- **"Resource not found"**
  - Solution: Check paths and permissions
- **"Invalid syntax"**
  - Solution: Review directive format and arguments

### Debugging Tips
1. Enable debug logging
2. Check variable definitions
3. Verify file paths
4. Review error messages
5. Inspect state changes
6. Test commands separately
7. Check permissions
8. Review documentation

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [State Management](../../state/__docs__/README.md)
- [File System Utils](../../../utils/__docs__/fs.md)
- [Security Guidelines](../../../docs/security.md) 