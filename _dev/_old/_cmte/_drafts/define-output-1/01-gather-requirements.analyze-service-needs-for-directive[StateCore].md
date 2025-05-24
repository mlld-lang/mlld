# Improving TypeScript Types for `@define` Directive in StateCore Service

After analyzing the StateCore service implementation, I've identified several areas where we can strengthen the type system specifically for the `@define` directive. This will make the code more robust, improve error handling, and simplify maintenance.

## Current Implementation Analysis

The current StateCore service handles command definitions with minimal type safety:

```typescript
// Current implementation in StateService
getCommand(name: string): CommandDefinition | undefined {
  return this.currentState.commands.get(name);
}

setCommand(name: string, command: string | CommandDefinition): void {
  this.checkMutable();
  const commands = new Map(this.currentState.commands);
  const commandDef = typeof command === 'string' ? { command } : command;
  commands.set(name, commandDef);
  this.updateState({ commands }, `setCommand:${name}`);
}

getAllCommands(): Map<string, CommandDefinition> {
  return new Map(this.currentState.commands);
}
```

The interface definition shows:

```typescript
// Current interface in IStateService
getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined;
setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void;
getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;
```

This implementation has several weaknesses:
1. It doesn't differentiate between basic and language commands
2. Parameter information is not strongly typed
3. There's no validation of command structure at compile time
4. The relationship between command parameters and their usage is not enforced

## Proposed Type Improvements

### 1. Discriminated Union for Command Types

**Proposal:**
```typescript
// Define a discriminated union for different command types
type CommandParameter = {
  name: string;
  defaultValue?: string;
};

// Basic command (shell command)
type BasicCommandDefinition = {
  type: 'basic';
  command: string;  // The shell command template
  parameters: CommandParameter[];
  options?: Record<string, unknown>;
};

// Language command (js, python, etc.)
type LanguageCommandDefinition = {
  type: 'language';
  language: 'js' | 'python' | 'bash' | string;
  code: string;  // The raw code block
  parameters: CommandParameter[];
  options?: Record<string, unknown>;
};

// Combined command definition type
type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;
```

**Justification:**
1. **Type safety**: Eliminates runtime errors by ensuring the correct properties exist for each command type
2. **Self-documenting code**: Makes it clear what properties are expected for each command type
3. **Compile-time validation**: The TypeScript compiler will flag missing or incorrect properties
4. **Simplified handler logic**: Allows for type narrowing with discriminated unions
5. **Improved maintainability**: Makes future changes to command structure safer

### 2. Parameter Tracking and Validation

**Proposal:**
```typescript
// Enhanced parameter type with validation info
type CommandParameter = {
  name: string;
  required: boolean;
  defaultValue?: string;
  position: number;  // Explicit position tracking
};

// Update command execution helper
function resolveCommandParameters(
  command: CommandDefinition, 
  args: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  
  command.parameters.forEach((param, index) => {
    // Assign based on position or use default
    result[param.name] = index < args.length ? args[index] : param.defaultValue ?? '';
    
    // Runtime validation can be added here
    if (param.required && !result[param.name]) {
      throw new Error(`Required parameter '${param.name}' missing for command`);
    }
  });
  
  return result;
}
```

**Justification:**
1. **Improved parameter handling**: Explicit tracking of parameter position and requirements
2. **Better error messages**: Clear indication of which parameter is missing or invalid
3. **Default value support**: Structured way to provide fallback values
4. **Simplified run directive**: The `@run` directive handler can use this helper to resolve parameters
5. **Consistent behavior**: Ensures parameters are always handled the same way

### 3. Command Registration Type Safety

**Proposal:**
```typescript
// Update the StateService methods for command handling
interface IStateService {
  // ...existing methods...
  
  /**
   * Gets a command by name with type safety
   */
  getCommand<T extends 'basic' | 'language' = 'basic'>(
    name: string, 
    type?: T
  ): T extends 'basic' 
    ? BasicCommandDefinition | undefined 
    : LanguageCommandDefinition | undefined;
  
  /**
   * Sets a basic (shell) command
   */
  setBasicCommand(
    name: string, 
    command: string,
    parameters?: CommandParameter[],
    options?: Record<string, unknown>
  ): void;
  
  /**
   * Sets a language command
   */
  setLanguageCommand(
    name: string,
    language: string,
    code: string,
    parameters?: CommandParameter[],
    options?: Record<string, unknown>
  ): void;
  
  /**
   * Gets all commands (can be filtered by type)
   */
  getAllCommands<T extends 'basic' | 'language' = 'basic' | 'language'>(
    type?: T
  ): Map<string, T extends 'basic' 
    ? BasicCommandDefinition 
    : T extends 'language' 
      ? LanguageCommandDefinition 
      : CommandDefinition>;
}
```

**Justification:**
1. **Type-specific methods**: Separate methods for different command types prevent mixing properties
2. **Generic type parameters**: Allow consumers to get correctly typed results
3. **Simplified API**: Makes it clear what information is needed for each command type
4. **Improved autocomplete**: IDE suggestions will show the correct properties for each command type
5. **Reduced runtime checking**: Fewer type checks needed in implementation code

### 4. Command Validation at Registration Time

**Proposal:**
```typescript
// Add validation function
function validateCommandDefinition(def: CommandDefinition): void {
  // Common validation
  if (!def.parameters) {
    throw new Error('Command definition must include parameters array');
  }
  
  // Type-specific validation
  if (def.type === 'basic') {
    if (!def.command || typeof def.command !== 'string') {
      throw new Error('Basic command definition must include command string');
    }
  } else if (def.type === 'language') {
    if (!def.language || typeof def.language !== 'string') {
      throw new Error('Language command definition must include language');
    }
    if (!def.code || typeof def.code !== 'string') {
      throw new Error('Language command definition must include code');
    }
  }
  
  // Parameter validation
  const paramNames = new Set<string>();
  def.parameters.forEach(param => {
    if (paramNames.has(param.name)) {
      throw new Error(`Duplicate parameter name: ${param.name}`);
    }
    paramNames.add(param.name);
  });
}
```

**Justification:**
1. **Early error detection**: Problems are caught when commands are defined, not when they're used
2. **Clear error messages**: Specific validation for each command type provides helpful messages
3. **Parameter uniqueness**: Ensures parameter names don't conflict
4. **Consistent state**: Prevents invalid commands from being stored in state
5. **Simplified handler code**: The run directive handler doesn't need to check command validity

## Implementation Example

Here's how these improvements would be implemented in the StateService:

```typescript
// In StateService.ts implementation
setBasicCommand(
  name: string,
  command: string,
  parameters: CommandParameter[] = [],
  options?: Record<string, unknown>
): void {
  this.checkMutable();
  
  const commandDef: BasicCommandDefinition = {
    type: