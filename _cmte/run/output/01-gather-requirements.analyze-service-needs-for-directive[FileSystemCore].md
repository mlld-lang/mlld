# FileSystemCore Service Improvements for `@run` Directive Types

As the lead developer for the FileSystemCore service, I've analyzed how our service interacts with `@run` directives and identified several opportunities to improve type safety and code clarity. The current implementation has some limitations when handling different `@run` directive subtypes, which creates complexity and potential for errors.

## Current Challenges

Our `FileSystemService` is responsible for executing commands through the `executeCommand` method, which is used by various `@run` directive handlers. However, the current implementation has several limitations:

1. **Undifferentiated Command Types**: The `executeCommand` method accepts a simple string parameter without distinguishing between basic shell commands, language-specific scripts, or defined commands.

2. **Limited Command Options**: The options object only supports a `cwd` parameter, lacking necessary context for language-specific execution.

3. **Incomplete Error Context**: Error handling doesn't capture the specific `@run` subtype that failed, making debugging difficult.

4. **Missing Type Safety for Script Execution**: No type-safe way to execute language-specific scripts with appropriate parameters.

## Proposed Type Improvements

### 1. Discriminated Union for Command Types

**Proposal**: Create a discriminated union type to represent the different command types that can be executed.

```typescript
/**
 * Represents the different types of commands that can be executed
 */
export type RunCommandType = 
  | { type: 'basicCommand'; command: string }
  | { type: 'languageCommand'; language: 'js' | 'python' | 'bash'; script: string; args: string[] }
  | { type: 'definedCommand'; name: string; args: string[] };
```

**Justification**: This would:
- Make the command type explicit in the API
- Enable type-safe handling of each command type
- Allow for specialized error messages based on command type
- Provide better documentation of the supported command types

### 2. Enhanced Execute Command Method

**Proposal**: Update the `executeCommand` method to use the discriminated union type:

```typescript
/**
 * Executes a command based on its type
 * 
 * @param command - The command to execute
 * @param options - Command execution options
 * @returns A promise that resolves with the command output
 * @throws {MeldCommandError} If the command fails
 */
executeCommand(
  command: RunCommandType, 
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }>;
```

**Justification**: This would:
- Provide clear type information about the command being executed
- Allow for specialized handling of each command type
- Make it obvious to callers what types of commands are supported
- Enable better error reporting with command type context

### 3. Specialized Execution Methods

**Proposal**: Add specialized methods for each command type:

```typescript
/**
 * Executes a basic shell command
 * 
 * @param command - The shell command to execute
 * @param options - Command execution options
 * @returns A promise that resolves with the command output
 */
executeShellCommand(
  command: string, 
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }>;

/**
 * Executes a script in the specified language
 * 
 * @param language - The language to execute the script in
 * @param script - The script content to execute
 * @param args - Arguments to pass to the script
 * @param options - Command execution options
 * @returns A promise that resolves with the script output
 */
executeLanguageScript(
  language: 'js' | 'python' | 'bash',
  script: string,
  args: string[] = [],
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }>;

/**
 * Executes a previously defined command
 * 
 * @param commandName - The name of the defined command
 * @param args - Arguments to pass to the command
 * @param options - Command execution options
 * @returns A promise that resolves with the command output
 */
executeDefinedCommand(
  commandName: string,
  args: string[] = [],
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }>;
```

**Justification**: This would:
- Provide a clearer API for executing specific command types
- Allow for specialized implementation details for each command type
- Reduce the need for type checking and casting in the implementation
- Make it easier to add new command types in the future

### 4. Enhanced Error Types

**Proposal**: Create specialized error types for each command type:

```typescript
/**
 * Base error class for command execution errors
 */
export class MeldCommandError extends MeldError {
  constructor(message: string, options?: ErrorOptions & { command: RunCommandType }) {
    super(message, options);
  }
}

/**
 * Error thrown when a shell command fails
 */
export class MeldShellCommandError extends MeldCommandError {
  constructor(command: string, options?: ErrorOptions) {
    super(`Shell command failed: ${command}`, {
      ...options,
      command: { type: 'basicCommand', command }
    });
  }
}

/**
 * Error thrown when a language script fails
 */
export class MeldLanguageScriptError extends MeldCommandError {
  constructor(
    language: 'js' | 'python' | 'bash',
    script: string,
    args: string[] = [],
    options?: ErrorOptions
  ) {
    super(`${language} script execution failed`, {
      ...options,
      command: { type: 'languageCommand', language, script, args }
    });
  }
}

/**
 * Error thrown when a defined command fails
 */
export class MeldDefinedCommandError extends MeldCommandError {
  constructor(
    commandName: string,
    args: string[] = [],
    options?: ErrorOptions
  ) {
    super(`Defined command '${commandName}' failed`, {
      ...options,
      command: { type: 'definedCommand', name: commandName, args }
    });
  }
}
```

