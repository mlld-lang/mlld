Based on the information provided, I'll create a comprehensive TypeScript type specification for the `@define` directive. This specification will focus on the core functionality of defining command templates while ensuring type safety and clear interfaces.

```typescript
/**
 * Types for the @define directive and related functionality
 */

/**
 * Discriminated union for the two types of command definitions
 * 
 * @remarks This uses the discriminated union pattern to provide compile-time
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
  
  /** The parameters expected by this command */
  parameters: string[];
  
  /** The shell command template to execute */
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
  
  /** The language interpreter to use (js, python, bash, etc.) */
  language: string;
  
  /** The parameters expected by this command */
  parameters: string[];
  
  /** The raw code block to execute */
  codeBlock: string;
  
  /** Parameters to pass to the language interpreter */
  languageParameters?: string[];
  
  /** Optional metadata about the command */
  metadata?: CommandMetadata;
}

/**
 * Optional metadata for command definitions
 * 
 * @remarks Added to support debugging and documentation needs while keeping
 * the core interfaces focused on essential functionality.
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
 * 
 * @remarks This specialized node type eliminates unsafe type casting and
 * provides clear structure for the parser and directive handlers.
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
  };
}

/**
 * Options for parameter substitution
 * 
 * @remarks Provides configuration options for parameter substitution behavior,
 * allowing for flexible handling of missing parameters and other edge cases.
 */
export interface ParameterSubstitutionOptions {
  /** Whether to throw on missing parameters (default: true) */
  strict?: boolean;
  
  /** Default value for missing parameters */
  defaultValue?: string;
}

/**
 * Result of executing a command
 * 
 * @remarks Standardized interface for command execution results to improve
 * error handling and ensure consistent behavior across the codebase.
 */
export interface CommandExecutionResult {
  /** Command output */
  stdout: string;
  
  /** Command error output */
  stderr: string;
  
  /** Exit code (0 means success) */
  exitCode: number;
  
  /** Original command that was executed */
  command: string;
}

/**
 * Type guard to check if a node is a define directive
 * 
 * @param node The node to check
 * @returns True if the node is a define directive
 */
export function isDefineDirectiveNode(node: MeldNode): node is DefineDirectiveNode {
  return node.type === 'Directive' && 
         node.directive?.kind === 'define';
}

/**
 * Type guard for basic commands
 * 
 * @param command The command to check
 * @returns True if the command is a basic command
 */
export function isBasicCommand(command: CommandDefinition): command is BasicCommandDefinition {
  return command.type === 'basic';
}

/**
 * Type guard for language commands
 * 
 * @param command The command to check
 * @returns True if the command is a language command
 */
export function isLanguageCommand(command: CommandDefinition): command is LanguageCommandDefinition {
  return command.type === 'language';
}

/**
 * Function to substitute parameters in a command template
 * 
 * @param template The command template string with {{param}} placeholders
 * @param parameters The parameter names defined for the command
 * @param args The argument values provided when invoking the command
 * @param options Options for parameter substitution behavior
 * @returns The command string with parameters substituted
 * 
 * @remarks This provides a consistent, type-safe approach to parameter
 * substitution that can be shared across the codebase.
 * 
 * @example
 * ```
 * const template = "echo {{message}} to {{recipient}}";
 * const result = substituteParameters(template, ["message", "recipient"], ["hello", "world"]);
 * // result: "echo hello to world"
 * ```
 */
export function substituteParameters(
  template: string,
  parameters: string[],
  args: string[],
  options?: ParameterSubstitutionOptions
): string {
  // Implementation to be provided
  throw new Error("Not implemented");
}

/**
 * Store a command definition in the state
 * 
 * @param state The state service
 * @param commandName The name of the command
 * @param definition The command definition to store
 * 
 * @remarks This is a utility function to standardize how command definitions
 * are stored in the state.
 */
export function storeCommandDefinition(
  state: IStateService,
  commandName: string, 
  definition: CommandDefinition
): void {
  // Implementation to be provided
  throw new Error("Not implemented");
}

/**
 * Retrieve a command definition from the state
 * 
 * @param state The state service
 * @param commandName The name of the command to retrieve
 * @returns The command definition or undefined if not found
 * 
 * @remarks This is a utility function to standardize how command definitions
 * are retrieved from the state.
 */
export function getCommandDefinition(
  state: IStateService,
  commandName: string
): CommandDefinition | undefined {
  // Implementation to be provided
  throw new Error("Not implemented");
}
```

This type specification provides a comprehensive foundation for implementing the `@define` directive in Meld. It focuses on the core functionality of defining command templates while ensuring type safety and clear interfaces. The discriminated union pattern for command definitions enables compile-time safety and exhaustive handling of both basic and language commands.

The design