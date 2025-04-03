# Enhanced TypeScript Types for the DefineDirectiveHandler

After analyzing the DefineDirectiveHandler code and the broader Meld architecture, I've identified several areas where stronger TypeScript types would significantly improve code clarity, safety, and maintainability.

## Current Challenges in the Code

1. **Loose Typing of Command Definitions**: The current `CommandDefinition` interface is too general and doesn't distinguish between basic shell commands and language-specific commands.

2. **Manual Validation Logic**: The handler and validator contain extensive manual checks that could be enforced at the type level.

3. **Metadata Handling Complexity**: The metadata parsing in `parseIdentifier()` has complex conditional logic that could be simplified with stronger types.

4. **Risk Level Validation**: Risk levels are validated manually in multiple places with string literals.

5. **Command Structure Validation**: The validator has to check that `directive.command.kind === 'run'` and that `command.command` is a string.

## Proposed Type Improvements

### 1. Discriminated Union for Command Types

```typescript
// Basic command (shell commands)
interface BasicCommandDefinition {
  type: 'basic';
  parameters: string[];
  command: string;
  metadata?: CommandMetadata;
}

// Language command (JS, Python, etc.)
interface LanguageCommandDefinition {
  type: 'language';
  parameters: string[];
  language: 'js' | 'python' | 'bash';
  code: string;
  metadata?: CommandMetadata;
}

// Union type
type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;
```

**Benefits:**
- Eliminates runtime checks for command type
- Ensures proper handling of each command type
- Makes it impossible to mix properties from different command types
- Self-documents the available command types

### 2. Strongly Typed Metadata

```typescript
interface CommandMetadata {
  risk?: RiskLevel;
  about?: string;
  meta?: Record<string, unknown>;
}

// Use literal types for allowed values
type RiskLevel = 'high' | 'med' | 'low';
```

**Benefits:**
- Eliminates string comparison checks for risk levels
- Provides autocomplete for valid risk levels
- Makes it impossible to assign invalid risk levels
- Centralizes metadata structure definition

### 3. Enhanced DefineDirectiveData Type

```typescript
// Improve the AST type for @define directives
interface DefineDirectiveData {
  name: string;
  parameters: string[];
  command: RunCommandData;
}

interface RunCommandData {
  kind: 'run';
  command: string;
  language?: 'js' | 'python' | 'bash';
}
```

**Benefits:**
- Makes parameters required (currently optional with `parameters?`)
- Ensures command is always a RunCommandData object
- Makes language an explicit optional property
- Prevents invalid command structures at compile time

### 4. Type Guards for Command Validation

```typescript
function isBasicCommand(command: CommandDefinition): command is BasicCommandDefinition {
  return command.type === 'basic';
}

function isLanguageCommand(command: CommandDefinition): command is LanguageCommandDefinition {
  return command.type === 'language';
}
```

**Benefits:**
- Enables TypeScript to narrow types in conditional blocks
- Eliminates need for explicit type casting
- Provides compile-time safety for command-specific operations
- Makes code more readable with explicit type checks

### 5. Factory Functions for Command Creation

```typescript
function createBasicCommand(
  parameters: string[], 
  command: string, 
  metadata?: CommandMetadata
): BasicCommandDefinition {
  return {
    type: 'basic',
    parameters,
    command,
    metadata
  };
}

function createLanguageCommand(
  parameters: string[],
  language: 'js' | 'python' | 'bash',
  code: string,
  metadata?: CommandMetadata
): LanguageCommandDefinition {
  return {
    type: 'language',
    parameters,
    language,
    code,
    metadata
  };
}
```

**Benefits:**
- Ensures all required properties are provided
- Prevents mixing properties from different command types
- Provides a clear API for creating command definitions
- Reduces the chance of runtime errors

## Implementation Example

Here's how the improved `DefineDirectiveHandler.execute()` method would look:

```typescript
async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
  try {
    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Extract name, parameters, and command from directive
    const directive = node.directive as DefineDirectiveData;
    const { name, parameters, command } = directive;
    
    // Parse any metadata from the name
    const { commandName, metadata } = this.parseIdentifier(name);

    // 3. Determine command type and create appropriate definition
    let commandDef: CommandDefinition;
    
    if (command.language) {
      // Language command
      commandDef = createLanguageCommand(
        parameters,
        command.language,
        command.command,
        metadata
      );
    } else {
      // Basic shell command
      commandDef = createBasicCommand(
        parameters,
        command.command,
        metadata
      );
    }

    // 4. Create new state for modifications
    const newState = context.state.clone();

    // 5. Store command
    newState.setCommand(commandName, commandDef);

    return newState;
  } catch (error) {
    // Error handling remains the same
  }
}
```

## Benefits of This Approach

1. **Type Safety**: Catches many errors at compile time rather than runtime
2. **Self-Documenting Code**: Types clearly express the structure of commands
3. **Simplified Validation**: Reduces manual validation code by leveraging TypeScript
4. **Better IDE Support**: Provides better autocomplete and documentation in editors
5. **Refactoring Safety**: Makes future changes safer by catching incompatible changes
6. **Clearer Intent**: Makes the purpose of each property explicit through types
7. **Reduced Duplication**: Centralizes validation logic in types instead of spreading across code

## Conclusion

Implementing these stronger type definitions would significantly improve the DefineDirectiveHandler by:

1. Eliminating many manual validation checks
2. Making the code more self-documenting
3. Providing better compile-time safety
4. Simplifying the implementation logic
5. Making future extensions more straightforward

The benefits extend beyond just this handler - they would improve the entire pipeline by establishing clear contracts for command definitions that other services can rely on.