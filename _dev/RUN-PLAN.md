# Run Directive Command Reference Implementation Plan

## Issue Description

Issue #5 from E2E-ISSUES-FIXES.md: The `@run` directive fails to execute defined commands. When using `@run $commandName(args)`, it tries to execute "$commandName" literally rather than expanding it to the defined command.

The root cause is that the RunDirectiveHandler doesn't recognize command references starting with '$' and does not expand them using commands defined in the state.

## Architecture Analysis

The Meld codebase follows these design patterns:
- Service-based architecture with dependency injection
- Immutable state management with cloned states
- Pipeline-based directive processing
- Clear separation of concerns between services

Key components involved:
1. **DefineDirectiveHandler**: Processes `@define` directives and stores command definitions in the state
2. **RunDirectiveHandler**: Processes `@run` directives and executes commands
3. **StateService**: Manages state, including storing and retrieving command definitions
4. **ResolutionService**: Resolves variables and expressions in commands
5. **FileSystemService**: Executes shell commands

## Comprehensive Implementation Plan

### 1. Command Reference Detection & Retrieval

```typescript
// In RunDirectiveHandler.ts execution method
// After getting the raw command string
let commandToExecute = rawCommand;
if (rawCommand.startsWith('$')) {
  const commandMatch = rawCommand.match(/\$([a-zA-Z0-9_]+)(?:\((.*)\))?/);
  if (commandMatch) {
    const commandName = commandMatch[1];
    const commandArgs = commandMatch[2] || '';
    
    // Get command definition from state
    const commandDefinition = state.getCommand(commandName);
    if (!commandDefinition) {
      throw new DirectiveError(
        `Command '${commandName}' not found`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        { severity: ErrorSeverity.Error }
      );
    }
    
    directiveLogger.debug(`Found command definition for ${commandName}:`, commandDefinition);
```

### 2. Command Template Analysis & Extraction

```typescript
    // Get the actual command string from the definition
    let commandTemplate = commandDefinition.command;
    
    // Detect if the command is wrapped in a directive syntax
    // Handles cases like: @run [echo "Hello, {{param}}!"]
    if (commandTemplate.startsWith('@run ')) {
      const runCommandMatch = commandTemplate.match(/@run\s*\[(.*)\]/);
      if (runCommandMatch) {
        // Extract the actual command inside the @run directive
        commandTemplate = runCommandMatch[1];
        directiveLogger.debug(`Extracted run command from directive: ${commandTemplate}`);
      } else {
        throw new DirectiveError(
          `Invalid @run command format in definition: ${commandTemplate}`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { severity: ErrorSeverity.Error }
        );
      }
    } else if (commandTemplate.startsWith('@')) {
      // Other directive types aren't directly executable
      throw new DirectiveError(
        `Cannot execute non-run directive as command: ${commandTemplate}`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { severity: ErrorSeverity.Error }
      );
    }
```

### 3. Parameter Parsing & Replacement

```typescript
    // Parse the command arguments with respect for quotes and nested structures
    const parsedArgs = this.parseCommandArgs(commandArgs);
    
    // Map parsed args to parameter names
    const commandParams = commandDefinition.parameters || [];
    const paramMap: Record<string, string> = {};
    
    // If we have named parameters in the command definition, map args by position
    if (commandParams.length > 0) {
      commandParams.forEach((paramName, index) => {
        if (index < parsedArgs.length) {
          paramMap[paramName] = parsedArgs[index];
        }
      });
    } else {
      // If no named parameters, use positional mapping with $1, $2, etc.
      parsedArgs.forEach((arg, index) => {
        paramMap[`$${index + 1}`] = arg;
      });
    }
    
    directiveLogger.debug(`Parameter mapping:`, paramMap);
    
    // Replace parameter placeholders in command template
    let expandedCommand = commandTemplate;
    for (const [paramName, paramValue] of Object.entries(paramMap)) {
      // Replace {{param}} with value, allowing for whitespace inside braces
      const paramPattern = new RegExp(`{{\\s*${paramName}\\s*}}`, 'g');
      expandedCommand = expandedCommand.replace(paramPattern, paramValue);
    }
    
    // Use the expanded command for execution
    commandToExecute = expandedCommand;
    directiveLogger.debug(`Expanded command template: ${commandToExecute}`);
```

### 4. Command Argument Parser Helper

