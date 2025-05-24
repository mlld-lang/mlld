# Proposed TypeScript Type Improvements for StateCore and @run Directive Handling

After reviewing the StateService implementation and the @run directive documentation, I've identified several opportunities to improve type safety and clarity when handling command execution, storage, and transformation. These improvements would make the code more maintainable and reduce potential runtime errors.

## 1. Discriminated Union Types for Command Definitions

### Current Implementation
```typescript
// Current type in StateService
type CommandDefinition = { 
  command: string;
  options?: Record<string, unknown>;
};

// Used in methods like:
getCommand(name: string): CommandDefinition | undefined {
  return this.currentState.commands.get(name);
}

setCommand(name: string, command: string | CommandDefinition): void {
  // ...conversion from string to CommandDefinition happens here...
}
```

### Proposed Improvement
```typescript
// New discriminated union type
type RunCommandDefinition = 
  | { type: 'basic'; command: string; options?: Record<string, unknown> }
  | { type: 'language'; language: string; code: string; parameters?: string[] }
  | { type: 'defined'; commandName: string; parameters?: Array<string | { type: 'variable', name: string }> };

// Updated method signatures
getCommand(name: string): RunCommandDefinition | undefined;
setCommand(name: string, command: string | RunCommandDefinition): void;
```

### Justification
1. **Type Safety**: The current implementation stores all commands as strings or simple objects, requiring runtime type checking and manual parsing when executing them. A discriminated union would allow the compiler to enforce proper handling for each command type.

2. **Clarity in Command Storage**: When storing defined commands, the system currently doesn't distinguish between command types, making it difficult to validate parameters or understand command intent without runtime inspection.

3. **Reduced Runtime Errors**: With the current approach, errors in command format are only discovered during execution. With stronger types, many errors would be caught at compile time.

4. **Better IDE Support**: With discriminated unions, code editors would provide proper autocompletion and type checking when working with different command types.

## 2. Specialized Parameter Types for Command Execution

### Current Implementation
```typescript
// Current approach handles parameters generically
getCommandOutput(command: string): string | undefined {
  // Simple string lookup without type awareness
}

// No specific parameter validation in the StateService
```

### Proposed Improvement
```typescript
// Parameter type definitions
type RunParameter = 
  | { type: 'literal'; value: string }
  | { type: 'variable'; name: string; varType: 'text' | 'data' | 'path' };

// Enhanced method for command execution with type awareness
executeCommand(
  commandName: string, 
  parameters: RunParameter[] = []
): { success: boolean; output: string; error?: string } {
  const command = this.getCommand(commandName);
  if (!command) return { success: false, output: '', error: `Command '${commandName}' not found` };
  
  // Type-safe handling based on command.type
  switch (command.type) {
    case 'basic':
      // Handle basic command
      break;
    case 'language':
      // Handle language command with parameters
      break;
    case 'defined':
      // Handle defined command with proper parameter substitution
      break;
  }
}
```

### Justification
1. **Parameter Validation**: The current implementation lacks strong typing for command parameters, making it difficult to validate them before execution. This can lead to runtime errors when parameters are of the wrong type or missing.

2. **Improved Variable Resolution**: With typed parameters, the service could intelligently resolve variables based on their type (text, data, path) without relying on string parsing or manual type checking.

3. **Consistent Error Handling**: Type-safe parameter handling would enable consistent error messages when parameters are invalid, improving debugging and user experience.

4. **Streamlined Transformation**: When transforming @run directives, having properly typed parameters would make it easier to generate replacement nodes with the correct content.

## 3. Command Execution Result Interface

### Current Implementation
```typescript
// Current approach has no structured output format
getCommandOutput(command: string): string | undefined {
  // Simple string lookup in transformed nodes
}
```

### Proposed Improvement
```typescript
// Structured result interface
interface RunCommandResult {
  success: boolean;
  output: string;
  exitCode?: number;
  error?: string;
  metadata?: {
    executionTime: number;
    commandType: 'basic' | 'language' | 'defined';
    sourceCommand: string;
  };
}

// Updated method signature
getCommandResult(commandName: string): RunCommandResult | undefined;

// Store results in a dedicated map for better tracking
private commandResults: Map<string, RunCommandResult> = new Map();
```

