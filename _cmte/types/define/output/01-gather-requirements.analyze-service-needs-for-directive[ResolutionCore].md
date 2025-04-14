# Improving @define Directive Type Safety in ResolutionCore

After analyzing the ResolutionService implementation and understanding the @define directive's purpose in Meld, I've identified several opportunities to enhance type safety and improve code clarity. The current implementation lacks strong typing for command definitions, which introduces complexity in command resolution and execution.

## 1. Current Challenges in Command Resolution

The ResolutionService handles command resolution through the `resolveCommand` method:

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

However, the code faces several challenges:

1. **Lack of Type Discrimination**: There's no clear distinction between basic shell commands and language-specific commands
2. **Weak Parameter Validation**: No static typing to ensure arguments match command parameters
3. **Inconsistent Command Representation**: The command definition structure is not strongly typed
4. **Manual Command Retrieval**: Commands are retrieved from state without type checking
5. **Error-Prone Parameter Substitution**: Parameter substitution relies on positional matching without type safety

## 2. Proposed Type Improvements

### 2.1 Command Definition Type Hierarchy

First, I propose creating a discriminated union for command definitions:

```typescript
// Base interface for all command definitions
interface CommandDefinitionBase {
  name: string;
  parameters: string[];
  metadata?: {
    description?: string;
    source?: string;
    definedAt?: {
      filePath: string;
      line: number;
    }
  };
}

// For shell commands (using @run [command])
interface ShellCommandDefinition extends CommandDefinitionBase {
  type: 'shell';
  commandTemplate: string; // The template string with {{param}} placeholders
}

// For language commands (using @run js/python/bash)
interface LanguageCommandDefinition extends CommandDefinitionBase {
  type: 'language';
  language: 'js' | 'python' | 'bash' | string; // Language identifier
  codeBlock: string; // Raw code block content
}

// Union type for all command definitions
type CommandDefinition = ShellCommandDefinition | LanguageCommandDefinition;
```

**Benefits:**
- **Type Safety**: The discriminated union with the `type` field allows TypeScript to narrow types based on the command type
- **Self-Documentation**: The structure clearly documents the different command types and their required properties
- **Error Prevention**: Required properties ensure all necessary data is provided
- **IDE Support**: Improved autocomplete and type checking during development

### 2.2 Command Arguments Type

To ensure arguments match parameters, we can create a generic type:

```typescript
// Type for command arguments that enforces matching with parameters
type CommandArguments<T extends CommandDefinition> = {
  [K in keyof T['parameters']]: string;
};
```

**Benefits:**
- **Parameter Validation**: Ensures arguments match the expected parameters
- **Prevents Mismatch**: Catches mismatched argument counts at compile time
- **Self-Documenting**: Makes parameter requirements explicit

### 2.3 Command Resolution Context

To improve resolution context, we can extend the existing ResolutionContext:

```typescript
interface CommandResolutionContext extends ResolutionContext {
  commandType?: 'shell' | 'language';
  substitutionMode?: 'strict' | 'lenient';
  environmentVariables?: Record<string, string>;
  workingDirectory?: string;
}
```

**Benefits:**
- **Contextual Execution**: Provides necessary context for command execution
- **Flexible Configuration**: Allows customizing command behavior
- **Environment Control**: Enables specifying environment variables and working directory

### 2.4 State Service Command Storage Interface

To improve how commands are stored and retrieved from state:

```typescript
// Enhanced interface for StateService command operations
interface CommandStateOperations {
  // Store a command definition
  setCommand(name: string, definition: CommandDefinition): void;
  
  // Retrieve a typed command definition
  getCommand<T extends 'shell' | 'language' = 'shell'>(
    name: string
  ): T extends 'shell' ? ShellCommandDefinition : LanguageCommandDefinition;
  
  // Check if a command exists
  hasCommand(name: string): boolean;
  
  // Get all commands of a specific type
  getCommandsByType(type: 'shell' | 'language'): CommandDefinition[];
}
```

**Benefits:**
- **Type-Safe Retrieval**: Returns properly typed command definitions
- **Error Prevention**: Prevents accessing undefined commands without checks
- **Query Capabilities**: Allows filtering commands by type

## 3. Implementation in ResolutionService

### 3.1 Enhanced Command Resolution

With these types, the command resolution process becomes more robust:

```typescript
async resolveCommand(
  cmdName: string, 
  args: string[], 
  context: ResolutionContext
): Promise<string> {
  // Get the command definition with proper typing
  const commandDef = context.state.getCommand(cmdName);
  
  if (!commandDef) {
    throw new MeldResolutionError(
      `Command not found: ${cmdName}`,
      {
        code: ResolutionErrorCode.COMMAND_NOT_FOUND,
        details: { commandName: cmdName },
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Type narrowing based on discriminated union
  if (commandDef.type === 'shell') {
    return this.resolveShellCommand(commandDef, args, context);
  } else {
    return this.resolveLanguageCommand(commandDef, args, context);
  }
}
```

### 3.2 Parameter Validation

With stronger types, we can validate parameters against the command definition:

```typescript
private validateCommandArguments(
  command: CommandDefinition,
  args: string[]
): void {
  if (command.parameters.length !== args.length) {
    throw new MeldResolutionError(
      `Command ${command.name} expects ${command.parameters.length} parameters, but got ${args.length}`,
      {
        code: ResolutionErrorCode.INVALID_COMMAND,
        details: { 
          commandName: command.name,
          expectedParams: command.parameters,
          actualArgs: args
        },
        severity: ErrorSeverity.Fatal
      }
    );
  }
}
```

## 4. Improved Command Resolver Implementation

The CommandResolver class would benefit from these types:

