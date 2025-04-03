# Simplifying DefinedCommandHandler with Stronger Run Types

After analyzing the code for the `DefinedCommandHandler` service, I've identified several opportunities to strengthen the type system for better handling of `@run` directives, particularly for defined commands. These improvements will make the code more maintainable, safer, and easier to understand.

## Current Challenges

The current implementation has several areas where improved typing would benefit the codebase:

1. **Mixed Command Reference Formats**: Handling both AST-based and string-based command references requires complex type checking and conditional logic
2. **Manual Parameter Processing**: Different argument types require manual type checking and conversion
3. **Inconsistent Command Definition Structure**: Command definitions lack strict typing for parameters and templates
4. **Complex Error Handling**: Multiple catch blocks with similar error handling patterns
5. **Implicit State Structure**: State service interactions lack type safety for command storage and retrieval

## Proposed TypeScript Improvements

### 1. Discriminated Union for Command References

```typescript
// Define strict types for command references
type CommandReference = AstCommandReference | StringCommandReference;

interface AstCommandReference {
  type: 'ast';
  name: string;
  args: CommandArg[];
  raw?: string;
}

interface StringCommandReference {
  type: 'string';
  raw: string;
  name: string;
  argsString: string;
}

// In the execute method:
const commandRef: CommandReference = this.parseCommandReference(directive.command);

// Then use type narrowing:
if (commandRef.type === 'ast') {
  return this.handleAstCommandReference(commandRef, node, context, clonedState);
} else {
  return this.handleStringCommandReference(commandRef, node, context, clonedState);
}
```

**Justification**: This eliminates manual type checking with `typeof` and `in` operators, making the code more predictable and maintainable. It also creates a clear separation between the two command reference formats, allowing for future deprecation of the legacy format.

### 2. Strong Command Definition Interface

```typescript
interface CommandDefinition {
  name: string;
  command: string;
  parameters: string[];
  description?: string;
  isMultiline?: boolean;
}

// In state service:
getCommand(name: string): CommandDefinition | undefined;
```

**Justification**: Currently, the code has to check if `commandDef.command` exists and if `commandDef.parameters` is an array. With a strict interface, these checks become unnecessary, and TypeScript will enforce proper structure at compile time. This prevents runtime errors and simplifies the code.

### 3. Typed Parameter Processing

```typescript
// Define parameter types
type CommandParameterValue = string | number | boolean | null;

interface ProcessedParameters {
  positional: CommandParameterValue[];
  named: Record<string, CommandParameterValue>;
}

// Process parameters with stronger typing
private async processParameters(
  args: CommandArg[],
  context: DirectiveContext
): Promise<ProcessedParameters> {
  // Implementation that returns properly typed parameters
}
```

**Justification**: The current parameter processing is complex with many type checks and conversions. A strongly typed approach would make it clear what types are expected and supported, reducing the need for runtime type checking and conversion. This would also make it easier to add new parameter types in the future.

### 4. Unified Error Handling with Error Types

```typescript
enum CommandExecutionErrorType {
  COMMAND_NOT_FOUND = 'command_not_found',
  INVALID_COMMAND_FORMAT = 'invalid_command_format',
  PARAMETER_RESOLUTION_FAILED = 'parameter_resolution_failed',
  EXECUTION_FAILED = 'execution_failed'
}

interface CommandExecutionError {
  type: CommandExecutionErrorType;
  message: string;
  details?: unknown;
}

// Centralized error handler
private handleCommandError(
  error: unknown,
  node: DirectiveNode,
  commandName: string
): never {
  // Implementation that categorizes errors and throws appropriate DirectiveError
}
```

**Justification**: Currently, error handling is duplicated across multiple methods with similar patterns. A typed error system would make it easier to categorize and handle errors consistently, providing better error messages to users and simplifying the code.

### 5. Command Execution Result Interface

```typescript
interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  duration: number;
}

// Then in the command execution service:
executeShellCommand(
  command: string,
  options: CommandExecutionOptions
): Promise<CommandExecutionResult>;
```

**Justification**: Adding a strict interface for command execution results makes it clear what data is available after command execution. This would eliminate potential undefined/null checks and make it easier to add new fields in the future.

