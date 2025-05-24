# Improving TypeScript Types for the @define Directive in ResolutionService

## Current Challenges in ResolutionService

After analyzing the ResolutionService code and its interaction with the `@define` directive, I've identified several areas where stronger TypeScript types would significantly improve code safety, maintainability, and clarity:

## 1. Command Structure Type Improvements

### Current Issues:
- The ResolutionService's `resolveCommand` method accepts a generic command name and string array of arguments without strong typing
- The `stateService.getCommand(ref)` returns a generic object where the structure is assumed but not enforced
- There's no clear distinction between basic shell commands and language-specific commands

### Proposed Solution:

```typescript
/**
 * Discriminated union for the two types of command definitions
 */
type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;

/**
 * Definition for basic shell commands
 */
interface BasicCommandDefinition {
  type: 'basic';
  /** The parameters expected by this command */
  params: string[];
  /** The shell command template to execute */
  command: string;
  /** Optional metadata about the command */
  metadata?: CommandMetadata;
}

/**
 * Definition for language-specific commands
 */
interface LanguageCommandDefinition {
  type: 'language';
  /** The language interpreter to use (js, python, bash, etc.) */
  language: 'js' | 'python' | 'bash' | string;
  /** The parameters expected by this command */
  params: string[];
  /** The raw code block to execute */
  codeBlock: string;
  /** Parameters to pass to the language interpreter */
  languageParams?: string[];
  /** Optional metadata about the command */
  metadata?: CommandMetadata;
}

/**
 * Metadata for command definitions
 */
interface CommandMetadata {
  /** Source file where the command was defined */
  sourceFile?: string;
  /** Line number where the command was defined */
  lineNumber?: number;
  /** Description of the command's purpose */
  description?: string;
  /** When the command was defined */
  definedAt?: Date;
}
```

### Justification:
1. **Type Safety**: Using a discriminated union with the `type` property ensures the ResolutionService can safely distinguish between basic and language commands without manual type checking.
2. **Improved Command Handling**: The `resolveCommand` method can now properly validate and process commands based on their specific type requirements.
3. **Error Prevention**: Prevents incorrect access to properties that might not exist for certain command types.
4. **Self-Documentation**: Makes the structure of commands explicit, improving code readability and maintenance.
5. **Parameter Validation**: Enables validation that the number of arguments passed matches the expected parameters.

## 2. Command Resolution Context Type Enhancements

### Current Issues:
- The `ResolutionContext` interface doesn't have specific properties for command resolution
- There's no way to pass command-specific options through the context
- Error handling for command resolution is generic rather than tailored to specific command types

### Proposed Solution:

```typescript
/**
 * Enhanced ResolutionContext with command-specific options
 */
interface EnhancedResolutionContext extends ResolutionContext {
  /** Command-specific resolution options */
  commandResolution?: {
    /** Whether to capture command output or allow it to show in the console */
    captureOutput: boolean;
    /** Environment variables to pass to the command */
    env?: Record<string, string>;
    /** Working directory for command execution */
    cwd?: string;
    /** Maximum execution time in milliseconds */
    timeout?: number;
    /** How to handle command errors */
    errorMode?: 'throw' | 'return' | 'ignore';
    /** For language commands, additional interpreter options */
    interpreterOptions?: {
      /** Node.js options for JavaScript commands */
      nodeOptions?: string[];
      /** Python interpreter options */
      pythonOptions?: string[];
      /** Bash options */
      bashOptions?: string[];
    };
  };
}
```

### Justification:
1. **Context-Aware Execution**: Allows command execution to be tailored to the specific context in which it's being used.
2. **Improved Error Handling**: The `errorMode` property lets callers decide how command failures should be handled.
3. **Security Enhancement**: By explicitly defining what options can be passed, we reduce the risk of command injection or other security issues.
4. **Performance Control**: The `timeout` property prevents long-running commands from blocking execution.
5. **Flexibility**: Provides a structured way to extend command behavior without modifying the core ResolutionService code.

## 3. Command Reference Parsing Type

### Current Issues:
- Command reference parsing in `resolveInContext` uses a regex without strong typing
- The parsed command name and arguments lack validation against the command definition
- There's no clear structure for representing a command reference

### Proposed Solution:

```typescript
/**
 * Structure representing a parsed command reference
 */
interface CommandReference {
  /** The name of the command to execute */
  commandName: string;
  /** The arguments to pass to the command */
  args: string[];
  /** The original reference string for error reporting */
  originalReference: string;
}

/**
 * Function to parse a command reference with stronger typing
 */
function parseCommandReference(value: string): CommandReference | null {
  const commandRegex = /^\$(\w+)\(([^)]*)\)$/;
  const commandMatch = value.match(commandRegex);
  
  if (!commandMatch) {
    return null;
  }
  
  const [originalReference, commandName, argsStr] = commandMatch;
  // Parse args, splitting by comma but respecting quoted strings
  const args = parseCommandArgs(argsStr);
  
  return {
    commandName,
    args,
    originalReference
  };
}

/**
 * Parse command arguments, respecting quoted strings
 */
function parseCommandArgs(argsStr: string): string[] {
  // Implementation that properly handles quoted strings, escapes, etc.
  // ...
}
```

### Justification:
1. **Structured Parsing**: Replaces ad-hoc regex parsing with a structured approach that returns a well-defined type.
2. **Improved Error Reporting**: The `originalReference` property makes it easier to report errors with the exact input that failed.
3. **Reusability**: The parsing logic can be reused in multiple places, ensuring consistent behavior.
4. **Validation Opportunity**: With a structured type, we can add validation against the command definition before execution.
5. **Extensibility**: Makes it easier to extend command reference syntax in the future while maintaining backward compatibility.

## 4. Define Directive Structure Type

### Current Issues:
- The `stateService.getCommand()` method returns an untyped object that requires manual property checking
- There's no clear interface defining what properties a `@define` directive should store
- Command parameter handling is done through string manipulation without type validation

### Proposed Solution:

```typescript
/**
 * Structure of a define directive stored in state
 */
interface DefineDirectiveDefinition {
  /** The name of the defined command */
  name: string;
  /** The command definition (either basic or language) */
  definition: CommandDefinition;
  /** Source information for debugging and error reporting */
  source: {
    /** File where the define directive was declared */
    file?: string;
    /** Line number in the source file */
    line?: number;
    /** The original directive text */
    originalText?: string;
  };
}

/**
 * Parameter substitution options for command execution
 */
interface ParameterSubstitutionOptions {
  /** Whether to throw on missing parameters */
  strictParameterMatching?: boolean;
  /** Default values for parameters */
  defaults?: Record<string, string>;
  /** Whether to allow extra arguments */
  allowExtraArguments?: boolean;
}
```

### Justification:
1. **Clear Contract**: Establishes a clear structure for what a define directive should contain.
2. **Source Tracking**: Adds source information for better error reporting and debugging.
3. **Parameter Validation**: Enables strict checking of parameter counts and types before execution.
4. **Default Values**: Provides a structured way to specify default values for optional parameters.
5. **Consistent State**: Ensures the state service stores define directives in a consistent format.

##