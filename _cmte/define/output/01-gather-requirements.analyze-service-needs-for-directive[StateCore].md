# Improving `@define` Directive Type Safety in StateCore Service

After analyzing the StateCore service code, I've identified several areas where enhanced TypeScript types for the `@define` directive would significantly improve code safety, maintainability, and developer experience. The current implementation uses a generic `CommandDefinition` type that doesn't fully capture the structure and constraints of command definitions.

## Current Issues with Command Definition Types

### 1. Inadequate Type Differentiation for Command Types

Currently, the `CommandDefinition` appears to be a simple object with a string `command` property and optional `options`:

```typescript
// Current implicit type
type CommandDefinition = {
  command: string;
  options?: Record<string, unknown>;
};
```

**Problem:** This doesn't distinguish between basic shell commands and language-specific commands (JS, Python, Bash), which have different structures and validation requirements.

### 2. Lack of Parameter Type Safety

Parameters for commands are not strongly typed, making it difficult to validate parameter counts and names when executing commands.

**Problem:** This can lead to runtime errors when parameter counts mismatch or when required parameters are missing.

### 3. No Distinction Between Command Template and Raw Code Block

The current type doesn't differentiate between command templates (for shell commands) and raw code blocks (for language commands).

**Problem:** This makes validation complex and error-prone, especially when processing different command types.

## Proposed Type Improvements

### 1. Discriminated Union for Command Types

```typescript
// Base interface for all command definitions
interface BaseCommandDefinition {
  type: 'basic' | 'language';
  name: string;
  parameters: string[];
}

// For shell commands (@run)
interface BasicCommandDefinition extends BaseCommandDefinition {
  type: 'basic';
  commandTemplate: string;
  isMultiline: boolean;
}

// For language commands (@run js/python/bash)
interface LanguageCommandDefinition extends BaseCommandDefinition {
  type: 'language';
  language: 'js' | 'python' | 'bash' | string;
  codeBlock: string;
  languageParameters?: string[];
}

// Combined type using discriminated union
type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;
```

**Benefits:**
1. **Type Safety:** The discriminated union pattern allows TypeScript to narrow types based on the `type` property.
2. **Validation:** Makes validation simpler with clear expectations for each command type.
3. **IDE Support:** Provides better autocomplete and documentation in IDEs.

### 2. Parameter Handling Improvements

```typescript
// Type for parameter validation
interface ParameterValidation {
  required: boolean;
  defaultValue?: string;
}

// Enhanced command definition with parameter validation
interface EnhancedBaseCommandDefinition extends BaseCommandDefinition {
  parameterValidation?: Record<string, ParameterValidation>;
}
```

**Benefits:**
1. **Parameter Validation:** Enables validation of required parameters and default values.
2. **Error Prevention:** Catches parameter mismatches at compile time rather than runtime.
3. **Documentation:** Self-documents the expected parameters for commands.

### 3. Command Storage Type Enhancements

```typescript
// Enhanced state command storage
interface CommandStore {
  getCommand(name: string): CommandDefinition | undefined;
  setCommand(name: string, definition: CommandDefinition): void;
  hasCommand(name: string): boolean;
  validateParameters(name: string, providedParams: string[]): boolean;
  getAllCommands(): Map<string, CommandDefinition>;
}
```

**Benefits:**
1. **API Clarity:** Makes the command API more explicit and self-documenting.
2. **Validation:** Adds parameter validation as a first-class concern.
3. **Type Safety:** Ensures consistency in command storage and retrieval.

## Implementation Examples

### Command Definition Storage

