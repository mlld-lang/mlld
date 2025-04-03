# Proposed Improvements for FileSystemService with Stronger Define Types

## Analysis of Current Implementation

After examining the `FileSystemService` code and related documentation, I've identified several areas where stronger TypeScript types for the `@define` directive would benefit the codebase, particularly in the `executeCommand` method which is critical for the `@define` and `@run` directive functionality.

## Key Challenges in Current Implementation

1. **Command Execution Type Safety**: The `executeCommand` method accepts any string as a command without type validation.
2. **Undefined Command Template Structure**: No clear type definitions for command templates created by `@define`.
3. **Parameter Validation**: No type-level validation for parameters passed to commands.
4. **Language-Specific Command Handling**: No type differentiation between shell commands and language-specific commands.
5. **Command Result Type Safety**: Return type doesn't reflect potential structured data from language commands.

## Proposed Type Improvements

### 1. Command Definition Types

```typescript
/**
 * Represents a command template defined with @define
 */
export type CommandDefinition = ShellCommandDefinition | LanguageCommandDefinition;

/**
 * Represents a shell command template
 */
export interface ShellCommandDefinition {
  kind: 'shell';
  name: string;
  parameters: string[];
  template: string;
  isMultiline: boolean;
}

/**
 * Supported language types for language commands
 */
export type SupportedLanguage = 'js' | 'python' | 'bash';

/**
 * Represents a language-specific command template
 */
export interface LanguageCommandDefinition {
  kind: 'language';
  name: string;
  language: SupportedLanguage;
  parameters: string[];
  codeBlock: string;
}
```

**Justification**: These discriminated union types would provide clear structure for command definitions. This would help the `FileSystemService.executeCommand` method validate commands before execution, reducing runtime errors and improving type safety when interacting with the `@define` directive.

### 2. Command Execution Types

```typescript
/**
 * Options for executing a command
 */
export interface CommandExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  /** When true, throws on non-zero exit code */
  failOnError?: boolean;
}

/**
 * Result of executing a command
 */
export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Structured data for language commands that return JSON */
  data?: unknown;
}

/**
 * Parameters for executing a defined command
 */
export interface DefinedCommandExecution {
  commandName: string;
  args: string[];
  options?: CommandExecutionOptions;
}
```

**Justification**: These types would provide stronger validation for command execution parameters. The `FileSystemService` would benefit from clear parameter validation, reducing the need for defensive coding and runtime checks.

### 3. Enhanced executeCommand Method Type

```typescript
/**
 * Executes a shell command or a predefined command.
 * 
 * @param commandOrDefinition - Command string or defined command execution
 * @param options - Command options
 * @returns A promise that resolves with the command output
 * @throws {MeldCommandError} If the command fails
 */
executeCommand(
  commandOrDefinition: string | DefinedCommandExecution,
  options?: CommandExecutionOptions
): Promise<CommandExecutionResult>;
```

**Justification**: This overloaded method signature would allow the `FileSystemService` to handle both raw shell commands and structured defined commands. This would simplify the integration with the `@run` directive handler, which needs to execute commands defined by `@define`.

### 4. Command Template Resolution Types

```typescript
/**
 * Represents a command with resolved parameters
 */
export interface ResolvedCommand {
  /** The final command string with all parameters and variables resolved */
  command: string;
  /** The working directory for the command */
  cwd?: string;
  /** For language commands, the language to use */
  language?: SupportedLanguage;
  /** For language commands, the code to execute */
  code?: string;
}

/**
 * Service for resolving command templates with parameters
 */
export interface ICommandTemplateResolver {
  /**
   * Resolves a command template with the given parameters
   * 
   * @param definition - The command definition to resolve
   * @param args - The arguments to use for parameter substitution
   * @returns The resolved command
   */
  resolveCommandTemplate(
    definition: CommandDefinition,
    args: string[]
  ): ResolvedCommand;
}
```

**Justification**: These types would formalize the process of resolving command templates with parameters. The `FileSystemService` would benefit from a clear contract for command resolution, reducing the complexity of parameter substitution logic.

## Implementation Example

Here's how the enhanced `executeCommand` method in `FileSystemService` would look with these improved types:

```typescript
async executeCommand(
  commandOrDefinition: string | DefinedCommandExecution,
  options: CommandExecutionOptions = {}
): Promise<CommandExecutionResult> {
  let command: string;
  let resolvedOptions = { ...options };
  
  // Handle string command vs defined command
  if (typeof commandOrDefinition === 'string') {
    command = commandOrDefinition;
  } else {
    // This would use the state service to get the command definition
    const definition = await this.getCommandDefinition(commandOrDefinition.commandName);
    if (!definition) {
      throw new MeldCommandError(`Command not found: ${commandOrDefinition.commandName}`);
    }
    
    // Use the command resolver to get the final command string
    const resolved = this.commandResolver.resolveCommandTemplate(
      definition,
      commandOrDefinition.args
    );
    
    command = resolved.command;
    if (resolved.cwd) {
      resolvedOptions.cwd = resolved.cwd;
    }
    
    // Handle language-specific commands
    if (definition.kind === 'language') {
      return this.executeLanguageCommand(
        definition.language,
        resolved.code || '',
        commandOrDefinition.args,
        resolvedOptions
      );
    }
  }

  const context = {
    operation: 'executeCommand',
    command,
    options: resolvedOptions
  };

  try {
    logger.debug('Executing command', context);
    const result = await this.fs.executeCommand(command, resolvedOptions);
    logger.debug('Command executed successfully', { 
      ...context, 
      stdout: result.stdout.substring(0, 100) + (result.stdout.length > 100 ? '...' : ''),
      exitCode: result.exitCode || 0
    });
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode || 0
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to execute command', { ...context, error: err });
    throw new MeldCommandError(`Failed to execute command: ${command}`, {
      cause: err,
      command
    });
  }
}
```

## Benefits to FileSystemService

1. **Type Safety**: The service would have stronger type guarantees when executing commands, reducing runtime errors.

2. **Self-Documenting Code**: The types clearly document the expected structure of commands and their parameters.

3. **Better Error Messages**: With proper types, TypeScript can catch errors at compile time rather than runtime.

4. **Simplified Integration**: The service would have a clearer interface for integrating with the `@define` and `@run` directive handlers.

5. **Reduced Defensive Coding**: With proper types, less defensive coding is needed to handle edge cases.

6. **Improved Testability**: Well-defined types make it easier to create test fixtures and mock implementations.

7. **Enhanced IDE Support**: Better types provide better autocomplete and documentation in IDEs.

8. **Future-Proofing**: The types can evolve as the `@define` directive evolves, without breaking existing code.

## Implementation Strategy

To implement these improvements:

1. Create the new type definitions in a dedicated file