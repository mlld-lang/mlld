Based on all the feedback from service leads, I've refined the TypeScript types for the `@run` directive to address the consensus requirements and suggestions. Here's the final specification:

```typescript
/**
 * Type definitions for the @run directive
 * @module RunDirectiveTypes
 */

/**
 * Supported variable types for resolution
 * @remarks Added based on feedback from LanguageCommandHandler and DefinedCommandHandler leads
 */
export type VariableType = 'text' | 'data' | 'path' | 'command';

/**
 * Parameter for a command - can be a literal value or a variable reference
 * @remarks Enhanced based on DefinedCommandHandler feedback to support variable types and field access
 */
export type Parameter = 
  | { type: 'literal'; value: string | number | boolean | null }
  | { 
      type: 'variableReference'; 
      name: string; 
      path?: string[]; 
      variableType?: VariableType;
    };

/**
 * Command argument for defined commands
 * @remarks Standardized to handle both positional and named arguments
 */
export type CommandArg = 
  | { type: 'literal'; value: string | number | boolean | null }
  | { 
      type: 'variableReference'; 
      name: string; 
      path?: string[]; 
      variableType?: VariableType;
    };

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
 * @remarks Enhanced with animation support and tempDir based on CommandExecution and FileSystemCore feedback
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
  
  /** Directory for temporary files (added per FileSystemCore feedback) */
  tempDir?: string;
  
  /** Shell-specific settings (added per CoreDirective feedback) */
  shell?: {
    /** Type of shell to use (e.g., 'bash', 'sh', 'zsh', 'powershell') */
    type?: string;
    
    /** Additional shell options */
    options?: string[];
  };
  
  /** Animation settings (added per CommandExecution feedback) */
  animation?: {
    /** Whether to show animation during execution */
    show: boolean;
    
    /** Animation type or style */
    type?: 'spinner' | 'progress' | 'dots';
  };
  
  /** State tracking info (added per StateCore feedback) */
  stateId?: string;
}

/**
 * Result of command execution
 * @remarks Maintained compatibility with existing interface while adding metadata
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
 * Error type for command execution failures
 * @remarks Added based on CommandExecution feedback
 */
export interface CommandExecutionError extends Error {
  /** Original command that failed */
  command: string;
  
  /** Exit code if available */
  exitCode?: number;
  
  /** Stderr output if available */
  stderr?: string;
  
  /** Context information for debugging */
  context?: Record<string, unknown>;
}

/**
 * Base interface for all @run directive subtypes
 * @remarks Added outputVar based on consistent feedback from multiple services
 */
export interface RunDirectiveBase {
  /** Common properties for all run directives */
  directiveType: '@run';
  
  /** Optional execution context overrides */
  executionContext?: Partial<ExecutionContext>;
  
  /** Variable to store command output (added per multiple services' feedback) */
  outputVar?: string;
  
  /** Whether to capture and return command output */
  captureOutput?: boolean;
  
  /** Individual timeout override (added per RunHandlerCore feedback) */
  timeoutMs?: number;
  
  /** Output formatting options */
  outputFormatting?: {
    /** How to render the output in the document */
    renderAs?: 'text' | 'code' | 'markdown' | 'none';
    
    /** Whether to preserve output formatting */
    preserveFormatting?: boolean;
  };
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
    
    /** Parameter type */
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    
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
 * Variable resolution tracking interface
 * @remarks Added based on StateCore feedback
 */
export interface VariableResolutionInfo {
  /** Original variable reference string */
  original: string;
  
  /** Resolved value */
  resolved: unknown;
  
  /** Variable type that was resolved */
  variableType: VariableType;
  
  /** Resolution timestamp */
  timestamp: number;
  
  /** Whether resolution was successful */
  success: boolean;
  
  /** Error message if resolution failed */
  error?: string;
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
  
  /**
   * Track variable resolution during command preparation
   * @param resolutionInfo Information about variable resolution
   */
  trackVariableResolution(resolutionInfo: VariableResolutionInfo): void;
}
```