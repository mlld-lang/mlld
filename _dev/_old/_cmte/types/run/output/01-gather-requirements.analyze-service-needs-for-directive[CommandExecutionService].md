# CommandExecutionService Code Enhancements with Stronger Run Types

After analyzing the CommandExecutionService implementation, I've identified several opportunities to improve type safety and clarity when handling the different `@run` directive subtypes. The current implementation handles execution well but could benefit from stronger typing to better reflect the three distinct run types (BasicCommand, LanguageCommand, DefinedCommand) and their specific requirements.

## 1. Create Discriminated Union for Run Types

### Current Challenge:
The service currently has separate methods for shell commands and language code but lacks a clear type structure that maps to the three `@run` directive subtypes. This leads to manual validation and unclear parameter requirements for each type.

### Proposed Solution:
Implement a discriminated union type for run commands:

```typescript
/**
 * Discriminated union for different types of run commands
 */
export type RunCommand = 
  | BasicRunCommand 
  | LanguageRunCommand 
  | DefinedRunCommand;

export interface BasicRunCommand {
  type: 'basic';
  command: string;
  isMultiLine: boolean;
}

export interface LanguageRunCommand {
  type: 'language';
  code: string;
  language: string;
  parameters: string[];
}

export interface DefinedRunCommand {
  type: 'defined';
  commandName: string;
  parameters: string[];
  commandTemplate?: string; // The original command template if available
}
```

### Justification:
1. **Type Safety**: The discriminated union ensures we can't mix parameters from different run types
2. **Self-Documentation**: The types clearly document what parameters each run type requires
3. **Exhaustiveness Checking**: TypeScript can enforce handling of all run types in switch statements
4. **Simplified Validation**: Parameter validation becomes type-driven rather than manual checks

## 2. Specialized Execution Options Per Run Type

### Current Challenge:
The current `ExecutionOptions` interface is generic and doesn't reflect the specific options relevant to each run type. This leads to confusion about which options apply in which contexts.

### Proposed Solution:
Create specialized execution options interfaces for each run type:

```typescript
/**
 * Base execution options applicable to all run types
 */
export interface BaseExecutionOptions {
  showAnimation?: boolean;
  animationMessage?: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Options specific to basic shell commands
 */
export interface BasicCommandOptions extends BaseExecutionOptions {
  shell?: string; // Allow specifying shell (bash, sh, zsh, etc.)
}

/**
 * Options specific to language commands
 */
export interface LanguageCommandOptions extends BaseExecutionOptions {
  parameters?: string[];
  preserveTempFile?: boolean; // For debugging purposes
}

/**
 * Options specific to defined commands
 */
export interface DefinedCommandOptions extends BaseExecutionOptions {
  resolveVariablesInTemplate?: boolean; // Whether to resolve variables in the command template
}

/**
 * Union type for all execution options
 */
export type ExecutionOptions = 
  | (BasicCommandOptions & { commandType: 'basic' })
  | (LanguageCommandOptions & { commandType: 'language' })
  | (DefinedCommandOptions & { commandType: 'defined' });
```

### Justification:
1. **Contextual Clarity**: Each run type gets options relevant to its execution context
2. **Prevents Misuse**: Prevents passing language-specific options to shell commands
3. **IDE Support**: Better autocomplete and documentation in the IDE
4. **Future Extensibility**: Makes it easier to add type-specific options in the future

## 3. Unified Execution Method with Type-Based Routing

### Current Challenge:
The service has separate methods for shell and language execution, but nothing specifically for defined commands. This creates inconsistent handling across run types.

### Proposed Solution:
Create a unified execution method that handles all run types through the discriminated union:

```typescript
/**
 * Executes a command based on its type
 * 
 * @param command The command to execute (BasicRunCommand, LanguageRunCommand, or DefinedRunCommand)
 * @param options Type-specific execution options
 * @returns A promise resolving to the execution result
 */
public async executeCommand(
  command: RunCommand,
  options?: Partial<ExecutionOptions>
): Promise<ExecutionResult> {
  // Type-based routing with exhaustiveness checking
  switch (command.type) {
    case 'basic':
      return this.executeBasicCommand(command, options as Partial<BasicCommandOptions>);
    
    case 'language':
      return this.executeLanguageCommand(command, options as Partial<LanguageCommandOptions>);
    
    case 'defined':
      return this.executeDefinedCommand(command, options as Partial<DefinedCommandOptions>);
    
    default:
      // Exhaustiveness check - this should never happen if types are correct
      const _exhaustiveCheck: never = command;
      throw new Error(`Unsupported command type: ${(_exhaustiveCheck as any).type}`);
  }
}

// Private implementation methods for each command type
private async executeBasicCommand(
  command: BasicRunCommand,
  options?: Partial<BasicCommandOptions>
): Promise<ExecutionResult> {
  // Implementation for basic commands
}

private async executeLanguageCommand(
  command: LanguageRunCommand,
  options?: Partial<LanguageCommandOptions>
): Promise<ExecutionResult> {
  // Implementation for language commands
}

private async executeDefinedCommand(
  command: DefinedRunCommand,
  options?: Partial<DefinedCommandOptions>
): Promise<ExecutionResult> {
  // Implementation for defined commands
}
```

