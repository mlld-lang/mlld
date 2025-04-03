# Improving TypeScript Type Definitions for `@define` Directive in Variable Resolution

After analyzing the VariableResolution service code and the documentation for the `@define` directive, I've identified several areas where stronger TypeScript type definitions would significantly improve code safety, readability, and maintainability.

## Current Challenges in the Variable Resolution Service

The current implementation faces several challenges when handling variables that might be defined by the `@define` directive:

1. **Lack of type specificity for command definitions**: The service doesn't have clear type definitions for what constitutes a valid command definition, leading to potential runtime errors.

2. **Ambiguous command type detection**: The code has to infer whether a command is a basic shell command or a language-specific command at runtime.

3. **Parameter handling complexity**: There's no type-safe way to validate that parameters are correctly passed and substituted.

4. **Error-prone field access**: When accessing fields or properties of command definitions, the code relies on runtime checks rather than compile-time guarantees.

5. **Insufficient discrimination between command types**: The service uses conditional logic that could be replaced with stronger type discrimination.

## Proposed Type Improvements

### 1. Discriminated Union for Command Types

```typescript
/**
 * Discriminated union for different types of command definitions
 */
export type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;

/**
 * Definition for basic shell commands
 */
export interface BasicCommandDefinition {
  type: 'basic';
  name: string;
  parameters: string[];
  commandTemplate: string;
  isMultiline: boolean;
}

/**
 * Definition for language-specific commands
 */
export interface LanguageCommandDefinition {
  type: 'language';
  name: string;
  parameters: string[];
  language: 'js' | 'python' | 'bash' | string;
  codeBlock: string;
  languageParameters?: string[];
}
```

**Justification**: 
- This discriminated union provides clear type safety when working with different command types
- The `type` property serves as a reliable discriminator for conditional logic
- Each interface clearly documents the required properties for each command type
- The code can now perform exhaustive checks using TypeScript's type narrowing

### 2. Command Registry Type Definition

```typescript
/**
 * Type-safe registry for storing command definitions
 */
export interface CommandRegistry {
  /**
   * Map of command names to their definitions
   */
  commands: Map<string, CommandDefinition>;
  
  /**
   * Get a command by name with type checking
   */
  getCommand(name: string): CommandDefinition | undefined;
  
  /**
   * Register a new command with type validation
   */
  registerCommand(definition: CommandDefinition): void;
  
  /**
   * Check if a command exists
   */
  hasCommand(name: string): boolean;
}
```

**Justification**:
- Provides a consistent interface for accessing and storing commands
- Encapsulates command storage logic behind a well-defined API
- Enables type checking when retrieving commands
- Makes command registration explicit and type-safe

### 3. Parameter Substitution Types

```typescript
/**
 * Type for parameter mapping during substitution
 */
export interface ParameterMapping {
  /**
   * Map of parameter names to their resolved values
   */
  [paramName: string]: string;
}

/**
 * Options for command execution
 */
export interface CommandExecutionOptions {
  /**
   * Whether to throw errors on missing parameters
   */
  strictParameterChecking?: boolean;
  
  /**
   * Whether to resolve variables in the command template
   */
  resolveVariables?: boolean;
  
  /**
   * Context for variable resolution
   */
  context?: ResolutionContext;
}
```

**Justification**:
- Creates explicit types for parameter handling, reducing ambiguity
- Makes parameter substitution behavior configurable through well-defined options
- Ensures consistency in how parameters are passed and validated
- Improves error handling by making parameter validation rules explicit

### 4. Command Result Type Definition

```typescript
/**
 * Type for command execution results
 */
export interface CommandExecutionResult {
  /**
   * Output of the command
   */
  output: string;
  
  /**
   * Exit code of the command (0 means success)
   */
  exitCode: number;
  
  /**
   * Error message if execution failed
   */
  error?: string;
  
  /**
   * Original command that was executed
   */
  command: string;
  
  /**
   * Type of command that was executed
   */
  commandType: 'basic' | 'language';
}
```

**Justification**:
- Provides a consistent structure for command execution results
- Makes error handling more predictable with standardized result format
- Enables better logging and debugging by capturing command execution details
- Allows for more robust error handling in the variable resolution service

### 5. Enhanced Field Access Types

```typescript
/**
 * Type for accessing fields in command definitions
 */
export interface CommandFieldAccessOptions {
  /**
   * Base command definition
   */
  command: CommandDefinition;
  
  /**
   * Field path to access (e.g., "parameters.0" or "codeBlock")
   */
  fieldPath: string;
  
  /**
   * Whether to throw on missing fields
   */
  strict?: boolean;
  
  /**
   * Default value if field is missing
   */
  defaultValue?: any;
}

/**
 * Type guard for command definitions
 */
export function isCommandDefinition(value: any): value is CommandDefinition {
  return (
    value &&
    typeof value === 'object' &&
    (value.type === 'basic' || value.type === 'language') &&
    typeof value.name === 'string' &&
    Array.isArray(value.parameters)
  );
}

/**
 * Type guard for basic commands
 */
export function isBasicCommand(command: CommandDefinition): command is BasicCommandDefinition {
  return command.type === 'basic';
}

/**
 * Type guard for language commands
 */
export function isLanguageCommand(command: CommandDefinition): command is LanguageCommandDefinition {
  return command.type === 'language';
}
```

**Justification**:
- Provides type-safe access to command fields
- Eliminates the need for manual type checking and casting
- Improves error messages by making field access expectations explicit
- Reduces the risk of runtime errors when accessing command properties

## Integration with the Variable Resolution Service

These type improvements would integrate with the VariableReferenceResolver in several key ways:

1. **Enhanced Command Resolution**:
```typescript
/**
 * Resolve a command reference and prepare it for execution
 */
async resolveCommand(
  commandName: string, 
  args: string[], 
  context: ResolutionContext
): Promise<CommandDefinition | undefined> {
  // Get command from state
  const command = context.state.getCommand(commandName);
  
  // Type guard ensures we have a valid command
  if (!isCommandDefinition(command)) {
    if (context.strict) {
      throw VariableResolutionErrorFactory.commandNotFound(commandName);
    }
    return undefined;
  }
  
  // Type narrowing allows for command-specific handling
  if (isBasicCommand(command)) {
    // Handle basic command
    return this.prepareBasicCommand(command, args, context);
  } else if (isLanguageCommand(command)) {
    // Handle language command
    return this.prepareLanguageCommand(command, args, context);
  }
  
  // Exhaustive check - TypeScript will error if we miss a case
  throw new Error(`Unknown command type: ${(command as any).type}`);
}
```

2. **Type-Safe Parameter Substitution**:
```typescript
/**
 * Substitute parameters in a command template
 */
private substituteParameters(
  template: string, 
  parameters: string[], 
  args: string[], 
  context: ResolutionContext
): string {
  // Create parameter mapping
  const paramMap: ParameterMapping = {};
  
  // Map parameters to arguments
  for (let i = 0; i < parameters