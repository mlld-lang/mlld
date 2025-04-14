Looking at all the service lead feedback, I'll synthesize a final TypeScript definition for the `@define` directive that addresses the key points raised while maintaining a clean and consistent API.

```typescript
/**
 * TypeScript type definitions for the @define directive
 * 
 * @remarks
 * This implementation incorporates feedback from all service leads, with special
 * attention to type safety, parameter handling, and integration with existing services.
 */

/**
 * Parameter metadata for command definitions
 * 
 * @remarks
 * Includes position information for positional parameter substitution
 * and validation metadata. All parameters are ultimately resolved as strings,
 * even when representing complex data, as 'define' in Meld exclusively embeds
 * text content or variable values.
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
  
  /** Validation status of the parameter name */
  validationStatus?: 'valid' | 'invalid' | 'warning';
}

/**
 * Base interface for all command definitions
 * 
 * @remarks
 * Uses a discriminated union pattern with 'type' field for better type safety
 * and IDE support, following Meld's existing patterns.
 */
export interface ICommandDefinitionBase {
  /** Command name used in @run $commandName(...) */
  name: string;
  
  /** Discriminator field for the union type */
  type: 'basic' | 'language';
  
  /** Array of parameter metadata */
  parameters: ICommandParameterMetadata[];
  
  /** Original directive text for debugging purposes */
  originalText?: string;
  
  /** Source location for error reporting */
  sourceLocation?: {
    filePath: string;
    line: number;
    column: number;
  };
  
  /** Visibility metadata */
  visibility?: 'public' | 'private';
  
  /** Risk level associated with the command */
  riskLevel?: 'low' | 'medium' | 'high';
  
  /** Description for documentation */
  description?: string;
  
  /** When the command was defined, for debugging and state tracking */
  definedAt?: number;
  
  /** Metadata to track variable resolution for debugging */
  resolutionTracking?: {
    resolvedVariables: string[];
    unresolvedReferences: string[];
  };
}

/**
 * Definition for basic shell commands
 * 
 * @remarks
 * Basic commands are shell commands with parameter substitution.
 * The template can contain {{paramName}} placeholders and {{varName}} variable references.
 */
export interface IBasicCommandDefinition extends ICommandDefinitionBase {
  /** Discriminator value */
  type: 'basic';
  
  /** The shell command template with parameter placeholders */
  commandTemplate: string;
  
  /** Whether this is a multiline command (using [[ ]]) */
  isMultiline: boolean;
  
  /** When variables should be resolved: immediate, deferred, or none */
  variableResolutionMode?: 'immediate' | 'deferred' | 'none';
}

/**
 * Definition for language-specific script commands
 * 
 * @remarks
 * Language commands contain raw code blocks executed by specific interpreters.
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
  
  /** Execution mode metadata for logging and reporting */
  executionMode?: 'script' | 'interpreter' | 'embedded';
}

/**
 * Union type for all command definition types
 * 
 * @remarks
 * Using discriminated union pattern for type safety
 */
export type ICommandDefinition = IBasicCommandDefinition | ILanguageCommandDefinition;

/**
 * Command registry interface for storing and retrieving command definitions
 * 
 * @remarks
 * Designed to integrate with StateService for command storage
 */
export interface ICommandRegistry {
  /**
   * Register a command definition
   * 
   * @param definition The command definition to register
   * @param options Optional registration options
   * @returns boolean indicating success
   * @throws MeldDirectiveError if command name already exists or validation fails
   */
  registerCommand(definition: ICommandDefinition, options?: ICommandDefinitionOptions): boolean;
  
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
  
  /**
   * Validate a command definition
   * 
   * @param definition The command definition to validate
   * @returns Validation result object
   */
  validateCommand(definition: ICommandDefinition): ICommandValidationResult;
}

/**
 * Command validation result interface
 * 
 * @remarks
 * Provides structured validation feedback for command definitions
 */
export interface ICommandValidationResult {
  /** Whether the command definition is valid */
  isValid: boolean;
  
  /** Array of validation errors */
  errors: ICommandValidationError[];
  
  /** Array of validation warnings */
  warnings: ICommandValidationError[];
}

/**
 * Command validation error interface
 * 
 * @remarks
 * Structured error information for command validation
 */
export interface ICommandValidationError {
  /** Error code for programmatic handling */
  code: string;
  
  /** Human-readable error message */
  message: string;
  
  /** Location information if available */
  location?: {
    field: string;
    index?: number;
  };
}

/**
 * Command execution result interface
 * 
 * @remarks
 * Standardizes return values from command execution
 */
export interface ICommandExecutionResult {
  /** Whether the command executed successfully */
  success: boolean;
  
  /** Exit code if applicable */
  exitCode?: number;
  
  /** Standard output from the command */
  stdout?: string;
  
  /** Standard error from the command */
  stderr?: string;
  
  /** Any error that occurred during execution */
  error?: Error;
  
  /** Execution metadata for debugging */
  metadata?: {
    /** Execution duration in milliseconds */
    durationMs: number;
    /** Command that was executed (after variable substitution) */
    executedCommand?: string;
    /** Working directory where the command was executed */
    workingDirectory?: string;
  };
}

/**
 * Execution context for command invocation
 * 
 * @remarks
 * Provides context for error reporting and environment control
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
  
  /** Whether to resolve variables during command execution */
  resolveVariables?: boolean;
}

/**
 * Options for command definition parsing
 * 
 * @remarks
 * Configuration options for the @define directive handler
 */
export interface ICommandDefinitionOptions {
  /** Whether to allow overriding existing commands */
  allowOverride?: boolean;
  
  /** Whether to extract metadata from command name */
  extractMetadata?: boolean;
  
  /** Default visibility for commands without explicit metadata */
  defaultVisibility?: 'public' | 'private';
  
  /** Default risk level for commands without explicit metadata */
  defaultRiskLevel?: 'low' | 'medium' | 'high';
}

/**
 * Utility function to validate parameter names
 * 
 * @param parameterNames Array of parameter names to validate
 * @returns Array of invalid parameter names
 */
export function validateParameterNames(parameterNames: string[]): string[] {
  const invalidNames: string[] = [];
  const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  
  for (const name of parameterNames) {
    if (!validIdentifierRegex.test(name)) {
      invalidNames.push(name);
    }
  }
  
  return invalidNames;
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
```