# Proposed Improvements for ResolutionService @run Directive Handling

After reviewing the ResolutionService code and the @run directive documentation, I've identified several areas where stronger typing would significantly improve command resolution, parameter handling, and error management. Here are my proposed improvements with detailed justifications:

## 1. Discriminated Union Types for @run Directive Variants

### Current Issue
The `resolveCommand` method currently treats all command types generically:

```typescript
async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
  const node: DirectiveNode = {
    type: 'Directive',
    directive: {
      kind: 'run',
      name: cmd,
      identifier: cmd,
      args
    }
  };
  return this.commandResolver.resolve(node, context);
}
```

This approach doesn't distinguish between the three distinct @run types (BasicCommand, LanguageCommand, DefinedCommand), which have different parameter requirements and resolution behaviors.

### Proposed Solution
Create a discriminated union type for @run directives:

```typescript
type RunDirectiveType = 'basicCommand' | 'languageCommand' | 'definedCommand';

interface BaseRunDirective {
  type: RunDirectiveType;
  identifier: string;
}

interface BasicRunCommand extends BaseRunDirective {
  type: 'basicCommand';
  command: string;
  isMultiLine: boolean;
}

interface LanguageRunCommand extends BaseRunDirective {
  type: 'languageCommand';
  language: string;
  parameters: string[];
  code: string;
}

interface DefinedRunCommand extends BaseRunDirective {
  type: 'definedCommand';
  commandName: string;
  parameters: string[];
}

type RunDirective = BasicRunCommand | LanguageRunCommand | DefinedRunCommand;
```

### Justification
1. **Type Safety**: The service would catch type mismatches at compile time rather than runtime
2. **Self-Documentation**: Makes it explicit which parameters are required for each run type
3. **Simplifies Command Resolution**: Enables pattern matching via TypeScript's discriminated union handling
4. **Reduces Edge Cases**: Eliminates the need for manual type checking of command properties

## 2. Parameter Type Validation for Command Arguments

### Current Issue
Currently, when resolving command references, the arguments are loosely typed as string[]:

```typescript
async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
  // No validation of argument types or format
}
```

This approach makes it difficult to validate parameter types or enforce parameter constraints for different command types.

### Proposed Solution
Create a structured type for command parameters with validation metadata:

```typescript
interface CommandParameter {
  value: string;
  originalValue: string; // Before resolution
  isResolved: boolean;
  isVariableReference: boolean;
  variableName?: string;
  fieldPath?: string;
}

// Updated method signature
async resolveCommand(
  cmd: string, 
  args: CommandParameter[], 
  context: ResolutionContext
): Promise<string> {
  // Implementation with proper parameter handling
}
```

### Justification
1. **Parameter Tracking**: Preserves information about parameter sources (literal vs. variable)
2. **Improved Error Messages**: Can provide better diagnostics when parameters are invalid
3. **Resolution Optimization**: Can skip re-resolving already resolved parameters
4. **Command Validation**: Makes it easier to validate parameter counts and types

## 3. Command Definition Interface

### Current Issue
When working with defined commands, the service needs to retrieve command definitions from the state service, but there's no clear type for what a command definition should contain:

```typescript
// In detectCircularReferences method
case 'run':
  const cmdValue = this.stateService.getCommand(ref);
  if (cmdValue) {
    refValue = cmdValue.command;
  }
  break;
```

### Proposed Solution
Create a formal interface for command definitions:

```typescript
interface CommandDefinition {
  command: string;
  parameters: string[];
  description?: string;
  isMultiLine: boolean;
  language?: string;
}

// Then update StateService interface to use this type
interface IStateService {
  // ...existing methods
  getCommand(name: string): CommandDefinition | undefined;
  setCommand(name: string, definition: CommandDefinition): void;
}
```

### Justification
1. **Consistent Command Structure**: Ensures all command definitions have the same shape
2. **Parameter Validation**: Makes it clear how many parameters a command expects
3. **Documentation Support**: Allows storing command descriptions for better error messages
4. **Type Safety**: Prevents accessing undefined properties on command definitions
5. **IDE Support**: Enables autocompletion when working with command definitions

## 4. Enhanced Resolution Context for Commands

### Current Issue
The current `ResolutionContext` interface has a general `allowedVariableTypes.command` flag but lacks specific context for command execution:

```typescript
interface ResolutionContext {
  allowedVariableTypes: {
    // ...
    command: boolean; 
  };
  // ...
}
```

This makes it difficult to enforce command-specific security constraints or execution options.

### Proposed Solution
Extend the ResolutionContext interface with command-specific options:

```typescript
interface CommandResolutionOptions {
  allowedCommands?: string[]; // Whitelist of allowed commands
  allowShellExecution: boolean; // Whether shell commands can be executed
  environmentVariables?: Record<string, string>; // Environment variables for command execution
  workingDirectory?: string; // Working directory for command execution
  timeoutMs?: number; // Execution timeout
  maxOutputSize?: number; // Maximum output size in bytes
}

interface ResolutionContext {
  // Existing properties
  commandOptions?: CommandResolutionOptions;
}
```

### Justification
1. **Security Improvements**: Can restrict which commands are allowed to run
2. **Execution Control**: Provides fine-grained control over command execution environment
3. **Resource Management**: Allows setting timeouts and output limits to prevent abuse
4. **Contextual Execution**: Commands can run in the appropriate directory context
5. **Consistent Environment**: Ensures commands have access to necessary environment variables

## 5. Command Resolution Result Type

### Current Issue
The current `resolveCommand` method returns a simple string, which doesn't provide enough information about the command execution:

```typescript
async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
  // Returns only stdout as string
}
```

This makes it difficult to handle command errors, capture exit codes, or access both stdout and stderr.

### Proposed Solution
Create a structured result type for command execution:

```typescript
interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  commandString: string; // The resolved command that was executed
  durationMs: number; // Execution time
}

// Updated method signature
async resolveCommand(
  cmd: string, 
  args: CommandParameter[], 
  context: ResolutionContext
): Promise<CommandExecutionResult> {
  // Implementation with structured result
}
```

### Justification
1. **Error Handling**: Makes it easy to check if a command succeeded
2. **Diagnostic Information**: Provides access to stderr for error messages
3. **Performance Monitoring**: Tracks command execution time
4. **Debugging Support**: Includes the actual command string that was executed
5. **Conditional Logic**: Enables conditional processing based on exit code

## 6. Utility Types for Parameter Parsing and Substitution

### Current Issue
The command reference regex and parameter parsing is done manually with string manipulation:

```typescript
// Check for command references in the format $command(args)
const commandRegex = /^\$(\w+)\(([^)]*)\)$/;
const commandMatch = value.match(commandRegex);

if (commandMatch) {
  const [, cmdName, argsStr] = commandMatch;
  // Parse args, splitting by comma but respecting quoted strings
  const args = argsStr.split(',').map(arg => arg.trim());
  // ...
}
```

This approach is error-prone and doesn't handle complex cases like nested parentheses or quoted strings with commas.

### Proposed Solution
Create utility types and functions for parameter parsing and substitution:

```typescript
interface ParsedCommandReference {
  commandName: string;
  parameters: CommandParameter[];
  raw: string;
}

// Utility function with proper typing
function parseCommandReference(value: string): ParsedCommandReference | null {
  // Implementation with proper parsing logic
}

// Usage
const parsedCommand = parseCommandReference(value);
if (parsedCommand) {
  return this.resolveCommand(
    parsedCommand.commandName, 
    parsedCommand.parameters, 
    resolveContext
  );
}
```

### Justification
1. **Robust Parsing**: Handles complex parameter formats correctly
2. **Reusable Logic**: Can be used across multiple services
3. **Type Safety**: Ensures consistent parameter structure
4. **Maintainability**: Centralizes parsing logic for easier updates
5. **Testing**: Makes it easier to unit test parameter parsing separately

## Implementation Plan

To implement these improvements, I recommend the following approach:

1. Define the new type definitions in a shared location (e.g., `@core/syntax/types/run-directive.ts`)
2. Update the `CommandResolver` to use these new types
3. Enhance the `resolveCommand` method to support the new parameter and result types
4. Update the command reference parsing logic to use the new utility functions
5. Add validation for command parameters based on command definition
6. Update tests to verify the enhanced type safety

These changes will make the ResolutionService more robust when handling @run directives, reduce runtime errors, and provide better diagnostics when issues occur. The discriminated union approach in particular will make it much easier to handle the three distinct @run directive types correctly.