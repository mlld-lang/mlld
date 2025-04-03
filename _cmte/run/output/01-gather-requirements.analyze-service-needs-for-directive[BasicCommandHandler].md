# BasicCommandHandler Improvements with Stronger Run Types

After reviewing the code for the `BasicCommandHandler` service and the broader Meld architecture, I've identified several opportunities to simplify and strengthen the type system for handling `@run` directives. These improvements focus on making the code more maintainable, type-safe, and easier to reason about.

## 1. Implement Discriminated Union Types for Run Directive Subtypes

### Current Issue:
The code currently relies on runtime checks to determine the command structure and doesn't have clear type boundaries between different run directive subtypes (BasicCommand, LanguageCommand, DefinedCommand).

```typescript
// Extract the command string
if (typeof directive.command === 'string') {
  rawCommand = directive.command;
} else if (directive.command && directive.command.raw) {
  rawCommand = directive.command.raw;
} else if (directive.command) {
  rawCommand = JSON.stringify(directive.command);
}
```

This approach:
- Requires manual type checking
- Is prone to runtime errors
- Makes code harder to maintain
- Lacks clear documentation of expected structure

### Proposed Solution:
Create a discriminated union type for run directives:

```typescript
// Define specific types for each run directive subtype
export type BasicCommandDirective = {
  kind: 'run';
  subtype: 'basicCommand';
  command: string;
  isMultiLine?: boolean;
  output?: string;
};

export type LanguageCommandDirective = {
  kind: 'run';
  subtype: 'languageCommand';
  language: string;
  command: string;
  parameters: Array<string | VariableReference>;
  output?: string;
};

export type DefinedCommandDirective = {
  kind: 'run';
  subtype: 'definedCommand';
  commandName: string;
  arguments: Array<string | VariableReference>;
  output?: string;
};

// Create a union type
export type RunDirective = 
  | BasicCommandDirective 
  | LanguageCommandDirective 
  | DefinedCommandDirective;
```

### Benefits:
1. **Type Safety**: The compiler will ensure all required fields are present
2. **Exhaustive Checking**: TypeScript will enforce handling of all subtypes
3. **Self-Documentation**: Code clearly shows the structure expected for each subtype
4. **Simplified Logic**: No need for complex type checking and fallbacks

## 2. Create a Strongly-Typed Command Execution Interface

### Current Issue:
The command execution process mixes concerns of command extraction, variable resolution, and execution:

```typescript
// Get the command from the directive
let rawCommand = '';

// Extract the command string
if (typeof directive.command === 'string') {
  rawCommand = directive.command;
} else if (directive.command && directive.command.raw) {
  rawCommand = directive.command.raw;
} else if (directive.command) {
  rawCommand = JSON.stringify(directive.command);
}

// Resolve any variables in the command string
const resolvedCommand = await this.resolutionService.resolveInContext(
  rawCommand,
  context
);

// Execute the command
const { stdout, stderr } = await this.commandExecutionService.executeShellCommand(
  resolvedCommand,
  {
    cwd: context.workingDirectory,
    animationMessage: 'Running shell command...'
  }
);
```

### Proposed Solution:
Create a strongly-typed execution context interface:

```typescript
export interface CommandExecutionContext {
  // Common properties for all command types
  workingDirectory: string;
  outputVariableName?: string;
  
  // Execution options
  options: {
    animationMessage?: string;
    timeout?: number;
    env?: Record<string, string>;
  };
}

export interface BasicCommandExecutionContext extends CommandExecutionContext {
  commandType: 'basic';
  isMultiLine: boolean;
  command: string; // Already resolved
}

export interface LanguageCommandExecutionContext extends CommandExecutionContext {
  commandType: 'language';
  language: string;
  script: string; // Raw script content
  parameters: string[]; // Already resolved
}

export interface DefinedCommandExecutionContext extends CommandExecutionContext {
  commandType: 'defined';
  commandName: string;
  commandTemplate: string;
  arguments: string[]; // Already resolved
}

export type RunExecutionContext = 
  | BasicCommandExecutionContext 
  | LanguageCommandExecutionContext 
  | DefinedCommandExecutionContext;
```

Then update the command execution service:

```typescript
interface ICommandExecutionService {
  execute(context: RunExecutionContext): Promise<{stdout: string, stderr: string}>;
}
```

### Benefits:
1. **Clear Separation of Concerns**: Each step in the process has a well-defined responsibility
2. **Type Safety**: The compiler ensures all required fields are provided
3. **Simplified Implementation**: Handler code becomes cleaner and more focused
4. **Better Error Messages**: TypeScript will provide clear error messages when fields are missing

## 3. Add Stronger Types for Command Resolution Results

### Current Issue:
The `resolutionService.resolveInContext` method returns a generic string without capturing the structure of resolved content:

```typescript
const resolvedCommand = await this.resolutionService.resolveInContext(
  rawCommand,
  context
);
```

This approach:
- Loses type information about what was resolved
- Doesn't distinguish between different types of resolution
- Makes error handling less specific

### Proposed Solution:
Create a structured type for resolution results:

