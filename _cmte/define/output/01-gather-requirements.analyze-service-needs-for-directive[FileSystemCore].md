# FileSystemCore Service Improvements for @define Types

## Current State Analysis

After examining the FileSystemService code and the broader Meld architecture, I've identified several areas where stronger typing for the `@define` directive would significantly improve the service's reliability and maintainability.

The FileSystemService is responsible for file operations and command execution, making it a critical component when handling `@define` directives and their execution via `@run`. Currently, the service has limited type support for command execution, which creates several challenges:

## Key Improvement Areas

### 1. Command Execution Type Safety

**Current Issue:**
The `executeCommand` method currently accepts any string as a command without validation or type checking:

```typescript
async executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>
```

This creates several problems:
- No distinction between regular shell commands and defined commands
- No parameter validation for defined commands
- No compile-time verification of command structure

**Proposed Solution:**
Create a discriminated union type for commands:

```typescript
// Define command types
type CommandType = 'shell' | 'defined' | 'language';

// Base command interface
interface BaseCommand {
  type: CommandType;
  options?: { cwd?: string };
}

// Shell command (direct execution)
interface ShellCommand extends BaseCommand {
  type: 'shell';
  command: string;
}

// Defined command (from @define directive)
interface DefinedCommand extends BaseCommand {
  type: 'defined';
  name: string;
  parameters: Record<string, string>;
  originalTemplate?: string;
}

// Language command (JavaScript, Python, etc.)
interface LanguageCommand extends BaseCommand {
  type: 'language';
  language: 'js' | 'python' | 'bash';
  code: string;
  parameters: string[];
}

// Union type for all commands
type Command = ShellCommand | DefinedCommand | LanguageCommand;
```

**Benefits:**
1. **Type Safety**: Prevents mixing of different command types
2. **Parameter Validation**: Ensures defined commands receive the correct parameters
3. **Better IDE Support**: Provides autocomplete and documentation for command properties
4. **Error Prevention**: Catches command structure errors at compile time

### 2. Command Definition Type

**Current Issue:**
The service lacks a clear type definition for command templates created via `@define`, making it difficult to validate and process them consistently.

**Proposed Solution:**
Create a dedicated type for command definitions:

```typescript
interface CommandParameter {
  name: string;
  defaultValue?: string;
  required: boolean;
}

interface CommandDefinition {
  name: string;
  parameters: CommandParameter[];
  template: string;
  isLanguageCommand: boolean;
  language?: 'js' | 'python' | 'bash';
  codeBlock?: string;
}
```

**Benefits:**
1. **Consistent Structure**: Ensures all command definitions follow the same structure
2. **Parameter Validation**: Makes it easier to validate parameters when executing commands
3. **Clear Documentation**: Provides a self-documenting type for command definitions
4. **Integration with State Service**: Simplifies storage and retrieval of command definitions

### 3. Command Execution Result Type

**Current Issue:**
The current return type for `executeCommand` is simplistic and doesn't provide enough context about the execution:

```typescript
Promise<{ stdout: string; stderr: string }>
```

**Proposed Solution:**
Enhance the return type to include more execution context:

```typescript
interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: Command;
  executionTime: number;
  successful: boolean;
}
```

**Benefits:**
1. **Rich Context**: Provides more information about the command execution
2. **Error Handling**: Makes it easier to determine if a command succeeded
3. **Debugging**: Includes the original command for debugging purposes
4. **Performance Tracking**: Includes execution time for performance analysis

### 4. Command Validation Type

**Current Issue:**
There's no structured way to validate commands before execution, leading to runtime errors.

**Proposed Solution:**
Create a validation result type:

```typescript
interface CommandValidationError {
  code: string;
  message: string;
  parameter?: string;
  suggestion?: string;
}

interface CommandValidationResult {
  valid: boolean;
  command: Command;
  errors: CommandValidationError[];
}
```

**Benefits:**
1. **Early Error Detection**: Catches command errors before execution
2. **Detailed Error Messages**: Provides specific information about validation failures
3. **Suggestions**: Can offer suggestions to fix invalid commands
4. **Consistent Validation**: Ensures all commands are validated consistently