## Implementation Plan

### Phase 1: Refactor Command Reference Parsing

```typescript
/**
 * Parse a command reference from a directive
 */
private parseCommandReference(command: unknown): CommandReference {
  if (command && typeof command === 'object' && 'name' in command) {
    return {
      type: 'ast',
      name: command.name,
      args: command.args || [],
      raw: command.raw
    };
  } else if (typeof command === 'string' && command.startsWith('$')) {
    const match = command.match(/\$([a-zA-Z0-9_]+)(?:\((.*)\))?/);
    if (!match) {
      throw new DirectiveError(
        `Invalid command reference format: ${command}`,
        'run',
        DirectiveErrorCode.EXECUTION_FAILED
      );
    }
    
    return {
      type: 'string',
      raw: command,
      name: match[1],
      argsString: match[2] || ''
    };
  }
  
  throw new DirectiveError(
    `Invalid defined command format: ${JSON.stringify(command)}`,
    'run',
    DirectiveErrorCode.EXECUTION_FAILED
  );
}
```

### Phase 2: Implement Command Definition Interface

```typescript
/**
 * Get command definition with type safety
 */
private getCommandDefinition(
  commandName: string,
  state: IStateService
): CommandDefinition {
  const commandDef = state.getCommand(commandName);
  
  if (!commandDef) {
    throw new DirectiveError(
      `Command '${commandName}' not found`,
      'run',
      DirectiveErrorCode.EXECUTION_FAILED
    );
  }
  
  if (!commandDef.command) {
    throw new DirectiveError(
      `Invalid command format for '${commandName}'`,
      'run',
      DirectiveErrorCode.EXECUTION_FAILED
    );
  }
  
  return {
    name: commandName,
    command: commandDef.command,
    parameters: Array.isArray(commandDef.parameters) ? commandDef.parameters : [],
    description: commandDef.description,
    isMultiline: commandDef.isMultiline
  };
}
```

### Phase 3: Refactor Parameter Processing

```typescript
/**
 * Process arguments with stronger typing
 */
private async processArguments(
  args: CommandArg[],
  context: DirectiveContext
): Promise<string[]> {
  const processedArgs: string[] = [];
  
  for (const arg of args) {
    try {
      const value = await this.resolveArgumentValue(arg, context);
      processedArgs.push(String(value));
    } catch (error) {
      directiveLogger.error(`Error processing argument: ${JSON.stringify(arg)}`, error);
      processedArgs.push(String(arg.value || ''));
    }
  }
  
  return processedArgs;
}

/**
 * Resolve a single argument value with type safety
 */
private async resolveArgumentValue(
  arg: CommandArg,
  context: DirectiveContext
): Promise<CommandParameterValue> {
  const { state } = context;
  
  switch (arg.type) {
    case 'string':
      return arg.value as string;
    case 'number':
      return Number(arg.value);
    case 'boolean':
      return Boolean(arg.value);
    case 'variable':
      return this.resolveVariableArgument(arg.value, context);
    case 'raw':
      return arg.value as string;
    default:
      throw new Error(`Unsupported argument type: ${(arg as any).type}`);
  }
}
```

## Benefits of These Improvements

1. **Reduced Complexity**: Eliminates complex type checking and conditional logic
2. **Improved Safety**: Catches type errors at compile time rather than runtime
3. **Better Maintainability**: Makes code easier to understand and modify
4. **Enhanced Error Messages**: Provides more specific and helpful error information
5. **Future-Proofing**: Makes it easier to add new features or deprecate legacy formats
6. **Performance**: Potentially improves performance by reducing runtime type checks
7. **Documentation**: Types serve as self-documentation for the codebase

## Conclusion

By implementing these type improvements, the `DefinedCommandHandler` service will become more robust, easier to maintain, and better documented. The changes are focused on making the existing functionality more type-safe without changing the behavior, ensuring backward compatibility while improving code quality.

These improvements align with the Meld architecture's focus on clear service boundaries and dependencies, and they build on the existing DI infrastructure to provide more reliable service interactions, particularly for the crucial `@run` directive functionality.