**Justification**: This would:
- Provide more context in error messages
- Allow for specialized error handling based on command type
- Make it easier to debug command execution failures
- Improve error reporting in logs and UI

### 5. Temporary File Management Interface

**Proposal**: Add an interface for managing temporary files used by language scripts:

```typescript
/**
 * Options for creating temporary script files
 */
export interface TempScriptOptions {
  prefix?: string;
  suffix?: string;
  directory?: string;
  content: string;
  executable?: boolean;
}

/**
 * Information about a created temporary script
 */
export interface TempScriptInfo {
  path: string;
  language: 'js' | 'python' | 'bash';
  cleanup: () => Promise<void>;
}

/**
 * Creates a temporary script file for execution
 * 
 * @param language - The language of the script
 * @param options - Options for creating the temporary file
 * @returns Information about the created temporary script
 */
createTempScriptFile(
  language: 'js' | 'python' | 'bash',
  options: TempScriptOptions
): Promise<TempScriptInfo>;
```

**Justification**: This would:
- Provide a consistent way to manage temporary script files
- Ensure proper cleanup of temporary files
- Allow for specialized handling of different script languages
- Reduce duplication in command handlers that need to create temporary files

## Implementation Example

Here's an example of how the `executeCommand` method could be implemented with these new types:

```typescript
async executeCommand(
  command: RunCommandType,
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }> {
  const context = {
    operation: 'executeCommand',
    commandType: command.type,
    cwd: options?.cwd
  };

  try {
    logger.debug('Executing command', { ...context, command });

    let result: { stdout: string; stderr: string };

    switch (command.type) {
      case 'basicCommand':
        result = await this.fs.executeCommand(command.command, options);
        break;
      case 'languageCommand':
        const tempScript = await this.createTempScriptFile(command.language, {
          content: command.script,
          executable: true
        });
        try {
          const execCommand = `${this.getLanguageExecutable(command.language)} ${tempScript.path} ${command.args.join(' ')}`;
          result = await this.fs.executeCommand(execCommand, options);
        } finally {
          await tempScript.cleanup();
        }
        break;
      case 'definedCommand':
        // Implementation for defined commands
        result = await this.executeDefinedCommandImpl(command.name, command.args, options);
        break;
      default:
        // Exhaustiveness check
        const _exhaustiveCheck: never = command;
        throw new MeldError(`Unsupported command type: ${(command as any).type}`);
    }

    logger.debug('Command executed successfully', { 
      ...context, 
      stdout: result.stdout.substring(0, 100) + (result.stdout.length > 100 ? '...' : ''),
      stderr: result.stderr.substring(0, 100) + (result.stderr.length > 100 ? '...' : '')
    });
    
    return result;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to execute command', { ...context, error: err });
    
    switch (command.type) {
      case 'basicCommand':
        throw new MeldShellCommandError(command.command, { cause: err });
      case 'languageCommand':
        throw new MeldLanguageScriptError(command.language, command.script, command.args, { cause: err });
      case 'definedCommand':
        throw new MeldDefinedCommandError(command.name, command.args, { cause: err });
    }
  }
}
```

## Benefits to the FileSystemCore Service

These improvements would bring several benefits to our service:

1. **Improved Type Safety**: The discriminated union ensures we handle all command types correctly.

2. **Better Error Handling**: Specialized error types provide more context for debugging.

3. **Clearer API**: The specialized methods make the API more intuitive for callers.

4. **Reduced Complexity**: Command handlers can use the appropriate method without complex type checking.

5. **Future Extensibility**: Adding new command types or options becomes easier with this structure.

6. **Improved Testing**: The specialized methods are easier to test in isolation.

7. **Better Documentation**: The types themselves serve as documentation for how commands should be structured.

## Conclusion

By implementing these type improvements, we can make the FileSystemCore service more robust, easier to use, and better equipped to handle the various `@run` directive subtypes. This will reduce bugs, improve error messages, and make the codebase more maintainable as we continue to enhance the Meld language's capabilities.