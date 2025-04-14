# Consolidated Feature List for @define Directive Implementation

## Core Type Structure
- **Command Definition Base Interface**:
  - Create `ICommandDefinition` with common properties:
    - `name`: string (command identifier)
    - `parameters`: Array of parameter information
    - `sourceLocation`: Optional source location for error reporting

- **Discriminated Union Pattern**:
  - Use `type: 'basic' | 'language'` to distinguish command types
  - Each type extends the base interface with specific properties

- **Basic Command Definition**:
  - Type: `'basic'`
  - `commandTemplate`: string (shell command with parameter placeholders)
  - `isMultiline`: boolean flag

- **Language Command Definition**:
  - Type: `'language'`
  - `language`: 'js' | 'python' | 'bash' | string
  - `codeBlock`: string (raw code to execute)
  - `languageParameters`: Optional array for language-specific parameters

## Parameter Handling
- **Enhanced Parameter Type**:
  ```typescript
  interface IParameterMetadata {
    name: string;
    position: number;
    required?: boolean;
    defaultValue?: string;
  }
  ```
- **Parameter Validation**:
  - Validate parameter names are valid identifiers
  - Check for duplicate parameter names
  - Validate parameter references in command body exist in parameter list

## Command Metadata
- **Metadata Support**:
  ```typescript
  interface ICommandMetadata {
    description?: string;
    visibility?: 'public' | 'private' | 'internal';
    tags?: string[];
  }
  ```
- **Metadata Extraction**:
  - Parse metadata from command name using dot notation pattern
  - Support for `visibility` and `description` metadata properties

## Command Storage & Retrieval
- **Registry Interface**:
  ```typescript
  interface ICommandRegistry {
    registerCommand(command: ICommandDefinition): void;
    getCommand(name: string): ICommandDefinition | undefined;
    hasCommand(name: string): boolean;
    getAllCommands(): ICommandDefinition[];
  }
  ```
- **Integration with StateService**:
  - Store commands in state with type safety
  - Efficient lookup by command name

## Execution Context
- **Execution Environment**:
  ```typescript
  interface IExecutionContext {
    workingDirectory: string;
    environmentVariables: Record<string, string>;
    substitutionMode: 'strict' | 'lenient';
    parentState?: IStateService;
  }
  ```
- **Error Context Preservation**:
  - Include original command name, parameters, and context in errors

## Validation Requirements
- **Static Validation**:
  - Command name must be a valid identifier
  - RHS must be a valid @run directive
  - Command structure must match its type

- **Runtime Validation**:
  - Check for command name collisions
  - Validate parameter count matches definition
  - Ensure type consistency based on command kind

## Type Guards & Utilities
- **Type Guards**:
  ```typescript
  function isBasicCommand(command: ICommandDefinition): command is IBasicCommandDefinition;
  function isLanguageCommand(command: ICommandDefinition): command is ILanguageCommandDefinition;
  ```
- **Utility Functions**:
  - Functions for parameter substitution
  - Command parsing and normalization utilities

## Integration with Existing Services
- **DirectiveService Integration**:
  - Register handler for @define directive
  - Process and store command definitions

- **ResolutionService Integration**:
  - Support for nested variable resolution in command templates
  - Context propagation for variable resolution

- **Parameter Substitution**:
  - Replace {{paramName}} placeholders with argument values
  - Handle nested variable resolution after substitution

## Error Handling
- **Clear Error Messages**:
  - Specific validation rule failures
  - Source location information
  - Suggestions for correction when possible

## Key Implementation Decisions

1. **Prioritizing Type Safety**: Using discriminated unions for command types ensures type safety throughout the codebase and provides better IDE support.

2. **Enhanced Parameter Metadata**: Going beyond simple string arrays to include position, required status, and default values provides better validation and execution flexibility.

3. **Metadata Support**: Including metadata in command definitions supports documentation and visibility control without requiring separate directives.

4. **Integration with DI System**: All components should work with the existing dependency injection architecture as described in the architecture documentation.

5. **Execution Context**: Providing a rich execution context object enables better error reporting and environment control during command execution.

6. **Deferred Implementation**: Some advanced features like parameter default values and type validation can be implemented in later phases if needed.