### Justification
1. **Structured Error Handling**: The current implementation only returns the command output as a string, with no way to determine if the command succeeded or failed. A structured result would provide better error handling.

2. **Improved Debugging**: Including metadata about execution time and exit codes would make it easier to debug command failures.

3. **Transformation Support**: When transforming @run directives, having structured results would make it easier to generate appropriate replacement nodes based on success/failure.

4. **State Persistence**: A dedicated map for command results would make it easier to track and retrieve command outputs without scanning through transformed nodes.

## 4. Generic Type for Variable Access

### Current Implementation
```typescript
// Current approach has separate methods for each variable type
getTextVar(name: string): string | undefined;
getDataVar(name: string): unknown;
getPathVar(name: string): string | undefined;

// Type checking happens at runtime
hasVariable(type: string, name: string): boolean {
  switch (type.toLowerCase()) {
    case 'text':
      return this.getTextVar(name) !== undefined;
    case 'data':
      return this.getDataVar(name) !== undefined;
    case 'path':
      return this.getPathVar(name) !== undefined;
    default:
      return false;
  }
}
```

### Proposed Improvement
```typescript
// Variable type enum for compile-time checking
enum VariableType {
  Text = 'text',
  Data = 'data',
  Path = 'path'
}

// Generic method with strong typing
getVariable<T>(type: VariableType, name: string): T | undefined {
  switch (type) {
    case VariableType.Text:
      return this.getTextVar(name) as T;
    case VariableType.Data:
      return this.getDataVar(name) as T;
    case VariableType.Path:
      return this.getPathVar(name) as T;
  }
}

// Type-safe variable existence check
hasVariable(type: VariableType, name: string): boolean {
  return this.getVariable(type, name) !== undefined;
}
```

### Justification
1. **Compile-Time Type Checking**: Using an enum for variable types would catch typos and invalid types at compile time rather than runtime.

2. **Simplified Variable Resolution**: When resolving variables in @run commands, having a generic method would reduce code duplication and make the resolution process more consistent.

3. **Type Safety for Consumers**: Service consumers would get proper type inference when using the generic method, reducing type casting in their code.

4. **Consistent API**: A unified approach to variable access would make the API more consistent and easier to use.

## 5. Command Transformation Context

### Current Implementation
```typescript
// Current approach uses generic transformation
transformNode(original: MeldNode, transformed: MeldNode): void {
  // Generic node transformation without command-specific context
}

// No specific tracking of command transformations
```

### Proposed Improvement
```typescript
// Command transformation context
interface RunTransformationContext {
  originalNode: MeldNode;
  commandType: 'basic' | 'language' | 'defined';
  commandName?: string;
  parameters?: RunParameter[];
  result?: RunCommandResult;
}

// Enhanced transformation method
transformRunDirective(context: RunTransformationContext): MeldNode {
  // Create appropriate replacement node based on command type and result
  const { originalNode, commandType, result } = context;
  
  // Generate appropriate transformed node with proper formatting
  const transformedNode: TextNode = {
    type: 'Text',
    content: result?.output || '',
    location: originalNode.location,
    formattingMetadata: {
      isFromDirective: true,
      originalNodeType: originalNode.type,
      commandType,
      success: result?.success ?? false
    }
  };
  
  // Register the transformation
  this.transformNode(originalNode, transformedNode);
  
  return transformedNode;
}
```

### Justification
1. **Context-Aware Transformations**: The current transformation system treats all nodes generically. A specialized method for @run directives would provide context-specific transformation logic.

2. **Improved Output Formatting**: With command-specific context, the system could generate better-formatted output based on the command type and execution result.

3. **Enhanced Debugging**: Including command metadata in the transformed node would make it easier to trace issues back to the original command.

4. **Consistent Transformation**: A dedicated method would ensure consistent handling of all @run directive transformations, reducing the risk of inconsistent output.

## Conclusion

These proposed type improvements would significantly enhance the StateService's ability to handle @run directives by:

1. **Providing stronger type safety** for command definitions, parameters, and results
2. **Reducing runtime errors** through compile-time validation
3. **Improving developer experience** with better IDE support and clearer interfaces
4. **Enabling more consistent transformation** of @run directives to output content

The changes would make the code more maintainable and robust when dealing with the various subtypes of @run directives (BasicCommand, LanguageCommand, DefinedCommand) while preserving backward compatibility with existing code.