## Implementation Example

Here's how these types could be integrated into the FileSystemService:

```typescript
// Updated executeCommand method with stronger typing
async executeCommand(command: Command): Promise<CommandExecutionResult> {
  const context = {
    operation: 'executeCommand',
    commandType: command.type,
    command: command.type === 'shell' ? command.command : command.name
  };

  try {
    logger.debug('Executing command', context);
    
    let result: { stdout: string; stderr: string; exitCode: number };
    const startTime = Date.now();
    
    switch (command.type) {
      case 'shell':
        result = await this.fs.executeCommand(command.command, command.options);
        break;
        
      case 'defined':
        // Get the command definition from state
        const definition = await this.getCommandDefinition(command.name);
        if (!definition) {
          throw new MeldFileSystemError(`Command not found: ${command.name}`, { command: command.name });
        }
        
        // Apply parameters to template
        const resolvedCommand = this.applyParametersToTemplate(definition, command.parameters);
        result = await this.fs.executeCommand(resolvedCommand, command.options);
        break;
        
      case 'language':
        // Execute language command
        result = await this.executeLanguageCommand(command);
        break;
    }
    
    const executionTime = Date.now() - startTime;
    
    logger.debug('Command executed successfully', { 
      ...context, 
      stdout: result.stdout, 
      stderr: result.stderr,
      exitCode: result.exitCode,
      executionTime
    });
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      command,
      executionTime,
      successful: result.exitCode === 0
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to execute command', { ...context, error: err });
    throw new MeldFileSystemError(`Failed to execute command: ${
      command.type === 'shell' ? command.command : command.name
    }`, {
      cause: err,
      command: command.type === 'shell' ? command.command : command.name
    });
  }
}
```

## Validation Method Example

```typescript
// Command validation method
validateCommand(command: Command): CommandValidationResult {
  const errors: CommandValidationError[] = [];
  
  switch (command.type) {
    case 'defined':
      // Get the command definition
      const definition = this.getCommandDefinition(command.name);
      
      // Check if command exists
      if (!definition) {
        errors.push({
          code: 'COMMAND_NOT_FOUND',
          message: `Command '${command.name}' not found`,
          suggestion: 'Check the command name or define it using @define'
        });
        break;
      }
      
      // Validate parameters
      for (const param of definition.parameters) {
        if (param.required && !command.parameters[param.name]) {
          errors.push({
            code: 'MISSING_PARAMETER',
            message: `Missing required parameter: ${param.name}`,
            parameter: param.name,
            suggestion: `Provide a value for '${param.name}'`
          });
        }
      }
      break;
      
    case 'language':
      // Validate language
      if (!['js', 'python', 'bash'].includes(command.language)) {
        errors.push({
          code: 'INVALID_LANGUAGE',
          message: `Invalid language: ${command.language}`,
          suggestion: 'Use one of: js, python, bash'
        });
      }
      break;
  }
  
  return {
    valid: errors.length === 0,
    command,
    errors
  };
}
```

## Benefits for FileSystemCore Service

1. **Reduced Error Handling**: The discriminated union pattern eliminates many runtime checks and error cases.

2. **Improved Developer Experience**: Strong types provide better autocomplete, documentation, and error messages.

3. **Consistency with Meld Architecture**: These types align with Meld's directive-based architecture and dependency injection pattern.

4. **Simplified Testing**: Well-defined types make it easier to create mock commands and test the service.

5. **Better Integration with State Service**: Clear types for command definitions improve how they're stored and retrieved from the state.

6. **Enhanced Security**: Stronger typing reduces the risk of command injection and other security issues.

7. **Future-Proofing**: The type structure allows for easy extension to support new command types or parameters.

## Conclusion

Implementing stronger TypeScript types for the `@define` directive would significantly improve the FileSystemCore service by making command execution more robust, reducing runtime errors, and providing better documentation and IDE support. These changes align with Meld's architecture and would make the service easier to maintain and extend in the future.