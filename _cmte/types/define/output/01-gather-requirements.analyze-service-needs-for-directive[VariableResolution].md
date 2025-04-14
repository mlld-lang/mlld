# Improving TypeScript Types for @define Command Handling in Variable Resolution

After examining the code and understanding the Meld architecture, I've identified several opportunities to improve TypeScript types specifically for the `@define` directive. These improvements would make the Variable Resolution service more robust when handling command definitions and their execution.

## Current Challenges

The `VariableReferenceResolver` handles variable resolution but lacks strong typing for command definitions created via `@define`. This creates several issues:

1. **Ambiguous Command Structure**: The code currently handles commands as generic variables without distinguishing between basic shell commands and language-specific commands.

2. **Parameter Validation**: There's no type-safe way to validate that parameters are correctly passed when resolving command references.

3. **Command Type Discrimination**: The code doesn't distinguish between different command types when resolving variables.

4. **Text vs. Code Block Handling**: The current implementation doesn't have clear type distinctions for text-based command templates versus code blocks.

## Proposed Type Improvements

### 1. Define a Command Definition Interface

```typescript
/**
 * Represents a command definition created with @define
 */
export interface CommandDefinition {
  // Common properties for all command definitions
  name: string;
  parameters: string[];
  // Discriminant property to distinguish command types
  commandType: 'basic' | 'language';
  // Properties specific to each type
  template?: string;           // For basic commands
  language?: string;           // For language commands
  codeBlock?: string;          // For language commands
  // Metadata
  definedInFile?: string;      // Source file of definition
  definedAtLine?: number;      // Line number in source
}
```

**Justification**: This provides a clear structure for command definitions, making it easier to validate and process them. The discriminant property `commandType` allows for type narrowing when handling different command types, reducing the need for type checking at runtime.

### 2. Create Discriminated Union Types for Command Types

```typescript
/**
 * Basic shell command definition (uses template string)
 */
export interface BasicCommandDefinition extends CommandDefinition {
  commandType: 'basic';
  template: string;  // Required for basic commands
  language?: never;  // Not applicable
  codeBlock?: never; // Not applicable
}

/**
 * Language-specific command definition (uses code block)
 */
export interface LanguageCommandDefinition extends CommandDefinition {
  commandType: 'language';
  language: string;   // Required for language commands
  codeBlock: string;  // Required for language commands
  template?: never;   // Not applicable
}

/**
 * Union type for all command types
 */
export type AnyCommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;
```

**Justification**: This discriminated union pattern enforces that each command type has the correct properties, preventing mixing of incompatible properties. The TypeScript compiler will enforce these constraints, making it impossible to create an invalid command definition. This eliminates an entire class of runtime errors.

### 3. Add Parameter Handling Types

```typescript
/**
 * Represents a command invocation with arguments
 */
export interface CommandInvocation {
  commandName: string;
  arguments: any[];
  rawArgumentsText?: string;
}

/**
 * Result of parameter resolution for a command
 */
export interface ResolvedCommandParameters {
  success: boolean;
  parameters: Record<string, any>;
  errors?: string[];
}
```

**Justification**: These types provide a clear structure for handling command invocations and parameter resolution. This makes it easier to validate that all required parameters are provided and properly resolved before command execution, reducing the risk of runtime errors.

### 4. Create a Command Store Interface

```typescript
/**
 * Interface for accessing command definitions
 */
export interface ICommandStore {
  getCommand(name: string): AnyCommandDefinition | undefined;
  hasCommand(name: string): boolean;
  listCommands(): string[];
}
```

**Justification**: This abstraction separates command storage from command resolution, making it easier to test and maintain. It also provides a clear API for accessing commands, reducing the risk of inconsistent access patterns.

### 5. Add Command Resolution Context Type

```typescript
/**
 * Extended resolution context with command-specific properties
 */
export interface CommandResolutionContext extends ResolutionContext {
  isCommandExecution?: boolean;
  currentCommand?: string;
  parameterMap?: Record<string, any>;
  preserveRawCodeBlock?: boolean;
}
```