### Justification:
1. **Consistent API**: One method for all command types creates a simpler, more consistent API
2. **Type Safety**: Each implementation method receives the correct command and options types
3. **Exhaustiveness Checking**: TypeScript ensures all command types are handled
4. **Implementation Isolation**: Each command type's execution logic is isolated and focused

## 4. Enhanced Parameter Type Handling

### Current Challenge:
Parameters are currently handled as simple string arrays, which doesn't capture the rich type information that could be available from data variables or command arguments.

### Proposed Solution:
Create a more robust parameter type system:

```typescript
/**
 * Types of parameters that can be passed to commands
 */
export type CommandParameter = 
  | StringParameter
  | NumberParameter
  | BooleanParameter
  | ObjectParameter
  | ArrayParameter;

export interface StringParameter {
  type: 'string';
  value: string;
}

export interface NumberParameter {
  type: 'number';
  value: number;
}

export interface BooleanParameter {
  type: 'boolean';
  value: boolean;
}

export interface ObjectParameter {
  type: 'object';
  value: Record<string, unknown>;
}

export interface ArrayParameter {
  type: 'array';
  value: unknown[];
}

/**
 * Convert parameters to their string representation for command line usage
 */
export function stringifyParameter(param: CommandParameter): string {
  switch (param.type) {
    case 'string':
      return param.value;
    case 'number':
    case 'boolean':
      return String(param.value);
    case 'object':
    case 'array':
      return JSON.stringify(param.value);
  }
}
```

### Justification:
1. **Type Preservation**: Maintains the original type information of parameters
2. **Better Serialization**: Can properly serialize different types for command line usage
3. **Enhanced Debugging**: Makes it clear what type each parameter is during debugging
4. **Safer Type Conversions**: Explicit type conversion rather than implicit coercion

## 5. Result Type Enhancements

### Current Challenge:
The current `ExecutionResult` interface doesn't provide structured information about the success or failure of the command, requiring manual checking of exit codes.

### Proposed Solution:
Enhance the result type to provide more structured information:

```typescript
/**
 * Enhanced result of a command execution
 */
export interface ExecutionResult {
  /**
   * Whether the command executed successfully (exit code 0)
   */
  success: boolean;
  
  /**
   * The standard output of the command
   */
  stdout: string;
  
  /**
   * The standard error output of the command
   */
  stderr: string;
  
  /**
   * The exit code of the command
   */
  exitCode: number;
  
  /**
   * Duration of the command execution in milliseconds
   */
  duration: number;
  
  /**
   * Command that was executed (for debugging/logging)
   */
  command: string;
  
  /**
   * Any error that occurred during execution
   */
  error?: Error;
}
```

### Justification:
1. **Simplified Success Checking**: The `success` flag eliminates the need to check exit codes
2. **Better Debugging**: The `duration` and `command` fields help with performance analysis and debugging
3. **Error Handling**: The `error` field provides direct access to any execution error
4. **Comprehensive Results**: All information about the execution is available in one structure

## 6. Command Factory Methods

### Current Challenge:
Creating command objects requires manual construction and knowledge of the exact structure needed.

### Proposed Solution:
Add factory methods to simplify command creation:

```typescript
/**
 * Factory methods for creating run commands
 */
export class RunCommandFactory {
  /**
   * Creates a basic shell command
   */
  static createBasicCommand(command: string, isMultiLine: boolean = false): BasicRunCommand {
    return {
      type: 'basic',
      command,
      isMultiLine
    };
  }
  
  /**
   * Creates a language command
   */
  static createLanguageCommand(
    code: string,
    language: string,
    parameters: string[] = []
  ): LanguageRunCommand {
    return {
      type: 'language',
      code,
      language,
      parameters
    };
  }
  
  /**
   * Creates a defined command
   */
  static createDefinedCommand(
    commandName: string,
    parameters: string[] = [],
    commandTemplate?: string
  ): DefinedRunCommand {
    return {
      type: 'defined',
      commandName,
      parameters,
      commandTemplate
    };
  }
}
```

### Justification:
1. **Simplified Command Creation**: No need to manually construct command objects
2. **Enforced Structure**: Factory methods ensure commands have the correct structure
3. **Self-Documentation**: Factory methods document the required parameters for each command type
4. **Default Values**: Provides sensible defaults for optional parameters

## Implementation Benefits

These enhancements would significantly improve the CommandExecutionService by:

1. **Clearer Intent**: Code explicitly shows which run type is being handled
2. **Reduced Errors**: Type safety prevents mixing parameters from different run types
3. **Better Maintainability**: Each run type has its own dedicated handling logic
4. **Improved Testing**: Easier to test each run type separately with type-specific inputs
5. **Enhanced Documentation**: Types serve as self-documentation for the service API
6. **Future-Proofing**: Makes it easier to add new run types or options in the future

The proposed changes maintain backward compatibility while providing a clearer, more type-safe interface for consumers of the CommandExecutionService, making it easier to understand and use correctly.