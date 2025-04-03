I'll create a TypeScript type specification for the `@run` directive, focusing on clearly defining the different subtypes and their properties based on the consolidated requirements.

```typescript
/**
 * Type definitions for the @run directive
 * @module RunDirectiveTypes
 */

/**
 * Parameter for a command - can be a literal value or a variable reference
 * @remarks Uses discriminated union pattern for clearer type safety and IDE support
 */
export type Parameter = 
  | { type: 'literal'; value: string }
  | { type: 'variableReference'; name: string; path?: string[] };

/**
 * Command argument for defined commands
 * @remarks Standardized to handle both positional and named arguments
 */
export type CommandArg = 
  | { type: 'literal'; value: string }
  | { type: 'variableReference'; name: string; path?: string[] };

/**
 * Reference to a defined command
 * @remarks Unified to handle both string-based and AST-based references
 */
export type CommandReference = 
  | { type: 'name'; name: string }
  | { type: 'path'; path: string[] };

/**
 * Supported script languages for language commands
 * @remarks Limited to these three languages initially as per requirements
 */
export type ScriptLanguage = 'js' | 'python' | 'bash';

/**
 * Execution context for running commands
 * @remarks Prioritized security controls to prevent command injection
 */
export interface ExecutionContext {
  /** Working directory for command execution */
  cwd: string;
  
  /** Environment variables to be passed to the command */
  env: Record<string, string>;
  
  /** Security settings for command execution */
  security: {
    /** Whether to allow network access */
    allowNetwork: boolean;
    
    /** Maximum execution time in milliseconds */
    timeoutMs: number;
    
    /** Maximum amount of memory the command can use (in MB) */
    maxMemoryMb?: number;
    
    /** Allowed directories for file operations */
    allowedPaths?: string[];
  };
}

/**
 * Result of command execution
 */
export interface ExecutionResult {
  /** Command output to stdout */
  stdout: string;
  
  /** Command output to stderr */
  stderr: string;
  
  /** Command exit code */
  exitCode: number;
  
  /** Execution metadata */
  metadata: {
    /** Duration of command execution in milliseconds */
    durationMs: number;
    
    /** Command that was executed (with variables resolved) */
    resolvedCommand: string;
    
    /** Whether the command was executed successfully */
    success: boolean;
  };
}

/**
 * Base interface for all @run directive subtypes
 */
export interface RunDirectiveBase {
  /** Common properties for all run directives */
  directiveType: '@run';
  
  /** Optional execution context overrides */
  executionContext?: Partial<ExecutionContext>;
}

/**
 * Basic command subtype - executes shell commands
 * @remarks Handles both single-line and multi-line commands
 */
export interface BasicCommandRun extends RunDirectiveBase {
  /** Discriminator for the run directive subtype */
  type: 'basicCommand';
  
  /** The command to execute */
  command: string;
  
  /** Whether this is a multi-line command */
  isMultiLine?: boolean;
}

/**
 * Language command subtype - executes code in a specific language
 */
export interface LanguageCommandRun extends RunDirectiveBase {
  /** Discriminator for the run directive subtype */
  type: 'languageCommand';
  
  /** The language to use for execution */
  language: ScriptLanguage;
  
  /** The code to execute */
  command: string;
  
  /** Parameters to pass to the script */
  parameters: Parameter[];
}

/**
 * Defined command subtype - executes a previously defined command
 */
export interface DefinedCommandRun extends RunDirectiveBase {
  /** Discriminator for the run directive subtype */
  type: 'definedCommand';
  
  /** Reference to the command definition */
  commandRef: CommandReference;
  
  /** Arguments to pass to the command */
  args: CommandArg[];
}

/**
 * Union type for all @run directive subtypes
 * @remarks Implemented as a discriminated union for better type safety
 */
export type RunDirective = 
  | BasicCommandRun
  | LanguageCommandRun
  | DefinedCommandRun;

/**
 * Definition of a command that can be referenced by @run directives
 */
export interface CommandDefinition {
  /** Name of the command */
  name: string;
  
  /** The command template with parameter placeholders */
  command: string;
  
  /** Parameter definitions */
  parameters: Array<{
    /** Parameter name */
    name: string;
    
    /** Parameter description */
    description?: string;
    
    /** Whether the parameter is required */
    required?: boolean;
    
    /** Default value if parameter is not provided */
    defaultValue?: string;
    
    /** Validation constraints */
    validation?: {
      /** Regular expression pattern the parameter must match */
      pattern?: string;
      
      /** Allowed values for the parameter */
      allowedValues?: string[];
    };
  }>;
  
  /** Description of the command */
  description?: string;
  
  /** Default execution context for this command */
  defaultExecutionContext?: Partial<ExecutionContext>;
}

/**
 * Service interface for executing run directives
 * @remarks Unified execution interface with single entry point
 */
export interface IRunDirectiveExecutor {
  /**
   * Execute a run directive
   * @param directive The directive to execute
   * @param context The execution context
   * @returns The execution result
   */
  execute(directive: RunDirective, context: ExecutionContext): Promise<ExecutionResult>;
  
  /**
   * Validate a run directive
   * @param directive The directive to validate
   * @returns Validation errors, if any
   */
  validate(directive: RunDirective): string[];
}
```