Reviewing your information about the Meld architecture and the `@define` directive, I'll now create a TypeScript type definition proposal that aligns with the system's design patterns and requirements.

```typescript
/**
 * TypeScript type definitions for the @define directive
 */

/**
 * Parameter metadata for command definitions
 * 
 * @remarks Includes position information for positional parameter substitution
 * and optional metadata for future extensibility.
 */
export interface ICommandParameterMetadata {
  /** Parameter name used in substitution patterns like {{paramName}} */
  name: string;
  
  /** Zero-based position in the parameter list */
  position: number;
  
  /** Whether the parameter is required (defaults to true) */
  required?: boolean;
  
  /** Optional default value if not provided at invocation time */
  defaultValue?: string;
  
  // TODO: Runtime validation for parameter name format (must be valid identifier)
}

/**
 * Base interface for all command definitions
 * 
 * @remarks Using a discriminated union pattern with 'type' field for better type safety
 * and IDE support, following Meld's existing patterns.
 */
export interface ICommandDefinitionBase {
  /** Command name used in @run $commandName(...) */
  name: string;
  
  /** Discriminator field for the union type */
  type: 'basic' | 'language';
  
  /** Array of parameter metadata */
  parameters: ICommandParameterMetadata[];
  
  /** Optional source location for error reporting */
  sourceLocation?: {
    filePath: string;
    line: number;
    column: number;
  };
  
  /** Optional visibility metadata */
  visibility?: 'public' | 'private';
  
  /** Optional description for documentation */
  description?: string;
  
  // TODO: Runtime validation for command name (must be valid identifier)
}

/**
 * Definition for basic shell commands
 * 
 * @remarks Basic commands are shell commands with parameter substitution.
 * The template can contain {{paramName}} placeholders and {{varName}} variable references.
 */
export interface IBasicCommandDefinition extends ICommandDefinitionBase {
  /** Discriminator value */
  type: 'basic';
  
  /** The shell command template with parameter placeholders */
  commandTemplate: string;
  
  /** Whether this is a multiline command (using [[ ]]) */
  isMultiline: boolean;
  
  // TODO: Runtime validation that commandTemplate contains valid parameter references
}

/**
 * Definition for language-specific script commands
 * 
 * @remarks Language commands contain raw code blocks executed by specific interpreters.
 * Parameters are passed to the script as arguments rather than substituted in the code.
 */
export interface ILanguageCommandDefinition extends ICommandDefinitionBase {
  /** Discriminator value */
  type: 'language';
  
  /** The language identifier (js, python, bash, etc.) */
  language: string;
  
  /** The raw code block to execute */
  codeBlock: string;
  
  /** Optional language-specific parameters separate from the command parameters */
  languageParameters?: string[];
  
  // TODO: Runtime validation for supported languages
}

/**
 * Union type for all command definition types
 * 
 * @remarks Using discriminated union pattern for type safety
 */
export type ICommandDefinition = IBasicCommandDefinition | ILanguageCommandDefinition;

/**
 * Command registry interface for storing and retrieving command definitions
 * 
 * @remarks Designed to integrate with StateService for command storage
 */
export interface ICommandRegistry {
  /**
   * Register a command definition
   * 
   * @param definition The command definition to register
   * @returns boolean indicating success
   * @throws MeldDirectiveError if command name already exists or validation fails
   */
  registerCommand(definition: ICommandDefinition): boolean;
  
  /**
   * Get a command definition by name
   * 
   * @param name The name of the command to retrieve
   * @returns The command definition or undefined if not found
   */
  getCommand(name: string): ICommandDefinition | undefined;
  
  /**
   * Check if a command exists
   * 
   * @param name The name of the command to check
   * @returns boolean indicating if the command exists
   */
  hasCommand(name: string): boolean;
  
  /**
   * Get all registered commands
   * 
   * @returns Array of all command definitions
   */
  getAllCommands(): ICommandDefinition[];
}

/**
 * Type guard for checking if a command definition is a basic command
 * 
 * @param definition The command definition to check
 * @returns boolean indicating if it's a basic command
 */
export function isBasicCommand(definition: ICommandDefinition): definition is IBasicCommandDefinition {
  return definition.type === 'basic';
}

/**
 * Type guard for checking if a command definition is a language command
 * 
 * @param definition The command definition to check
 * @returns boolean indicating if it's a language command
 */
export function isLanguageCommand(definition: ICommandDefinition): definition is ILanguageCommandDefinition {
  return definition.type === 'language';
}

/**
 * Execution context for command invocation
 * 
 * @remarks Provides context for error reporting and environment control
 */
export interface ICommandExecutionContext {
  /** The original command name */
  commandName: string;
  
  /** The resolved arguments for the command */
  resolvedArguments: string[];
  
  /** The state service instance */
  state: IStateService;
  
  /** The resolution service for variable resolution */
  resolutionService: IResolutionService;
  
  /** The file system service for file operations */
  fileSystem: IFileSystemService;
  
  /** The path service for path operations */
  pathService: IPathService;
  
  /** Optional working directory for command execution */
  workingDirectory?: string;
  
  /** Optional environment variables for command execution */
  environmentVariables?: Record<string, string>;
}

/**
 * Options for command definition parsing
 * 
 * @remarks Configuration options for the @define directive handler
 */
export interface ICommandDefinitionOptions {
  /** Whether to allow overriding existing commands */
  allowOverride?: boolean;
  
  /** Whether to extract metadata from command name */
  extractMetadata?: boolean;
  
  /** Default visibility for commands without explicit metadata */
  defaultVisibility?: 'public' | 'private';
}
```