**Justification**: This specialized context type provides command-specific information during resolution, making it easier to handle command-specific logic. It also helps prevent context-related bugs by making the context requirements explicit.

## Implementation Benefits

### 1. Enhanced Variable Resolution for Commands

With these types, we can enhance the `getVariable` method to handle command references more robustly:

```typescript
private async getVariable(name: string, context: ResolutionContext): Promise<any> {
  // Existing variable resolution code...
  
  // Check if this is a command reference
  if (context.state.hasCommand && context.state.hasCommand(name)) {
    const command = context.state.getCommand(name);
    
    // Type narrowing based on discriminated union
    if (command.commandType === 'basic') {
      logger.debug(`Found basic command '${name}'`, {
        parameters: command.parameters,
        template: command.template
      });
      return command;
    } else if (command.commandType === 'language') {
      logger.debug(`Found language command '${name}'`, {
        parameters: command.parameters,
        language: command.language,
        codeBlockLength: command.codeBlock?.length || 0
      });
      return command;
    }
  }
  
  // Continue with existing fallback logic...
}
```

**Justification**: This implementation provides type-safe command resolution, with proper logging of the specific command type and its properties. The type narrowing ensures that only valid properties are accessed for each command type.

### 2. Safer Command Parameter Substitution

```typescript
/**
 * Substitute parameters in a command template
 */
private substituteCommandParameters(
  command: BasicCommandDefinition,
  args: any[]
): string {
  let result = command.template;
  
  // Substitute parameters in order
  command.parameters.forEach((param, index) => {
    const value = index < args.length ? args[index] : '';
    // Replace {{paramName}} with the actual value
    const pattern = new RegExp(`\\{\\{${param}\\}\\}`, 'g');
    result = result.replace(pattern, String(value));
  });
  
  return result;
}
```

**Justification**: With proper typing, we can ensure that parameter substitution only happens for basic commands, not language commands. This prevents misuse of the substitution logic and makes the code's intent clearer.

### 3. Improved Command Execution Type Safety

```typescript
/**
 * Execute a command with the given arguments
 */
async executeCommand(
  commandName: string,
  args: any[],
  context: CommandResolutionContext
): Promise<string> {
  const command = context.state.getCommand(commandName);
  
  if (!command) {
    throw VariableResolutionErrorFactory.commandNotFound(commandName);
  }
  
  // Validate parameter count
  if (args.length < command.parameters.length) {
    throw VariableResolutionErrorFactory.missingCommandParameters(
      commandName,
      command.parameters.slice(args.length)
    );
  }
  
  // Type-specific execution
  if (command.commandType === 'basic') {
    // Execute basic command with parameter substitution
    return this.executeBasicCommand(command, args, context);
  } else {
    // Execute language command with parameter passing
    return this.executeLanguageCommand(command, args, context);
  }
}
```

**Justification**: This approach ensures that commands are executed according to their type, with appropriate parameter handling for each type. The type system enforces that only valid operations are performed on each command type.

## Overall Benefits

1. **Error Reduction**: Strong typing for command definitions will catch many errors at compile time rather than runtime.

2. **Code Clarity**: The discriminated union pattern makes the code's intent clearer, improving maintainability.

3. **Better Documentation**: These types serve as self-documenting code, making it easier for developers to understand how commands work.

4. **Safer Refactoring**: When changes are needed, the type system will guide developers to update all necessary places.

5. **Improved Testing**: With clear interfaces, it's easier to create mock implementations for testing.

## Implementation Strategy

1. **Define the Types**: Add these types to a dedicated file like `command-types.ts`.

2. **Update State Interface**: Enhance the `IStateService` to include the command-related methods.

3. **Refactor Variable Resolution**: Update the resolver to use these types when handling commands.

4. **Add Validation**: Use the types to validate commands at creation and execution time.

5. **Update Documentation**: Document the new types and their usage.

This approach maintains backward compatibility while providing a path forward for more robust command handling.