```typescript
class CommandResolver {
  constructor(private stateService: IStateService) {}
  
  async resolve(node: DirectiveNode, context: ResolutionContext): Promise<string> {
    const { name, args } = node.directive;
    
    // Get typed command definition
    const commandDef = this.stateService.getCommand(name);
    if (!commandDef) {
      throw VariableResolutionErrorFactory.commandNotFound(name);
    }
    
    // Type narrowing works automatically with discriminated union
    if (commandDef.type === 'shell') {
      return this.resolveShellCommand(commandDef, args, context);
    } else {
      return this.resolveLanguageCommand(commandDef, args, context);
    }
  }
  
  private async resolveShellCommand(
    command: ShellCommandDefinition,
    args: string[],
    context: ResolutionContext
  ): Promise<string> {
    // Validate argument count
    if (command.parameters.length !== args.length) {
      throw VariableResolutionErrorFactory.invalidArgumentCount(
        command.name, 
        command.parameters.length, 
        args.length
      );
    }
    
    // Create parameter substitution map
    const substitutions = new Map<string, string>();
    command.parameters.forEach((param, index) => {
      substitutions.set(param, args[index]);
    });
    
    // Apply substitutions to command template
    let resolvedCommand = command.commandTemplate;
    for (const [param, value] of substitutions.entries()) {
      // Replace {{param}} with the actual value
      resolvedCommand = resolvedCommand.replace(
        new RegExp(`{{${param}}}`, 'g'), 
        value
      );
    }
    
    return resolvedCommand;
  }
  
  private async resolveLanguageCommand(
    command: LanguageCommandDefinition,
    args: string[],
    context: ResolutionContext
  ): Promise<string> {
    // Language-specific command execution logic
    // ...
  }
}
```

## 5. Benefits for the @define Directive Handler

The DefineDirectiveHandler would also benefit from these types:

```typescript
class DefineDirectiveHandler implements IDirectiveHandler {
  async execute(
    node: DirectiveNode, 
    context: DirectiveContext
  ): Promise<DirectiveResult> {
    // Extract command name and parameters
    const { name, value } = node.directive;
    
    // Parse parameters from the define directive
    const paramMatch = /(\w+)\s*\((.*?)\)/.exec(name);
    if (!paramMatch) {
      throw new MeldDirectiveError(
        'Invalid @define syntax, expected: @define name(param1, param2) = @run ...',
        { node }
      );
    }
    
    const commandName = paramMatch[1];
    const parameters = paramMatch[2]
      .split(',')
      .map(p => p.trim())
      .filter(p => p);
    
    // Determine if this is a shell or language command
    const isLanguageCommand = value.includes('@run js') || 
                             value.includes('@run python') || 
                             value.includes('@run bash');
    
    let commandDef: CommandDefinition;
    
    if (isLanguageCommand) {
      // Extract language and code block
      const langMatch = /@run\s+(\w+)\s*\(.*?\)\s*\[\[([\s\S]*?)\]\]/m.exec(value);
      if (!langMatch) {
        throw new MeldDirectiveError(
          'Invalid language command syntax in @define directive',
          { node }
        );
      }
      
      commandDef = {
        type: 'language',
        name: commandName,
        parameters,
        language: langMatch[1],
        codeBlock: langMatch[2]
      };
    } else {
      // Extract command template
      const cmdMatch = /@run\s+(?:\[\[([\s\S]*?)\]\]|\[(.*?)\])/m.exec(value);
      if (!cmdMatch) {
        throw new MeldDirectiveError(
          'Invalid shell command syntax in @define directive',
          { node }
        );
      }
      
      commandDef = {
        type: 'shell',
        name: commandName,
        parameters,
        commandTemplate: cmdMatch[1] || cmdMatch[2]
      };
    }
    
    // Store the command definition in state
    context.state.setCommand(commandName, commandDef);
    
    return {
      value: null,
      metadata: {
        commandName,
        commandType: commandDef.type,
        parameters: commandDef.parameters
      }
    };
  }
}
```

## 6. Benefits for Resolution and Error Handling

With these improved types, error handling becomes more precise:

```typescript
// Enhanced error factory for command-related errors
class CommandResolutionErrorFactory {
  static commandNotFound(commandName: string): MeldResolutionError {
    return new MeldResolutionError(
      `Command not found: ${commandName}`,
      {
        code: ResolutionErrorCode.COMMAND_NOT_FOUND,
        details: { commandName },
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  static invalidArgumentCount(
    commandName: string, 
    expected: number, 
    actual: number
  ): MeldResolutionError {
    return new MeldResolutionError(
      `Command ${commandName} expects ${expected} arguments, but got ${actual}`,
      {
        code: ResolutionErrorCode.INVALID_COMMAND,
        details: { commandName, expected, actual },
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  static languageExecutionError(
    commandName: string,
    language: string,
    error: string
  ): MeldResolutionError {
    return new MeldResolutionError(
      `Error executing ${language} command ${commandName}: ${error}`,
      {
        code: ResolutionErrorCode.RESOLUTION_FAILED,
        details: { commandName, language, error },
        severity: ErrorSeverity.Fatal
      }
    );
  }
}
```

## 7. Summary of Benefits

Implementing these type improvements for the @define directive would provide:

1. **Type Safety**: Discriminated unions ensure proper handling of different command types
2. **Self-Documentation**: The types themselves document the structure and requirements
3. **Error Prevention**: Early detection of errors through static type checking
4. **Simplified Logic**: Cleaner code with less defensive programming and manual checks
5. **Consistent Structure**: Standard representation of commands across the codebase
6. **Better IDE Support**: Improved autocomplete, hover information, and refactoring support
7. **Precise Error Messages**: More specific error messages with detailed context
8. **Maintainability**: Easier to understand and modify command-related code

These improvements align with the Meld architecture's focus on strong typing and dependency injection, making the code more robust and easier to maintain.