```typescript
// In StateService.ts
setCommand(name: string, command: string | CommandDefinition): void {
  this.checkMutable();
  const commands = new Map(this.currentState.commands);
  
  // If string is provided, convert to BasicCommandDefinition
  let commandDef: CommandDefinition;
  if (typeof command === 'string') {
    commandDef = {
      type: 'basic',
      name,
      parameters: [],
      commandTemplate: command,
      isMultiline: false
    };
  } else if ('command' in command) {
    // Legacy format conversion
    const isLanguageCommand = command.command.startsWith('@run js') || 
                             command.command.startsWith('@run python') ||
                             command.command.startsWith('@run bash');
    
    if (isLanguageCommand) {
      // Extract language and code block
      const match = /^@run\s+(\w+)(?:\(([^)]*)\))?\s+\[\[([\s\S]*)\]\]$/m.exec(command.command);
      if (match) {
        const [_, language, params, codeBlock] = match;
        commandDef = {
          type: 'language',
          name,
          parameters: [], // Would be filled from define directive params
          language,
          codeBlock: codeBlock.trim(),
          languageParameters: params ? params.split(',').map(p => p.trim()) : []
        };
      } else {
        // Fallback for malformed language command
        commandDef = {
          type: 'basic',
          name,
          parameters: [],
          commandTemplate: command.command,
          isMultiline: command.command.includes('[[')
        };
      }
    } else {
      // Basic command
      commandDef = {
        type: 'basic',
        name,
        parameters: [], // Would be filled from define directive params
        commandTemplate: command.command,
        isMultiline: command.command.includes('[[')
      };
    }
  } else {
    // Already in new format
    commandDef = command as CommandDefinition;
  }
  
  commands.set(name, commandDef);
  this.updateState({ commands }, `setCommand:${name}`);
}
```

### Parameter Validation

```typescript
// New method in StateService
validateCommandParameters(commandName: string, providedParams: string[]): boolean {
  const command = this.getCommand(commandName);
  if (!command) return false;
  
  // For basic validation, just check parameter count
  if (command.parameters.length !== providedParams.length) {
    logger.warn(`Parameter count mismatch for command ${commandName}: expected ${command.parameters.length}, got ${providedParams.length}`);
    return false;
  }
  
  return true;
}
```

### Type Guards for Command Types

```typescript
// Type guards for working with command definitions
function isBasicCommand(command: CommandDefinition): command is BasicCommandDefinition {
  return command.type === 'basic';
}

function isLanguageCommand(command: CommandDefinition): command is LanguageCommandDefinition {
  return command.type === 'language';
}

// Example usage in command execution
getCommandForExecution(name: string, args: string[]): string | undefined {
  const command = this.getCommand(name);
  if (!command) return undefined;
  
  if (isBasicCommand(command)) {
    // Process basic command
    let result = command.commandTemplate;
    command.parameters.forEach((param, index) => {
      result = result.replace(new RegExp(`{{${param}}}`, 'g'), args[index] || '');
    });
    return result;
  } else if (isLanguageCommand(command)) {
    // Process language command differently
    // ...
  }
  
  return undefined;
}
```

## Benefits to the StateCore Service

### 1. Improved Error Detection

The enhanced types would catch many common errors at compile time:

- Mismatched parameter counts between definition and usage
- Incorrect command structure for different command types
- Missing required fields for specific command types

### 2. Self-Documenting Code

The discriminated union pattern makes the code self-documenting:

- Clear separation between basic and language commands
- Explicit parameter lists and validation
- Type-driven development for command handling

### 3. Simplified Command Processing

Command processing becomes more straightforward with type narrowing:

```typescript
// Before
if (typeof command === 'string' || !command.options) {
  // Handle basic command
} else if (command.options.language) {
  // Handle language command
}

// After
if (isBasicCommand(command)) {
  // TypeScript knows this is a BasicCommandDefinition
  processBasicCommand(command.commandTemplate, command.parameters);
} else {
  // TypeScript knows this is a LanguageCommandDefinition
  processLanguageCommand(command.language, command.codeBlock, command.languageParameters);
}
```

### 4. Enhanced Debugging and Testing

With more specific types:

- Error messages become more precise
- Test cases can target specific command types
- Edge cases are more clearly defined and testable

### 5. Future Extensibility

The proposed type system allows for future enhancements:

- Adding new command types with their own specific properties
- Extending parameter validation with more sophisticated rules
- Supporting additional metadata for commands without breaking changes

## Conclusion

Implementing these type improvements for the `@define` directive would significantly enhance the StateCore service by:

1. Making command definitions more explicit and type-safe
2. Reducing runtime errors through compile-time validation
3. Simplifying command processing with type narrowing
4. Improving code readability and maintainability
5. Providing better developer experience through IDE support

These changes align with TypeScript best practices and would make the `@define` directive implementation more robust while reducing the cognitive load on developers working with the codebase.