```typescript
/**
 * Types for the @define directive and related functionality
 * 
 * @remarks
 * This type system provides a comprehensive, type-safe approach to working with
 * @define directives in Meld. It addresses the core needs identified across all services
 * while maintaining backward compatibility with existing code.
 */

/**
 * Discriminated union for the two types of command definitions
 * 
 * @remarks
 * This uses the discriminated union pattern to provide compile-time
 * safety when working with different command types, eliminating the need for
 * manual type checking and enabling exhaustive handling of both command types.
 */
export type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;

/**
 * Definition for basic shell commands
 * 
 * @example
 * ```
 * @define echo(message) = @run echo {{message}}
 * ```
 */
export interface BasicCommandDefinition {
  /** Discriminant to identify this as a basic command */
  type: 'basic';
  
  /** The name of the command */
  name: string;
  
  /** The parameters expected by this command */
  parameters: CommandParameter[];
  
  /** The shell command template text to embed */
  commandTemplate: string;
  
  /** Whether this uses multiline syntax [[ ]] */
  isMultiline?: boolean;
  
  /** Optional metadata about the command */
  metadata?: CommandMetadata;
}

/**
 * Definition for language-specific commands
 * 
 * @example
 * ```
 * @define logMessage(name) = @run js(name) [[
 *   console.log(`Hello, ${name}!`);
 * ]]
 * ```
 */
export interface LanguageCommandDefinition {
  /** Discriminant to identify this as a language command */
  type: 'language';
  
  /** The name of the command */
  name: string;
  
  /** The language interpreter to use */
  language: SupportedLanguage;
  
  /** The parameters expected by this command */
  parameters: CommandParameter[];
  
  /** The raw code block text to embed */
  codeBlock: string;
  
  /** Parameters to pass to the language interpreter */
  languageParameters?: string[];
  
  /** Environment variables to pass to the language interpreter */
  environmentVars?: Record<string, string>;
  
  /** Optional metadata about the command */
  metadata?: CommandMetadata;
}

/**
 * Supported language types for language commands
 */
export type SupportedLanguage = 'js' | 'python' | 'bash' | 'node' | 'shell' | string;

/**
 * Enhanced parameter definition with position and validation information
 */
export interface CommandParameter {
  /** Parameter name */
  name: string;
  
  /** Position in the parameter list (0-based) */
  position: number;
  
  /** Whether this parameter is required */
  required?: boolean;
  
  /** Default value if not provided */
  defaultValue?: string;
  
  /** Validation rules for this parameter */
  validation?: ParameterValidation;
}

/**
 * Validation rules for command parameters
 */
export interface ParameterValidation {
  /** Regular expression pattern this parameter must match */
  pattern?: RegExp;
  
  /** Minimum length for string parameters */
  minLength?: number;
  
  /** Maximum length for string parameters */
  maxLength?: number;
  
  /** Custom validation function */
  validator?: (value: string) => boolean;
  
  /** Error message to display if validation fails */
  errorMessage?: string;
}

/**
 * Parameter mapping for substitution
 */
export interface ParameterMapping {
  /** Map of parameter names to their values */
  [paramName: string]: string;
  
  /** Positional arguments array (alternative to named parameters) */
  _args?: string[];
}

/**
 * Optional metadata for command definitions
 */
export interface CommandMetadata {
  /** Source file where the command was defined */
  sourceFile?: string;
  
  /** Line number where the command was defined */
  lineNumber?: number;
  
  /** Description of the command's purpose */
  description?: string;
  
  /** When the command was defined */
  definedAt?: Date;
  
  /** Source location information for error reporting */
  location?: SourceLocation;
  
  /** Risk level of this command */
  riskLevel?: 'low' | 'medium' | 'high';
  
  /** Tags for categorizing commands */
  tags?: string[];
}

/**
 * Source location information for error reporting
 */
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

/**
 * Extended interface for define directive nodes
 */
export interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    
    /** The name of the command without parameters */
    name: string;
    
    /** Parameter list as parsed */
    parameters: string[];
    
    /** Right-hand side directive (always a run directive) */
    runDirective: {
      kind: 'run';
      
      /** For language commands, the language specified */
      language?: string;
      
      /** For language commands, language parameters */
      languageParameters?: string[];
      
      /** Command content (template string or code block) */
      content: string;
      
      /** Whether the content is a code block (double brackets) */
      isCodeBlock: boolean;
    };
    
    /** Original source text */
    source?: string;
  };
}

/**
 * Options for parameter substitution
 */
export interface ParameterSubstitutionOptions {
  /** Whether to throw on missing parameters (default: true) */
  strict?: boolean;
  
  /** Default value for missing parameters */
  defaultValue?: string;
  
  /** Whether to allow extra parameters not defined in the command */
  allowExtraParameters?: boolean;
  
  /** Whether to interpolate variables in parameter values */
  interpolateVariables?: boolean;
  
  /** Function to call when a parameter is missing */
  onMissingParameter?: (paramName: string) => string | undefined;
}

/**
 * Result of executing a command
 */
export interface CommandExecutionResult {
  /** Command output */
  output: string;
  
  /** Command error output */
  errorOutput: string;
  
  /** Exit code (0 means success) */
  exitCode: number;
  
  /** Original command that was executed */
  command: string;
  
  /** Type of command that was executed */
  commandType: 'basic' | 'language';
}

/**
 * Options for executing commands
 */
export interface CommandExecutionOptions {
  /** Working directory for the command */
  cwd?: string;
  
  /** Environment variables to pass to the command */
  env?: Record<string, string>;
  
  /** Timeout in milliseconds */
  timeout?: number;
  
  /** Whether to capture stderr */
  captureStderr?: boolean;
  
  /** Whether to throw on non-zero exit code */
  throwOnError?: boolean;
}

/**
 * Structure for command execution request
 */
export interface CommandExecutionRequest {
  /** The command definition */
  definition: CommandDefinition;
  
  /** The arguments to pass to the command */
  args: string[] | ParameterMapping;
  
  /** Execution options */
  options?: CommandExecutionOptions;
}

/**
 * Command registry interface
 */
export interface ICommandRegistry {
  /** Register a command definition */
  registerCommand(name: string, definition: CommandDefinition): void;
  
  /** Get a command definition by name */
  getCommand(name: string): CommandDefinition | undefined;
  
  /** Check if a command exists */
  hasCommand(name: string): boolean;
  
  /** List all registered commands */
  listCommands(): string[];
  
  /** Remove a command */
  removeCommand(name: string): boolean;
}

/**
 * Context for command resolution
 */
export interface CommandResolutionContext {
  /** The state service */
  state