```typescript
/**
 * Parse command arguments with proper handling of quoted strings and nested structures
 */
private parseCommandArgs(argsString: string): string[] {
  if (!argsString.trim()) {
    return [];
  }
  
  const args: string[] = [];
  let currentArg = '';
  let inQuote = false;
  let quoteChar = '';
  let bracketDepth = 0;
  
  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];
    
    // Handle quotes (respecting escapes)
    if ((char === '"' || char === "'") && (i === 0 || argsString[i-1] !== '\\')) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      } else {
        // Different quote type inside a quote - treat as literal
        currentArg += char;
      }
      continue;
    }
    
    // Track bracket depth for nested structures
    if (char === '{' && !inQuote) {
      bracketDepth++;
    } else if (char === '}' && !inQuote) {
      bracketDepth--;
    }
    
    // Argument separator (comma) - only split when not in quotes or brackets
    if (char === ',' && !inQuote && bracketDepth === 0) {
      args.push(currentArg.trim());
      currentArg = '';
    } else {
      currentArg += char;
    }
  }
  
  // Add the final argument
  if (currentArg.trim()) {
    args.push(currentArg.trim());
  }
  
  return args;
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
// In RunDirectiveHandler.test.ts

describe('command references', () => {
  it('should properly expand simple command references', async () => {
    // Create a run directive with command reference
    const node = createRunDirectiveNode('$echo');
    
    // Configure mock state to return command
    vi.mocked(stateService.getCommand).mockReturnValue({
      command: '@run [echo "Hello, World!"]'
    });
    
    await handler.execute(node, context);
    
    // Verify the actual command was executed, not the reference
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo "Hello, World!"', 
      expect.anything()
    );
  });
  
  it('should handle command references with parameters', async () => {
    const node = createRunDirectiveNode('$greet(John)');
    
    // Mock command with parameter placeholder
    vi.mocked(stateService.getCommand).mockReturnValue({
      command: '@run [echo "Hello, {{person}}!"]',
      parameters: ['person']
    });
    
    await handler.execute(node, context);
    
    // Verify parameter substitution
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo "Hello, John!"', 
      expect.anything()
    );
  });
  
  it('should handle parameters with spaces and quotes', async () => {
    const node = createRunDirectiveNode('$greet("John Doe", "Software Engineer")');
    
    vi.mocked(stateService.getCommand).mockReturnValue({
      command: '@run [echo "Hello, {{name}}! You are a {{role}}"]',
      parameters: ['name', 'role']
    });
    
    await handler.execute(node, context);
    
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo "Hello, John Doe! You are a Software Engineer"', 
      expect.anything()
    );
  });
  
  it('should handle commands with variable parameters', async () => {
    const node = createRunDirectiveNode('$greet({{user.name}})');
    
    vi.mocked(stateService.getCommand).mockReturnValue({
      command: '@run [echo "Hello, {{person}}!"]',
      parameters: ['person']
    });
    
    // The variable resolution should be handled by ResolutionService
    vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo "Hello, Test User!"');
    
    await handler.execute(node, context);
    
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo "Hello, Test User!"', 
      expect.anything()
    );
  });
  
  it('should throw error for undefined commands', async () => {
    const node = createRunDirectiveNode('$unknownCommand');
    
    vi.mocked(stateService.getCommand).mockReturnValue(undefined);
    
    await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    expect(stateService.getCommand).toHaveBeenCalledWith('unknownCommand');
  });
});
```

### 2. Integration Tests

```typescript
// Test the complete pipeline from defining to executing commands
it('should process command definition and execution end-to-end', async () => {
  // Build a simple document with define and run
  const content = `
    @define greet(person) = @run [echo "Hello, {{person}}!"]
    @run $greet(World)
  `;
  
  // Use the proper test utilities to process this document
  const result = await processDocument(content);
  
  // Verify that the command executed correctly
  expect(result).toContain('Hello, World!');
});
```

### 3. Behavioral Edge Cases

1. Test commands with complex nested variables
2. Test commands with different syntax variations
3. Test error cases and handling
4. Test escape handling in commands

## Implementation Considerations

### Alignment with Existing Patterns

1. The implementation follows the immutable state pattern used throughout the codebase
2. It correctly uses the dependency-injected services
3. It maintains separation of concerns between:
   - Command definition (DefineDirectiveHandler)
   - Command execution (RunDirectiveHandler)
   - State management (StateService)
   - Variable resolution (ResolutionService)

### Error Handling

- Comprehensive error detection with clear error messages
- Proper use of DirectiveError with appropriate error codes
- Following the established logging patterns

### Performance

- Efficient argument parsing with optimized string handling
- Minimizing unnecessary string operations
- Maintaining O(n) complexity for command processing

### Maintainability

- Clear code organization with documented helper methods
- Comprehensive test coverage for all features
- Detailed logging for debugging and maintenance

## Implementation Priorities

1. Basic command reference resolution
2. Parameter parsing and substitution
3. Robust error handling
4. Performance optimization
5. Extended test coverage

## Summary

This implementation plan provides a comprehensive solution for handling command references in the `@run` directive. It properly integrates with the existing architecture, leverages the established state management and resolution services, and follows the project's design patterns and error handling approach.

The implementation properly addresses Issue #5 from E2E-ISSUES-FIXES.md while maintaining compatibility with the rest of the codebase.