```typescript
export interface ResolutionResult<T = string> {
  // The resolved value
  value: T;
  
  // Information about what was resolved
  resolutionInfo: {
    // Variables that were resolved during processing
    resolvedVariables: string[];
    
    // Whether any path variables were resolved
    containsPathVars: boolean;
    
    // Whether any errors occurred during resolution (partial success)
    hasResolutionWarnings: boolean;
    
    // Any warnings that occurred during resolution
    warnings?: string[];
  };
}
```

Update the resolution service interface:

```typescript
interface IResolutionService {
  resolveInContext<T = string>(
    content: string, 
    context: DirectiveContext
  ): Promise<ResolutionResult<T>>;
}
```

### Benefits:
1. **Richer Information**: Provides details about what was resolved
2. **Better Error Handling**: Can check for warnings and handle partial success
3. **Traceability**: Can track which variables were resolved
4. **Type Safety**: Can specify expected return types

## 4. Create a Specialized Type for Command Output Handling

### Current Issue:
The `handleOutput` method in `BaseRunHandler` handles both state updates and node transformation:

```typescript
protected handleOutput(
  node: DirectiveNode,
  context: DirectiveContext,
  clonedState: IStateService,
  stdout: string,
  stderr: string
): DirectiveResult {
  // Store the output in state variables
  if (node.directive.output) {
    clonedState.setTextVar(node.directive.output, stdout);
  } else {
    clonedState.setTextVar('stdout', stdout);
  }
  // ...more code...
}
```

This approach:
- Mixes concerns of state management and node transformation
- Makes testing harder
- Doesn't clearly communicate the structure of output handling

### Proposed Solution:
Create a dedicated type for command output:

```typescript
export interface CommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  
  // Metadata about the execution
  executionMetadata: {
    startTime: Date;
    endTime: Date;
    duration: number;
    command: string;
    workingDirectory: string;
  };
}

export interface CommandOutputHandlingOptions {
  outputVariableName?: string;
  transformationEnabled: boolean;
  formattingContext?: FormattingContext;
}
```

Update the `BaseRunHandler`:

```typescript
protected handleOutput(
  node: DirectiveNode,
  output: CommandOutput,
  options: CommandOutputHandlingOptions
): DirectiveResult {
  const { stdout, stderr } = output;
  const { outputVariableName, transformationEnabled, formattingContext } = options;
  
  // Create a new state
  const newState = this.stateService.clone();
  
  // Store output in variables
  const varName = outputVariableName || 'stdout';
  newState.setTextVar(varName, stdout);
  if (stderr) {
    newState.setTextVar('stderr', stderr);
  }
  
  // Create replacement node if in transformation mode
  if (transformationEnabled) {
    // Create replacement node...
  }
  
  // Return result
  return { state: newState, replacement };
}
```

### Benefits:
1. **Clear Separation of Concerns**: Output handling is separate from execution
2. **Improved Testability**: Can test output handling without executing commands
3. **Better Documentation**: Types clearly show the structure of command output
4. **More Metadata**: Includes additional information about command execution

## 5. Define a Structured Interface for Command Definition Storage

### Current Issue:
Command definitions are stored in the state service without a clear structure:

```typescript
// When setting a command
state.setCommand(name, { command, parameters });

// When retrieving a command
const commandDef = context.state.getCommand(commandName);
```

This approach:
- Doesn't clearly define what a command definition contains
- Relies on implicit structure
- Makes it hard to understand what fields are available

### Proposed Solution:
Create a dedicated type for command definitions:

```typescript
export interface CommandParameter {
  name: string;
  position: number;
  defaultValue?: string;
}

export interface CommandDefinition {
  name: string;
  command: string;
  parameters: CommandParameter[];
  description?: string;
  createdAt: Date;
  
  // Metadata about the command
  metadata?: {
    sourceFile?: string;
    lineNumber?: number;
    author?: string;
  };
}
```

Update the state service interface:

```typescript
interface IStateService {
  // Other methods...
  
  setCommand(name: string, definition: Omit<CommandDefinition, 'name' | 'createdAt'>): void;
  getCommand(name: string): CommandDefinition | undefined;
  hasCommand(name: string): boolean;
  getAllCommands(): Record<string, CommandDefinition>;
}
```

### Benefits:
1. **Clear Structure**: Explicitly defines what a command definition contains
2. **Self-Documentation**: Types show what fields are available
3. **Validation**: Can validate command definitions against the expected structure
4. **Extended Metadata**: Provides a place for additional information about commands

## Conclusion

Implementing these type improvements would significantly enhance the `BasicCommandHandler` service and related components by:

1. **Reducing Runtime Errors**: Strong types catch errors at compile time
2. **Simplifying Code**: Less manual type checking and validation
3. **Improving Maintainability**: Clear interfaces make code easier to understand
4. **Enhancing Documentation**: Types serve as documentation for expected structure
5. **Enabling Better Testing**: Structured interfaces make testing more straightforward

These changes align with the architecture's dependency injection approach while strengthening the type system to provide better guarantees about code correctness. The discriminated union approach for run directive subtypes is particularly valuable as it creates clear boundaries between different run types and ensures exhaustive handling of all cases.